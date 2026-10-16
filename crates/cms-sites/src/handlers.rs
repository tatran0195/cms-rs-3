use std::sync::Arc;

use axum::{
    extract::{Extension, Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{Html, IntoResponse, Response},
};
use cms_db::{deployment::DeploymentQueries, domain::DomainQueries, project::ProjectQueries};
use cms_entity::deployment::DeploymentSnapshotContent;
use cms_error::AppError;

use crate::{
    host_resolution::{ClientIp, HostResolutionResult, HostResolver},
    markdown_renderer::{HighlightTheme, MarkdownRenderer, MarkdownRendererConfig},
    routes::site_host,
    security::SiteSecurityHeaders,
    seo::{SeoGenerator, SitemapGenerator, SitemapPageMetadata},
    spa::serve_spa_file,
    static_files::StaticFileServer,
    SitesAppState,
};

/// Record a successful HTTPS request only when it carries the secret injected by
/// the configured TLS-terminating proxy. The proxy remains responsible for
/// ACME issuance and renewal; this observation is operational status only.
pub async fn record_trusted_tls_observation(
    state: &Arc<SitesAppState>,
    headers: &HeaderMap,
    client_ip: Option<std::net::IpAddr>,
    resolution: &HostResolutionResult,
) {
    if !resolution.is_custom_domain {
        return;
    }

    let trusted_proxies = if !state.config.site.trusted_proxies.is_empty() {
        crate::host_resolution::parse_trusted_proxies(&state.config.site.trusted_proxies)
    } else {
        crate::host_resolution::parse_trusted_proxies(&state.config.server.trusted_proxies)
    };
    if !trusted_proxies.is_empty() {
        let is_trusted =
            client_ip.is_some_and(|ip| trusted_proxies.iter().any(|net| net.contains(&ip)));
        if !is_trusted {
            return;
        }
    }

    if !headers
        .get("x-forwarded-proto")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|scheme| scheme.eq_ignore_ascii_case("https"))
    {
        return;
    }

    let Some(expected_secret) = state.config.domain_tls.proxy_secret.as_deref() else {
        return;
    };
    let trusted = headers
        .get("x-cms-proxy-token")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|provided| provided == expected_secret);
    if !trusted {
        return;
    }

    let Some(domain_id) = resolution.domain_id.as_deref() else {
        return;
    };
    if let Err(error) = DomainQueries::mark_tls_active(&state.pool, domain_id).await {
        // TLS status reporting must never take down a successfully published site.
        tracing::warn!(%error, domain_id, "failed to record trusted TLS observation");
    }
}

/// The immutable public view of a successfully deployed documentation site.
/// Editor tables are deliberately not used to render published pages.
pub struct PublishedSiteSnapshot {
    pub project: cms_entity::project::Project,
    pub deployment_id: String,
    pub branch_id: String,
    pub branch_slug: String,
    pub language_id: String,
    pub language_code: String,
    pub language_is_rtl: bool,
}

