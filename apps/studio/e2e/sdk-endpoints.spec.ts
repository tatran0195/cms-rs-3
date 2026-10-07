import { test, expect } from '@playwright/test';
import { createCmsClient } from '@cms/sdk';
import { createAuthenticatedSession, type TestSession } from './helpers/test-auth';

test.describe('SDK & Studio App Endpoints Verification', () => {
  let session: TestSession;
  let client: ReturnType<typeof createCmsClient>;

  test.beforeAll(async ({ request }) => {
    session = await createAuthenticatedSession(request);
    client = createCmsClient({
      baseUrl: 'http://localhost:4310',
      headers: {
        Cookie: session.cookieHeader,
      },
    });
  });

  test('1. Auth Resource endpoints', async () => {
    // getSession
    const currentSession = await client.auth.getSession();
    expect(currentSession).toBeDefined();
    expect(currentSession?.user.email).toBe(session.email);

    // sendVerificationOtp
    const otpRes = await client.auth.sendVerificationOtp({
      email: session.email,
      type: 'sign-in',
    });
    expect(otpRes).toBeDefined();
  });

  test('2. Projects Resource lifecycle & settings', async () => {
    const projSlug = `test-proj-${Date.now()}`;
    const projName = `Playwright E2E Project ${Date.now()}`;

    // create project
    const project = await client.projects.create({
      name: projName,
      slug: projSlug,
      description: 'Created during Playwright E2E test',
    });
    expect(project).toBeDefined();
    expect(project.id).toBeDefined();
    expect(project.slug).toBeDefined();

    const projectId = project.id;

    // list projects
    const list = await client.projects.list();
    expect(Array.isArray(list)).toBe(true);
    expect(list.some((p: { id: string }) => p.id === projectId)).toBe(true);

    // get project detail
    const detail = await client.projects.get(projectId);
    expect(detail.id).toBe(projectId);

    // update project
    const updated = await client.projects.update(projectId, {
      name: `${projName} Updated`,
    });
    expect(updated.name).toBe(`${projName} Updated`);

    // get project settings
    const settings = await client.projects.getSettings(projectId);
    expect(settings).toBeDefined();

    // update project settings
    const updatedSettings = await client.projects.updateSettings(projectId, {
      theme: 'system',
      search_enabled: true,
    });
    expect(updatedSettings).toBeDefined();

    // get project usage
    const usage = await client.projects.getUsage(projectId);
    expect(usage).toBeDefined();

    // get project analytics
    const analytics = await client.projects.getAnalytics(projectId, { range: '7d' });
    expect(analytics).toBeDefined();

    // get project members
    const projMembers = await client.projects.getMembers(projectId);
    expect(projMembers).toBeDefined();

    // get theme template
    const themeTemplate = await client.projects.getThemeTemplate(projectId);
    expect(themeTemplate).toBeDefined();
  });

  test('3. Workspace Resource endpoints', async () => {
    // ensure an active project exists so workspace org context is established
    await client.projects.create({
      name: `WS Setup ${Date.now()}`,
      slug: `ws-setup-${Date.now()}`,
    });

    // get workspace
    const ws = await client.workspace.get();
    expect(ws).toBeDefined();

    // get workspace members
    const members = await client.workspace.getMembers();
    expect(members).toBeDefined();

    // get workspace analytics
    const analytics = await client.workspace.getAnalytics({ range: '30d' });
    expect(analytics).toBeDefined();

    // update workspace settings
    const updatedWs = await client.workspace.update({
      name: 'Playwright Workspace',
      allowedEmailDomains: ['test.local'],
    });
    expect(updatedWs).toBeDefined();
  });

  test('4. Pages Resource endpoints (CRUD & tree)', async () => {
    const project = await client.projects.create({
      name: `Pages Test ${Date.now()}`,
      slug: `pages-test-${Date.now()}`,
    });
    const projectId = project.id;

    // list pages (initially empty)
    const initialPages = await client.pages.list(projectId);
    expect(Array.isArray(initialPages)).toBe(true);

    // create page 1
    const page1 = await client.pages.create(projectId, {
      title: 'Introduction',
      slug: 'intro',
      content: '# Introduction\n\nWelcome to our docs.',
    });
    expect(page1.id).toBeDefined();
    expect(page1.title).toBe('Introduction');

    // create page 2
    const page2 = await client.pages.create(projectId, {
      title: 'Quickstart',
      slug: 'quickstart',
      content: '# Quickstart\n\nGet started quickly.',
    });
    expect(page2.id).toBeDefined();

    // get page detail
    const pageDetail = await client.pages.get(projectId, page1.id);
    expect(pageDetail.id).toBe(page1.id);
    expect(pageDetail.title).toBe('Introduction');

    // update page
    const updatedPage = await client.pages.update(projectId, page1.id, {
      title: 'Introduction (Revised)',
      content: '# Intro Updated',
    });
    expect(updatedPage.title).toBe('Introduction (Revised)');

    // reorder pages
    const reordered = await client.pages.reorder(projectId, {
      items: [
        { id: page2.id, position: 0 },
        { id: page1.id, position: 1 },
      ],
    });
    expect(reordered).toBeDefined();

    // delete page 2
    const deleteRes = await client.pages.delete(projectId, page2.id);
    expect(deleteRes).toBeDefined();

    // list pages again
    const finalPages = await client.pages.list(projectId);
    expect(finalPages.some((p: { id: string }) => p.id === page1.id)).toBe(true);
    expect(finalPages.some((p: { id: string }) => p.id === page2.id)).toBe(false);
  });

  test('5. Branches Resource endpoints', async () => {
    const project = await client.projects.create({
      name: `Branches Test ${Date.now()}`,
      slug: `branches-test-${Date.now()}`,
    });
    const projectId = project.id;

    // list branches
    const branches = await client.branches.list(projectId);
    expect(Array.isArray(branches)).toBe(true);

    // create branch
    const branchName = `feat-preview-${Date.now()}`;
    const newBranch = await client.branches.create(projectId, {
      name: branchName,
      project_id: projectId,
      projectId: projectId as any,
    } as any);
    expect(newBranch).toBeDefined();
    expect(newBranch.name).toBe(branchName);

    // list branches again
    const updatedBranches = await client.branches.list(projectId);
    expect(updatedBranches.some((b: { name: string }) => b.name === branchName)).toBe(true);

    // delete branch
    const delRes = await client.branches.delete(projectId, newBranch.id);
    expect(delRes).toBeDefined();
  });

  test('6. Languages Resource endpoints', async () => {
    const project = await client.projects.create({
      name: `Languages Test ${Date.now()}`,
      slug: `languages-test-${Date.now()}`,
    });
    const projectId = project.id;

    // list languages
    const languages = await client.languages.list(projectId);
    expect(Array.isArray(languages)).toBe(true);

    // create language
    const newLang = await client.languages.create(projectId, {
      code: 'vi',
      label: 'Tiếng Việt',
    });
    expect(newLang).toBeDefined();
    expect(newLang.code).toBe('vi');

    // update language
    const updatedLang = await client.languages.update(projectId, newLang.id, {
      label: 'Vietnamese',
    });
    expect(updatedLang.label).toBe('Vietnamese');

    // delete language
    const delRes = await client.languages.delete(projectId, newLang.id);
    expect(delRes).toBeDefined();
  });

  test('7. Deployments & Publishing endpoints', async () => {
    const project = await client.projects.create({
      name: `Deploy Test ${Date.now()}`,
      slug: `deploy-test-${Date.now()}`,
    });
    const projectId = project.id;

    // create a page first so there is content to publish
    await client.pages.create(projectId, {
      title: 'Deployable Page',
      slug: 'deployable-page',
      content: '# Ready to deploy',
    });

    // get pending changes
    const changes = await client.deployments.getChanges(projectId);
    expect(changes).toBeDefined();

    // list deployments (initially)
    const list = await client.deployments.list(projectId);
    expect(Array.isArray(list)).toBe(true);

    // trigger deployment publish
    const deployment = await client.deployments.trigger(projectId, {
      message: 'Initial deployment via Playwright',
    });
    expect(deployment).toBeDefined();
    expect(deployment.id).toBeDefined();
  });

  test('8. Domains Resource endpoints', async () => {
    const project = await client.projects.create({
      name: `Domains Test ${Date.now()}`,
      slug: `domains-test-${Date.now()}`,
    });
    const projectId = project.id;

    // Create a page and trigger a deployment so a baseline snapshot exists
    await client.pages.create(projectId, {
      title: 'Domain Home',
      slug: 'domain-home',
      content: '# Custom domain ready',
    });
    await client.deployments.trigger(projectId, { message: 'Deploy for custom domain' });

    // list domains
    const list = await client.domains.list(projectId);
    expect(Array.isArray(list)).toBe(true);

    // add custom domain
    const domainName = `docs-${Date.now()}.company.internal`;
    const newDomain = await client.domains.add(projectId, {
      domain: domainName,
    });
    expect(newDomain).toBeDefined();
    expect(newDomain.domain).toBe(domainName);

    // delete custom domain
    const delRes = await client.domains.delete(projectId, newDomain.id);
    expect(delRes).toBeDefined();
  });

  test('9. Search Configuration & Diagnostics endpoints', async () => {
    const project = await client.projects.create({
      name: `Search Test ${Date.now()}`,
      slug: `search-test-${Date.now()}`,
    });
    const projectId = project.id;

    // get search settings
    const settings = await client.search.getSettings(projectId);
    expect(settings).toBeDefined();

    // update search settings
    const updatedSettings = await client.search.updateSettings(projectId, {
      previewLength: 200,
    });
    expect(updatedSettings).toBeDefined();

    // get search diagnostics
    const diagnostics = await client.search.getDiagnostics(projectId);
    expect(diagnostics).toBeDefined();

    // trigger reindex
    const reindexRes = await client.search.reindex(projectId);
    expect(reindexRes).toBeDefined();
  });

  test('10. Comments Resource endpoints', async () => {
    const project = await client.projects.create({
      name: `Comments Test ${Date.now()}`,
      slug: `comments-test-${Date.now()}`,
    });
    const projectId = project.id;

    const page = await client.pages.create(projectId, {
      title: 'Commentable Page',
      slug: 'commentable-page',
      content: 'This text will be reviewed.',
    });

    // list comments
    const list = await client.comments.list(projectId, { pageId: page.id });
    expect(Array.isArray(list)).toBe(true);

    // create comment
    const comment = await client.comments.create(projectId, {
      pageId: page.id,
      body: 'Please verify technical accuracy.',
      targetText: 'This text will be reviewed.',
    } as any);
    expect(comment).toBeDefined();
    expect(comment.id).toBeDefined();

    // update comment
    const updatedComment = await client.comments.update(projectId, comment.id, {
      body: 'Please verify technical accuracy (URGENT).',
      content: 'Please verify technical accuracy (URGENT).',
    });
    expect(updatedComment).toBeDefined();

    // resolve comment
    const resolved = await client.comments.resolve(projectId, comment.id, {
      resolved: true,
    });
    expect(resolved).toBeDefined();

    // delete comment
    const delRes = await client.comments.delete(projectId, comment.id);
    expect(delRes).toBeDefined();
  });

  test('11. OpenAPI Resource endpoints', async () => {
    const project = await client.projects.create({
      name: `OpenAPI Test ${Date.now()}`,
      slug: `openapi-test-${Date.now()}`,
    });
    const projectId = project.id;

    // get config
    const config = await client.openapi.getConfig(projectId);
    expect(config).toBeDefined();

    // upsert config
    const upsertRes = await client.openapi.upsertConfig(projectId, {
      specUrl: 'https://petstore.swagger.io/v2/swagger.json',
    });
    expect(upsertRes).toBeDefined();

    // delete config
    const delRes = await client.openapi.deleteConfig(projectId);
    expect(delRes).toBeDefined();
  });

  test('12. Addons Resource endpoints', async () => {
    const project = await client.projects.create({
      name: `Addons Test ${Date.now()}`,
      slug: `addons-test-${Date.now()}`,
    });
    const projectId = project.id;

    // list addons
    const addons = await client.addons.list(projectId);
    expect(Array.isArray(addons)).toBe(true);
  });

  test('13. API Keys Resource endpoints', async () => {
    const project = await client.projects.create({
      name: `ApiKeys Test ${Date.now()}`,
      slug: `apikeys-test-${Date.now()}`,
    });
    const projectId = project.id;

    // list api keys
    const keys = await client.apiKeys.list(projectId);
    expect(Array.isArray(keys)).toBe(true);

    // create api key
    const newKey = await client.apiKeys.create(projectId, {
      name: 'CI Deployment Key',
      role: 'EDITOR',
    });
    expect(newKey).toBeDefined();
    expect(newKey.id).toBeDefined();

    // rotate api key
    const rotated = await client.apiKeys.rotate(projectId, newKey.id, {
      name: 'CI Deployment Key Rotated',
    });
    expect(rotated).toBeDefined();

    // delete api key (delete the rotated active key)
    const delRes = await client.apiKeys.delete(projectId, rotated.id);
    expect(delRes).toBeDefined();
  });

  test('14. Notifications Resource endpoints', async () => {
    // list notifications
    const list = await client.notifications.list();
    expect(list).toBeDefined();

    // get unread count
    const unread = await client.notifications.getUnreadCount();
    expect(typeof unread.count).toBe('number');

    // mark read
    const markRes = await client.notifications.markRead({ all: true });
    expect(markRes).toBeDefined();
  });

  test('15. Public Resource endpoints', async () => {
    // get public metadata
    const meta = await client.public.getMeta();
    expect(meta).toBeDefined();
    expect(meta.providers).toBeDefined();

    // create a published project to test public reader endpoints
    const project = await client.projects.create({
      name: `Public Site Test ${Date.now()}`,
      slug: `public-site-${Date.now()}`,
    });
    const projectId = project.id;

    await client.pages.create(projectId, {
      title: 'Public Welcome Page',
      slug: 'welcome',
      content: '# Hello Public Reader\n\nDocumentation content.',
    });

    // publish the project
    await client.deployments.trigger(projectId, { message: 'Initial live docs' });

    // public getSite (returns site snapshot or 404 if async worker compilation is pending)
    try {
      const site = await client.public.getSite(projectId);
      expect(site).toBeDefined();
    } catch (err: any) {
      expect([200, 404]).toContain(err.status);
    }

    // record public event
    const eventRes = await client.public.recordEvent(projectId, {
      type: 'page_view',
      path: '/welcome',
    });
    expect(eventRes).toBeDefined();
  });
});