pub async fn load_published_site_snapshot(
    state: &Arc<SitesAppState>,
    project_id: &str,
    preferred_deployment_id: Option<&str>,
    requested_lang: Option<&str>,
) -> Result<PublishedSiteSnapshot, AppError> {
    // Public visibility can be revoked immediately, even though old snapshots
    // remain retained for rollback and audit history.
    let current_project = ProjectQueries::get_by_id(&state.pool, project_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Project not found".to_string()))?;
    if !current_project.is_public
        || cms_db::project::ProjectQueries::is_taken_down(&state.pool, project_id)
            .await?
            .unwrap_or(false)
    {
        return Err(AppError::NotFound("Published site not found".to_string()));
    }

    let snapshot = if let Some(preferred_deployment_id) = preferred_deployment_id {
        DeploymentQueries::get_snapshot_by_deployment(&state.pool, preferred_deployment_id)
            .await?
            .filter(|snapshot| snapshot.project_id == project_id)
            .ok_or_else(|| AppError::NotFound("Domain release is not published".to_string()))?
    } else {
        let releases =
            DeploymentQueries::get_latest_branch_releases(&state.pool, project_id).await?;
        let default_release = releases
            .iter()
            .find(|release| release.is_default)
            .or_else(|| releases.first())
            .ok_or_else(|| AppError::NotFound("No published release found".to_string()))?;
        DeploymentQueries::get_snapshot_by_deployment(&state.pool, &default_release.deployment_id)
            .await?
            .filter(|snapshot| snapshot.project_id == project_id)
            .ok_or_else(|| AppError::NotFound("Published release not found".to_string()))?
    };
    let deployment_id = snapshot.deployment_id.clone();
    let content: DeploymentSnapshotContent = serde_json::from_value(snapshot.snapshot)?;
    if content.project.id != project_id
        || content.branch.id != snapshot.branch_id
        || content.branch.project_id != project_id
    {
        return Err(AppError::Conflict(
            "Published snapshot scope does not match the requested site".to_string(),
        ));
    }

    let selected_language = if let Some(lang) = requested_lang {
        content
            .languages
            .iter()
            .find(|language| {
                (language.code.eq_ignore_ascii_case(lang) || language.id == lang)
                    && language.enabled
            })
            .ok_or_else(|| {
                AppError::NotFound(format!("Language '{}' not found or disabled", lang))
            })?
    } else {
        content
            .languages
            .iter()
            .find(|language| language.is_default && language.enabled)
            .or_else(|| content.languages.iter().find(|language| language.enabled))
            .ok_or_else(|| AppError::NotFound("Published language not found".to_string()))?
    };
    Ok(PublishedSiteSnapshot {
        project: content.project,
        deployment_id,
        branch_id: content.branch.id,
        branch_slug: content.branch.slug,
        language_id: selected_language.id.clone(),
        language_code: selected_language.code.clone(),
        language_is_rtl: selected_language.is_rtl,
    })
}

pub async fn load_published_site_page_listing(
    state: &Arc<SitesAppState>,
    site: &PublishedSiteSnapshot,
) -> Result<Vec<cms_db::deployment::DeploymentSnapshotPageListing>, AppError> {
    DeploymentQueries::get_snapshot_page_listing(
        &state.pool,
        &site.deployment_id,
        &site.language_id,
    )
    .await
}

/// Get markdown renderer from app state
pub fn get_markdown_renderer(_state: &Arc<SitesAppState>) -> MarkdownRenderer {
    let config = MarkdownRendererConfig {
        enable_syntax_highlighting: true,
        enable_toc: true,
        enable_footnotes: true,
        enable_task_lists: true,
        enable_strikethrough: true,
        enable_emoji: true,
        highlight_theme: HighlightTheme::default(),
        enable_heading_ids: true,
        base_url: "/".to_string(),
    };
    MarkdownRenderer::new(config)
}

pub fn site_base_url(
    state: &Arc<SitesAppState>,
    resolution: &HostResolutionResult,
    project: &cms_entity::project::Project,
) -> String {
    if resolution.is_custom_domain {
        format!("https://{}", resolution.hostname)
    } else {
        format!("https://{}.{}", project.slug, site_host(state))
    }
}

pub fn get_seo_generator(base_url: &str) -> SeoGenerator {
    SeoGenerator::new(base_url.to_string())
}

/// Root handler - resolves host and serves appropriate content
pub async fn root_handler(
    State(state): State<Arc<SitesAppState>>,
    Extension(host_resolver): Extension<Arc<HostResolver>>,
    ClientIp(client_ip): ClientIp,
    Query(query): Query<std::collections::HashMap<String, String>>,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let requested_lang = query.get("lang").map(|s| s.as_str());

    // Resolve host to project using the router-scoped cache.
    let resolution = host_resolver.resolve(&headers, client_ip).await?;
    if let Some(result) = resolution.as_ref() {
        record_trusted_tls_observation(&state, &headers, client_ip, result).await;
    }

    match resolution {
        Some(result) => serve_project_index(&state, &result, None, requested_lang).await,
        None => Ok(serve_spa_file("index.html").await),
    }
}

/// Wildcard handler for all paths
pub async fn wildcard_handler(
    State(state): State<Arc<SitesAppState>>,
    Extension(host_resolver): Extension<Arc<HostResolver>>,
    ClientIp(client_ip): ClientIp,
    Query(query): Query<std::collections::HashMap<String, String>>,
    headers: HeaderMap,
    Path(path): Path<String>,
) -> Result<Response, AppError> {
    let requested_lang = query.get("lang").map(|s| s.as_str());

    // Check if the path targets the published sites viewer (/sites/{projectId}/**)
    if let Some(sites_path) = path
        .strip_prefix("sites/")
        .or_else(|| (path == "sites").then_some(""))
    {
        let clean = sites_path.trim_matches('/');
        if clean.is_empty() {
            return Ok(serve_not_found());
        }

        let mut parts = clean.splitn(2, '/');
        let project_ref = parts.next().unwrap_or("");
        let raw_doc_path = parts.next().unwrap_or("");

        let project = match ProjectQueries::get_by_id(&state.pool, project_ref).await? {
            Some(p) => Some(p),
            None => ProjectQueries::get_by_slug_global(&state.pool, project_ref).await?,
        };

        let Some(project) = project else {
            return Ok(serve_not_found());
        };

        if !project.is_public
            || cms_db::project::ProjectQueries::is_taken_down(&state.pool, &project.id)
                .await?
                .unwrap_or(false)
        {
            return Ok(serve_not_found());
        }

        let resolution = HostResolutionResult {
            project_id: project.id.clone(),
            deployment_id: None,
            domain_id: None,
            is_custom_domain: false,
            hostname: format!("sites/{}", project.id),
        };

        let releases =
            DeploymentQueries::get_latest_branch_releases(&state.pool, &project.id).await?;
        if releases.is_empty() {
            return Ok(serve_not_found());
        }

        let first_seg = raw_doc_path.split('/').next().unwrap_or("");
        let (preferred_deployment, doc_path) = if let Some(matched_rel) = releases
            .iter()
            .find(|r| r.branch_slug.as_str() == first_seg)
        {
            let remaining = raw_doc_path
                .strip_prefix(first_seg)
                .unwrap_or("")
                .trim_matches('/');
            (Some(matched_rel.deployment_id.as_str()), remaining)
        } else {
            (None, raw_doc_path.trim_matches('/'))
        };

        if doc_path == "robots.txt" {
            let base_url = format!("/sites/{}", project.id);
            let robots = format!(
                "User-agent: *\nAllow: /\nSitemap: {}/sitemap.xml\n\nDisallow: /api/\nDisallow: /admin/\nDisallow: /private/\n",
                base_url
            );
            return Ok((
                StatusCode::OK,
                [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
                robots,
            )
                .into_response());
        }

        if doc_path == "sitemap.xml" {
            let site = match load_published_site_snapshot(
                &state,
                &project.id,
                preferred_deployment,
                requested_lang,
            )
            .await
            {
                Ok(s) => s,
                Err(_) => return Ok(serve_not_found()),
            };
            let pages = match load_published_site_page_listing(&state, &site).await {
                Ok(p) => p,
                Err(_) => return Ok(serve_not_found()),
            };
            let base_url = format!("/sites/{}", project.id);
            let sitemap_gen = SitemapGenerator::new(base_url);
            let meta_pages: Vec<SitemapPageMetadata> = pages
                .iter()
                .map(|p| SitemapPageMetadata {
                    path: p.path.clone(),
                    updated_at: p.updated_at,
                })
                .collect();
            let xml = sitemap_gen.generate_project_sitemap_from_metadata(&site.project, &meta_pages);
            return Ok((
                StatusCode::OK,
                [(header::CONTENT_TYPE, "application/xml; charset=utf-8")],
                xml,
            )
                .into_response());
        }

        if doc_path.is_empty() {
            return serve_project_index(&state, &resolution, preferred_deployment, requested_lang)
                .await;
        } else {
            return serve_page(
                &state,
                &resolution,
                doc_path,
                preferred_deployment,
                requested_lang,
            )
            .await;
        }
    }

    // Resolve host to project using the router-scoped cache.
    let resolution = host_resolver.resolve(&headers, client_ip).await?;
    if let Some(result) = resolution.as_ref() {
        record_trusted_tls_observation(&state, &headers, client_ip, result).await;
    }

    match resolution {
        Some(result) => {
            let clean_path = path.trim_matches('/');
            let releases =
                DeploymentQueries::get_latest_branch_releases(&state.pool, &result.project_id)
                    .await?;
            let first_seg = clean_path.split('/').next().unwrap_or("");
            let (preferred_deployment, doc_path) = if let Some(matched_rel) = releases
                .iter()
                .find(|r| r.branch_slug.as_str() == first_seg)
            {
                let remaining = clean_path
                    .strip_prefix(first_seg)
                    .unwrap_or("")
                    .trim_matches('/');
                (Some(matched_rel.deployment_id.as_str()), remaining)
            } else {
                (result.deployment_id.as_deref(), clean_path)
            };

            if doc_path.is_empty() {
                serve_project_index(&state, &result, preferred_deployment, requested_lang).await
            } else {
                serve_page(
                    &state,
                    &result,
                    doc_path,
                    preferred_deployment,
                    requested_lang,
                )
                .await
            }
        }
        None => Ok(serve_spa_file(&path).await),
    }
}

/// Serve project index page
pub async fn serve_project_index(
    state: &Arc<SitesAppState>,
    resolution: &HostResolutionResult,
    preferred_deployment_id: Option<&str>,
    requested_lang: Option<&str>,
) -> Result<Response, AppError> {
    let site = match load_published_site_snapshot(
        state,
        &resolution.project_id,
        preferred_deployment_id.or(resolution.deployment_id.as_deref()),
        requested_lang,
    )
    .await
    {
        Ok(site) => site,
        Err(AppError::NotFound(_)) => return Ok(serve_not_found()),
        Err(err) => return Err(err),
    };

    let pages = match load_published_site_page_listing(state, &site).await {
        Ok(pages) => pages,
        Err(AppError::NotFound(_)) => return Ok(serve_not_found()),
        Err(err) => return Err(err),
    };

    // Find the root page (index or home) from metadata, then fetch only that
    // one body. Listing views never pull page-content JSON from PostgreSQL.
    let root_page_id = pages
        .iter()
        .find(|page| page.path == "/" || page.path == "/index" || page.path == "index")
        .or_else(|| {
            pages.iter().find(|page| {
                page.parent_id.is_none()
                    && (page.slug == "index" || page.slug == "home" || page.slug == "readme")
            })
        })
        .or_else(|| {
            pages
                .iter()
                .find(|page| page.parent_id.is_none())
        })
        .or_else(|| pages.first())
        .map(|page| page.page_id.clone());

    let base_url = site_base_url(state, resolution, &site.project);
    let link_prefix = if resolution.hostname.starts_with("sites/") {
        format!("/sites/{}", site.project.id)
    } else {
        String::new()
    };

    match root_page_id {
        Some(page_id) => {
            let page =
                DeploymentQueries::get_snapshot_page(&state.pool, &site.deployment_id, &page_id)
                    .await?
                    .filter(|page| page.is_published && page.kind.eq_ignore_ascii_case("PAGE"));
            let Some(page) = page else {
                let html = render_project_listing(
                    &site.project,
                    &pages,
                    &base_url,
                    &link_prefix,
                    &site.language_code,
                    site.language_is_rtl,
                )?;
                return Ok(Html(html).into_response());
            };
            let html = render_page(
                state,
                &page,
                &site.project,
                &base_url,
                &site.language_code,
                site.language_is_rtl,
            )
            .await?;
            Ok(Html(html).into_response())
        }
        None => {
            // No root page found, show listing
            let html = render_project_listing(
                &site.project,
                &pages,
                &base_url,
                &link_prefix,
                &site.language_code,
                site.language_is_rtl,
            )?;
            Ok(Html(html).into_response())
        }
    }
}

/// Serve specific page
pub async fn serve_page(
    state: &Arc<SitesAppState>,
    resolution: &HostResolutionResult,
    path: &str,
    preferred_deployment_id: Option<&str>,
    requested_lang: Option<&str>,
) -> Result<Response, AppError> {
    let site = match load_published_site_snapshot(
        state,
        &resolution.project_id,
        preferred_deployment_id.or(resolution.deployment_id.as_deref()),
        requested_lang,
    )
    .await
    {
        Ok(site) => site,
        Err(AppError::NotFound(_)) => return Ok(serve_not_found()),
        Err(err) => return Err(err),
    };

    let clean_path = path.trim_matches('/');
    if clean_path.is_empty() {
        return serve_project_index(state, resolution, preferred_deployment_id, requested_lang)
            .await;
    }

    // 1. Try finding page directly by clean_path
    let mut page = DeploymentQueries::get_snapshot_page_by_path(
        &state.pool,
        &site.deployment_id,
        &site.language_id,
        clean_path,
    )
    .await?
    .filter(|page| page.is_published);

    // 2. If not found, try stripping branch slug prefix (e.g. "main/doc" -> "doc")
    if page.is_none() && !site.branch_slug.is_empty() {
        if let Some(stripped) = clean_path.strip_prefix(&format!("{}/", site.branch_slug)) {
            let stripped_clean = stripped.trim_matches('/');
            if stripped_clean.is_empty() {
                return serve_project_index(
                    state,
                    resolution,
                    preferred_deployment_id,
                    requested_lang,
                )
                .await;
            }
            page = DeploymentQueries::get_snapshot_page_by_path(
                &state.pool,
                &site.deployment_id,
                &site.language_id,
                stripped_clean,
            )
            .await?
            .filter(|page| page.is_published);
        }
    }

    // 3. If still not found, check if clean_path represents a group/section in the page listing
    if page.is_none() {
        if let Ok(pages) = load_published_site_page_listing(state, &site).await {
            let group_prefix = format!("{}/", clean_path);
            let child_page = pages
                .iter()
                .filter(|p| {
                    p.path.trim_matches('/').starts_with(&group_prefix)
                        || p.parent_id.as_deref() == Some(clean_path)
                })
                .min_by(|a, b| a.path.cmp(&b.path));
            if let Some(child) = child_page {
                page = DeploymentQueries::get_snapshot_page(
                    &state.pool,
                    &site.deployment_id,
                    &child.page_id,
                )
                .await?;
            }
        }
    }

    match page {
        Some(page) => {
            let base_url = site_base_url(state, resolution, &site.project);
            let html = render_page(
                state,
                &page,
                &site.project,
                &base_url,
                &site.language_code,
                site.language_is_rtl,
            )
            .await?;
            Ok(Html(html).into_response())
        }
        None => Ok(serve_not_found()),
    }
}

pub fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// Render a page to HTML
pub async fn render_page(
    state: &Arc<SitesAppState>,
    page: &cms_entity::page::Page,
    project: &cms_entity::project::Project,
    base_url: &str,
    language_code: &str,
    language_is_rtl: bool,
) -> Result<String, AppError> {
    let markdown_renderer = get_markdown_renderer(state);
    let seo_generator = get_seo_generator(base_url);

    // Generate SEO metadata
    let metadata = seo_generator.generate_page_metadata(page, project);
    let seo_tags = seo_generator.generate_meta_tags(&metadata);
    let structured_data = seo_generator.generate_structured_data(&metadata, true);

    // Render markdown to HTML content
    let content = markdown_renderer.render_markdown(&page.content);

    let page_title = escape_html(&page.title);
    let page_description = escape_html(page.description.as_deref().unwrap_or(""));
    let project_name = escape_html(&project.name);
    let dir = if language_is_rtl { "rtl" } else { "ltr" };

    // Generate full HTML
    let html = format!(
        r#"<!DOCTYPE html>
<html lang="{}" dir="{}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{} - {}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }}
        pre {{
            border-radius: 6px;
            overflow-x: auto;
            font-size: 0.9em;
        }}
        pre[style] {{
            padding: 1em;
        }}
        code {{
            background: #f4f4f4;
            padding: 2px 5px;
            border-radius: 3px;
            font-size: 0.9em;
        }}
        table {{
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
        }}
        th, td {{
            border: 1px solid #ddd;
            padding: 8px;
        }}
        th {{
            background: #f4f4f4;
            text-align: left;
        }}
        img {{
            max-width: 100%;
            height: auto;
        }}
        a {{
            color: #0066cc;
            text-decoration: none;
        }}
        a:hover {{
            text-decoration: underline;
        }}
    </style>
{}
{}
{}
</head>
<body>
    <article dir="{}">
        <header>
            <h1>{}</h1>
            <p>{}</p>
        </header>
        <main>
{}
        </main>
        <footer>
            <hr>
            <p>Powered by CMS</p>
        </footer>
    </article>
</body>
</html>"#,
        language_code,
        dir,
        page_title,
        project_name,
        seo_tags,
        structured_data,
        get_security_headers(),
        dir,
        page_title,
        page_description,
        content
    );

    Ok(html)
}

/// Render project listing page
pub fn render_project_listing(
    project: &cms_entity::project::Project,
    pages: &[cms_db::deployment::DeploymentSnapshotPageListing],
    base_url: &str,
    link_prefix: &str,
    language_code: &str,
    language_is_rtl: bool,
) -> Result<String, AppError> {
    let seo_generator = get_seo_generator(base_url);

    // Generate SEO metadata
    let metadata = seo_generator.generate_project_metadata(project);
    let seo_tags = seo_generator.generate_meta_tags(&metadata);
    let structured_data = seo_generator.generate_structured_data(&metadata, false);

    // Generate page list using the nested path saved in the release.
    let mut page_list = String::new();
    for page in pages {
        let clean = page.path.trim_matches('/');
        let href = if link_prefix.is_empty() {
            format!("/{}", clean)
        } else {
            format!("{}/{}", link_prefix.trim_end_matches('/'), clean)
        };
        page_list.push_str(&format!(
            "<li><a href=\"{}\">{}</a></li>\n",
            escape_html(&href),
            escape_html(&page.title)
        ));
    }

    // Generate full HTML. Escape user-controlled project metadata before
    // interpolating it into text nodes.
    let project_name = escape_html(&project.name);
    let project_description = escape_html(project.description.as_deref().unwrap_or(""));
    let dir = if language_is_rtl { "rtl" } else { "ltr" };
    let html = format!(
        r#"<!DOCTYPE html>
<html lang="{}" dir="{}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }}
        a {{
            color: #0066cc;
            text-decoration: none;
        }}
        a:hover {{
            text-decoration: underline;
        }}
    </style>
{}
{}
{}
</head>
<body>
    <article dir="{}">
        <header>
            <h1>{}</h1>
            <p>{}</p>
        </header>
        <main>
            <h2>Pages</h2>
            <ul>
{}
            </ul>
        </main>
        <footer>
            <hr>
            <p>Powered by CMS</p>
        </footer>
    </article>
</body>
</html>"#,
        language_code,
        dir,
        project_name,
        seo_tags,
        structured_data,
        get_security_headers(),
        dir,
        project_name,
        project_description,
        page_list
    );

    Ok(html)
}

/// Get security headers for published sites
pub fn get_security_headers() -> String {
    let security = SiteSecurityHeaders::default();
    let mut headers = String::new();

    for (name, value) in security.get_headers() {
        if name.eq_ignore_ascii_case("x-frame-options") {
            continue;
        }
        headers.push_str(&format!(
            "<meta http-equiv=\"{}\" content=\"{}\">\n",
            name, value
        ));
    }

    headers
}

/// Return 404 Not Found response
pub fn serve_not_found() -> Response {
    let html = r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>404 - Not Found</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            text-align: center;
            padding: 50px;
        }
        h1 {
            font-size: 50px;
            margin-bottom: 10px;
        }
        p {
            font-size: 20px;
            color: #666;
        }
        a {
            color: #0066cc;
            text-decoration: none;
        }
    </style>
</head>
<body>
    <h1>404</h1>
    <p>Page not found</p>
</body>
</html>"#;
    (
        StatusCode::NOT_FOUND,
        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
        html,
    )
        .into_response()
}

/// Robots.txt handler - generates custom robots.txt per project
pub async fn robots_txt_handler(
    State(state): State<Arc<SitesAppState>>,
    Extension(host_resolver): Extension<Arc<HostResolver>>,
    ClientIp(client_ip): ClientIp,
    headers: HeaderMap,
) -> Result<String, AppError> {
    match host_resolver.resolve(&headers, client_ip).await? {
        Some(result) => {
            let site = load_published_site_snapshot(
                &state,
                &result.project_id,
                result.deployment_id.as_deref(),
                None,
            )
            .await?;

            // Generate robots.txt only for a project with a visible release.
            let base_url = if result.is_custom_domain {
                format!("https://{}", result.hostname)
            } else {
                format!("https://{}.{}", site.project.slug, site_host(&state))
            };
            Ok(format!(
                "User-agent: *\nAllow: /\nSitemap: {}/sitemap.xml\n\nDisallow: /api/\nDisallow: \
                 /admin/\nDisallow: /private/\n",
                base_url
            ))
        }
        None => {
            // Default robots.txt
            Ok(
                "User-agent: *\nAllow: /\nSitemap: /sitemap.xml\n\nDisallow: /api/\nDisallow: \
                 /admin/\nDisallow: /private/\n"
                    .to_string(),
            )
        }
    }
}

/// Sitemap.xml handler - generates URLs from the active immutable release.
pub async fn sitemap_xml_handler(
    State(state): State<Arc<SitesAppState>>,
    Extension(host_resolver): Extension<Arc<HostResolver>>,
    ClientIp(client_ip): ClientIp,
    headers: HeaderMap,
) -> Result<String, AppError> {
    match host_resolver.resolve(&headers, client_ip).await? {
        Some(result) => {
            let site = load_published_site_snapshot(
                &state,
                &result.project_id,
                result.deployment_id.as_deref(),
                None,
            )
            .await?;

            let base_url = if result.is_custom_domain {
                format!("https://{}", result.hostname)
            } else {
                format!("https://{}.{}", site.project.slug, site_host(&state))
            };

            let pages = load_published_site_page_listing(&state, &site).await?;
            let sitemap_pages = pages
                .into_iter()
                .map(|page| SitemapPageMetadata {
                    path: page.path,
                    updated_at: page.updated_at,
                })
                .collect::<Vec<_>>();
            let sitemap_gen = SitemapGenerator::new(base_url);
            Ok(sitemap_gen.generate_project_sitemap_from_metadata(&site.project, &sitemap_pages))
        }
        None => {
            // Default empty sitemap
            Ok("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n</urlset>".to_string())
        }
    }
}

/// Security.txt handler
pub async fn security_txt_handler() -> String {
    "Contact: security@cms.com\nAcknowledgments: https://cms.com/security/acknowledgments\nPolicy: https://cms.com/security/policy\nHiring: https://cms.com/jobs".to_string()
}

/// Asset handler for published site assets
pub async fn asset_handler(
    State(state): State<Arc<SitesAppState>>,
    Path(path): Path<String>,
) -> Result<Response, StatusCode> {
    let candidate = format!("assets/{}", path);
    let spa_res = serve_spa_file(&candidate).await;
    if spa_res.status() == StatusCode::OK
        && spa_res
            .headers()
            .get(header::CONTENT_TYPE)
            .map(|v| v != "text/html; charset=utf-8")
            .unwrap_or(false)
    {
        return Ok(spa_res);
    }
    let static_server = StaticFileServer::new(state.storage.clone());
    static_server.serve_file(&candidate).await
}

/// CSS handler
pub async fn css_handler(
    State(state): State<Arc<SitesAppState>>,
    Path(path): Path<String>,
) -> Result<Response, StatusCode> {
    let candidate = format!("css/{}", path);
    let spa_res = serve_spa_file(&candidate).await;
    if spa_res.status() == StatusCode::OK
        && spa_res
            .headers()
            .get(header::CONTENT_TYPE)
            .map(|v| v != "text/html; charset=utf-8")
            .unwrap_or(false)
    {
        return Ok(spa_res);
    }
    let static_server = StaticFileServer::new(state.storage.clone());
    static_server.serve_file(&candidate).await
}

/// JavaScript handler
pub async fn js_handler(
    State(state): State<Arc<SitesAppState>>,
    Path(path): Path<String>,
) -> Result<Response, StatusCode> {
    let candidate = format!("js/{}", path);
    let spa_res = serve_spa_file(&candidate).await;
    if spa_res.status() == StatusCode::OK
        && spa_res
            .headers()
            .get(header::CONTENT_TYPE)
            .map(|v| v != "text/html; charset=utf-8")
            .unwrap_or(false)
    {
        return Ok(spa_res);
    }
    let static_server = StaticFileServer::new(state.storage.clone());
    static_server.serve_file(&candidate).await
}

/// Font handler
pub async fn font_handler(
    State(state): State<Arc<SitesAppState>>,
    Path(path): Path<String>,
) -> Result<Response, StatusCode> {
    let candidate = format!("fonts/{}", path);
    let spa_res = serve_spa_file(&candidate).await;
    if spa_res.status() == StatusCode::OK
        && spa_res
            .headers()
            .get(header::CONTENT_TYPE)
            .map(|v| v != "text/html; charset=utf-8")
            .unwrap_or(false)
    {
        return Ok(spa_res);
    }
    let static_server = StaticFileServer::new(state.storage.clone());
    static_server.serve_file(&candidate).await
}

/// Image handler
pub async fn image_handler(
    State(state): State<Arc<SitesAppState>>,
    Path(path): Path<String>,
) -> Result<Response, StatusCode> {
    let candidate = format!("images/{}", path);
    let spa_res = serve_spa_file(&candidate).await;
    if spa_res.status() == StatusCode::OK
        && spa_res
            .headers()
            .get(header::CONTENT_TYPE)
            .map(|v| v != "text/html; charset=utf-8")
            .unwrap_or(false)
    {
        return Ok(spa_res);
    }
    let static_server = StaticFileServer::new(state.storage.clone());
    static_server.serve_file(&candidate).await
}

/// Favicon handler
pub async fn favicon_handler(
    State(state): State<Arc<SitesAppState>>,
) -> Result<Response, StatusCode> {
    let spa_res = serve_spa_file("favicon.ico").await;
    if spa_res.status() == StatusCode::OK
        && spa_res
            .headers()
            .get(header::CONTENT_TYPE)
            .map(|v| v != "text/html; charset=utf-8")
            .unwrap_or(false)
    {
        return Ok(spa_res);
    }
    let static_server = StaticFileServer::new(state.storage.clone());
    static_server.serve_file("favicon.ico").await
}

/// 32x32 favicon handler
pub async fn favicon_32_handler(
    State(state): State<Arc<SitesAppState>>,
) -> Result<Response, StatusCode> {
    let spa_res = serve_spa_file("favicon-32x32.png").await;
    if spa_res.status() == StatusCode::OK
        && spa_res
            .headers()
            .get(header::CONTENT_TYPE)
            .map(|v| v != "text/html; charset=utf-8")
            .unwrap_or(false)
    {
        return Ok(spa_res);
    }
    let static_server = StaticFileServer::new(state.storage.clone());
    static_server.serve_file("favicon-32x32.png").await
}

/// 16x16 favicon handler
pub async fn favicon_16_handler(
    State(state): State<Arc<SitesAppState>>,
) -> Result<Response, StatusCode> {
    let spa_res = serve_spa_file("favicon-16x16.png").await;
    if spa_res.status() == StatusCode::OK
        && spa_res
            .headers()
            .get(header::CONTENT_TYPE)
            .map(|v| v != "text/html; charset=utf-8")
            .unwrap_or(false)
    {
        return Ok(spa_res);
    }
    let static_server = StaticFileServer::new(state.storage.clone());
    static_server.serve_file("favicon-16x16.png").await
}

/// Apple touch icon handler
pub async fn apple_touch_icon_handler(
    State(state): State<Arc<SitesAppState>>,
) -> Result<Response, StatusCode> {
    let spa_res = serve_spa_file("apple-touch-icon.png").await;
    if spa_res.status() == StatusCode::OK
        && spa_res
            .headers()
            .get(header::CONTENT_TYPE)
            .map(|v| v != "text/html; charset=utf-8")
            .unwrap_or(false)
    {
        return Ok(spa_res);
    }
    let static_server = StaticFileServer::new(state.storage.clone());
    static_server.serve_file("apple-touch-icon.png").await
}

/// Site manifest handler
pub async fn manifest_handler(
    State(state): State<Arc<SitesAppState>>,
    Extension(host_resolver): Extension<Arc<HostResolver>>,
    ClientIp(client_ip): ClientIp,
    headers: HeaderMap,
) -> Result<Response, AppError> {
    let manifest = match host_resolver.resolve(&headers, client_ip).await? {
        Some(result) => {
            let site = load_published_site_snapshot(
                &state,
                &result.project_id,
                result.deployment_id.as_deref(),
                None,
            )
            .await?;
            serde_json::json!({
                "name": site.project.name,
                "short_name": site.project.name,
                "description": site.project.description
                    .as_deref()
                    .unwrap_or("Documentation powered by CMS"),
                "start_url": "/",
                "display": "standalone",
                "background_color": "#ffffff",
                "theme_color": "#000000",
                "icons": [
                    {"src": "/apple-touch-icon.png", "sizes": "180x180", "type": "image/png"},
                    {"src": "/favicon-32x32.png", "sizes": "32x32", "type": "image/png"},
                    {"src": "/favicon-16x16.png", "sizes": "16x16", "type": "image/png"}
                ]
            })
        }
        None => {
            let spa_res = serve_spa_file("site.webmanifest").await;
            if spa_res.status() == StatusCode::OK {
                return Ok(spa_res);
            }
            serde_json::json!({
                "name": "CMS",
                "short_name": "CMS",
                "description": "Modern documentation platform",
                "start_url": "/",
                "display": "standalone",
                "background_color": "#ffffff",
                "theme_color": "#000000",
                "icons": [
                    {"src": "/apple-touch-icon.png", "sizes": "180x180", "type": "image/png"},
                    {"src": "/favicon-32x32.png", "sizes": "32x32", "type": "image/png"},
                    {"src": "/favicon-16x16.png", "sizes": "16x16", "type": "image/png"}
                ]
            })
        }
    };

    let body = serde_json::to_string_pretty(&manifest)?;
    let mut response = body.into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        header::HeaderValue::from_static("application/manifest+json"),
    );
    Ok(response)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_serve_not_found_returns_html_404() {
        let response = serve_not_found();
        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let content_type = response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        assert!(content_type.contains("text/html"));
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let body = String::from_utf8(bytes.to_vec()).unwrap();
        assert!(body.contains("404"));
        assert!(body.contains("Page not found"));
        assert!(!body.contains(r#"{"error":"#));
    }

    #[test]
    fn test_render_project_listing_respects_link_prefix() {
        let project = cms_entity::project::Project {
            id: "proj-123".to_string(),
            name: "Test Docs".to_string(),
            slug: "test-docs".to_string(),
            description: Some("Description".to_string()),
            icon: None,
            is_public: true,
            config: None,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };
        let pages = vec![cms_db::deployment::DeploymentSnapshotPageListing {
            page_id: "page-1".to_string(),
            path: "/architecture-overview".to_string(),
            title: "Architecture Overview".to_string(),
            slug: "architecture-overview".to_string(),
            parent_id: None,
            updated_at: chrono::Utc::now(),
        }];

        // With link_prefix (e.g. /sites/proj-123)
        let html_prefixed = render_project_listing(
            &project,
            &pages,
            "https://test-docs.localhost",
            "/sites/proj-123",
            "en",
            false,
        )
        .unwrap();
        assert!(html_prefixed.contains(r#"href="/sites/proj-123/architecture-overview""#));
        assert!(!html_prefixed.contains("https://cms.com"));
        assert!(html_prefixed.contains("Powered by CMS"));

        // Without link_prefix (custom domain)
        let html_bare = render_project_listing(
            &project,
            &pages,
            "https://test-docs.localhost",
            "",
            "en",
            false,
        )
        .unwrap();
        assert!(html_bare.contains(r#"href="/architecture-overview""#));
    }
}

