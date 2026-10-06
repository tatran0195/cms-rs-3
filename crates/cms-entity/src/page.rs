//! Page entity types

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use validator::Validate;

use crate::{
    common::{Id, PaginatedResponse},
    id::PageId,
};

/// Page entity (simplified from Prisma Page model)
///
/// The page tree structure is maintained through parent/child relationships
/// with materialized path for efficient querying.
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct Page {
    pub id: Id,
    pub project_id: Id,
    pub branch_id: Id,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language_id: Option<Id>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<Id>,
    #[serde(default = "default_page_kind")]
    pub kind: String,
    pub path: String, // Materialized path (e.g., "/docs/getting-started")
    pub slug: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub content: String, // Markdown/MDX content
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub translation_key: Option<String>,
    pub position: i32, // Position in the tree for ordering
    #[serde(default)]
    pub is_published: bool,
    #[serde(default)]
    pub is_indexed: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

fn default_page_kind() -> String {
    "PAGE".to_string()
}

/// Page create request
#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema, Validate)]
pub struct CreatePageRequest {
    #[serde(alias = "projectId", default)]
    pub project_id: String,
    #[serde(alias = "branchId", default)]
    pub branch_id: String,
    #[serde(alias = "parentId", default)]
    pub parent_id: Option<Id>,
    #[serde(default)]
    pub slug: String,
    #[validate(length(
        min = 1,
        max = 200,
        message = "Page title must contain 1 to 200 characters"
    ))]
    pub title: String,
    #[validate(length(
        max = 1000,
        message = "Page description must be 1000 characters or fewer"
    ))]
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(alias = "languageId", default)]
    pub language_id: Option<Id>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(alias = "isPublished", default = "default_is_published")]
    pub is_published: bool,
    #[serde(default)]
    pub position: Option<i32>,
    #[serde(alias = "translationKey", default)]
    pub translation_key: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub config: Option<serde_json::Value>,
}

fn default_is_published() -> bool {
    true
}

/// Page update request
#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema, Validate)]
pub struct UpdatePageRequest {
    #[serde(
        alias = "parentId",
        default,
        deserialize_with = "deserialize_nullable_id_patch",
        skip_serializing_if = "Option::is_none"
    )]
    pub parent_id: Option<Option<Id>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub slug: Option<String>,
    #[validate(length(
        min = 1,
        max = 200,
        message = "Page title must contain 1 to 200 characters"
    ))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[validate(length(
        max = 1000,
        message = "Page description must be 1000 characters or fewer"
    ))]
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(alias = "languageId", default, skip_serializing_if = "Option::is_none")]
    pub language_id: Option<Id>,
    #[serde(
        alias = "isPublished",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub is_published: Option<bool>,
    #[serde(alias = "hidden", default, skip_serializing_if = "Option::is_none")]
    pub hidden: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<i32>,
    #[serde(
        alias = "translationKey",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub translation_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(
        default,
        deserialize_with = "deserialize_nullable_config_patch",
        skip_serializing_if = "Option::is_none"
    )]
    pub config: Option<Option<serde_json::Value>>,
}

fn deserialize_nullable_id_patch<'de, D>(deserializer: D) -> Result<Option<Option<Id>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<Id>::deserialize(deserializer).map(Some)
}

fn deserialize_nullable_config_patch<'de, D>(
    deserializer: D,
) -> Result<Option<Option<serde_json::Value>>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Option::<serde_json::Value>::deserialize(deserializer).map(Some)
}

/// Page response (full page with all fields)
#[derive(Debug, Clone, Deserialize, utoipa::ToSchema)]
pub struct PageResponse {
    pub id: Id,
    pub project_id: Id,
    pub branch_id: Id,
    pub parent_id: Option<Id>,
    pub language_id: Option<Id>,
    pub kind: Option<String>,
    pub path: String,
    pub slug: String,
    pub title: String,
    pub description: Option<String>,
    pub content: String,
    pub icon: Option<String>,
    pub config: Option<serde_json::Value>,
    pub translation_key: Option<String>,
    pub position: i32,
    pub is_published: bool,
    pub is_indexed: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl serde::Serialize for PageResponse {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeMap;
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("id", &self.id)?;
        map.serialize_entry("projectId", &self.project_id)?;
        map.serialize_entry("project_id", &self.project_id)?;
        map.serialize_entry("branchId", &self.branch_id)?;
        map.serialize_entry("branch_id", &self.branch_id)?;
        map.serialize_entry("parentId", &self.parent_id)?;
        map.serialize_entry("parent_id", &self.parent_id)?;
        map.serialize_entry("languageId", &self.language_id)?;
        map.serialize_entry("language_id", &self.language_id)?;
        map.serialize_entry("kind", self.kind.as_deref().unwrap_or("PAGE"))?;
        map.serialize_entry("title", &self.title)?;
        map.serialize_entry("slug", &self.slug)?;
        map.serialize_entry("path", &self.path)?;
        map.serialize_entry("icon", &self.icon)?;
        map.serialize_entry("description", &self.description)?;
        map.serialize_entry("content", &self.content)?;
        map.serialize_entry("config", &self.config)?;
        map.serialize_entry("translationKey", &self.translation_key)?;
        map.serialize_entry("translation_key", &self.translation_key)?;
        map.serialize_entry("position", &self.position)?;
        map.serialize_entry("hidden", &(!self.is_published))?;
        map.serialize_entry("is_published", &self.is_published)?;
        map.serialize_entry("is_indexed", &self.is_indexed)?;
        map.serialize_entry("createdAt", &self.created_at)?;
        map.serialize_entry("created_at", &self.created_at)?;
        map.serialize_entry("updatedAt", &self.updated_at)?;
        map.serialize_entry("updated_at", &self.updated_at)?;
        map.end()
    }
}

impl From<Page> for PageResponse {
    fn from(page: Page) -> Self {
        Self {
            id: page.id,
            project_id: page.project_id,
            branch_id: page.branch_id,
            parent_id: page.parent_id,
            language_id: page.language_id,
            kind: Some(page.kind),
            path: page.path,
            slug: page.slug,
            title: page.title,
            description: page.description,
            content: page.content,
            icon: page.icon,
            config: page.config,
            translation_key: page.translation_key,
            position: page.position,
            is_published: page.is_published,
            is_indexed: page.is_indexed,
            created_at: page.created_at,
            updated_at: page.updated_at,
        }
    }
}

/// Page tree node (for tree listing)
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct PageTreeNode {
    pub id: Id,
    pub project_id: Id,
    pub branch_id: Id,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<Id>,
    pub path: String,
    pub slug: String,
    pub title: String,
    pub position: i32,
    pub is_published: bool,
    pub has_children: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<PageTreeNode>>,
}

/// Page list item (for flat listings)
#[derive(Debug, Clone, Deserialize, utoipa::ToSchema)]
pub struct PageListItem {
    pub id: Id,
    pub project_id: Id,
    pub branch_id: Id,
    pub parent_id: Option<Id>,
    pub language_id: Option<Id>,
    pub kind: Option<String>,
    pub path: String,
    pub slug: String,
    pub title: String,
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    pub icon: Option<String>,
    pub config: Option<serde_json::Value>,
    pub translation_key: Option<String>,
    pub position: i32,
    pub is_published: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl serde::Serialize for PageListItem {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeMap;
        let mut map = serializer.serialize_map(None)?;
        map.serialize_entry("id", &self.id)?;
        map.serialize_entry("projectId", &self.project_id)?;
        map.serialize_entry("project_id", &self.project_id)?;
        map.serialize_entry("branchId", &self.branch_id)?;
        map.serialize_entry("branch_id", &self.branch_id)?;
        map.serialize_entry("parentId", &self.parent_id)?;
        map.serialize_entry("parent_id", &self.parent_id)?;
        map.serialize_entry("languageId", &self.language_id)?;
        map.serialize_entry("language_id", &self.language_id)?;
        map.serialize_entry("kind", self.kind.as_deref().unwrap_or("PAGE"))?;
        map.serialize_entry("title", &self.title)?;
        map.serialize_entry("slug", &self.slug)?;
        map.serialize_entry("path", &self.path)?;
        map.serialize_entry("icon", &self.icon)?;
        map.serialize_entry("description", &self.description)?;
        if let Some(content) = &self.content {
            map.serialize_entry("content", content)?;
        }
        map.serialize_entry("config", &self.config)?;
        map.serialize_entry("translationKey", &self.translation_key)?;
        map.serialize_entry("translation_key", &self.translation_key)?;
        map.serialize_entry("position", &self.position)?;
        map.serialize_entry("hidden", &(!self.is_published))?;
        map.serialize_entry("is_published", &self.is_published)?;
        map.serialize_entry("createdAt", &self.created_at)?;
        map.serialize_entry("created_at", &self.created_at)?;
        map.serialize_entry("updatedAt", &self.updated_at)?;
        map.serialize_entry("updated_at", &self.updated_at)?;
        map.end()
    }
}

/// Page reorder request
#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema)]
pub struct ReorderPagesRequest {
    pub page_ids: Vec<Id>,
}

/// Response for deleting a page
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct DeletePageResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<PageId>,
}

/// Single item in a page tree reorder request
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, Validate)]
#[serde(rename_all = "camelCase")]
pub struct ReorderTreeItem {
    pub id: PageId,
    pub parent_id: Option<PageId>,
    #[validate(range(
        min = 0,
        max = 1000000,
        message = "Position must be between 0 and 1000000"
    ))]
    pub position: i32,
}

/// Page tree reorder request payload
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema, Validate)]
pub struct ReorderPageTreeRequest {
    #[validate(length(
        min = 1,
        max = 10000,
        message = "Reorder requests must contain between 1 and 10000 pages"
    ))]
    #[validate(nested)]
    pub items: Vec<ReorderTreeItem>,
}

/// Response for reordering pages
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct ReorderPageTreeResponse {
    pub success: bool,
}

/// List pages query parameters
#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema)]
pub struct ListPagesQuery {
    #[serde(alias = "projectId", default)]
    pub project_id: Id,
    #[serde(alias = "branchId", default)]
    pub branch_id: Id,
    #[serde(alias = "languageId", default)]
    pub language_id: Option<Id>,
    #[serde(alias = "parentId", default)]
    pub parent_id: Option<Id>,
    #[serde(default)]
    pub search: Option<String>,
    #[serde(default)]
    pub is_published: Option<bool>,
    #[serde(default = "default_tree")]
    pub tree: bool,
}

fn default_tree() -> bool {
    false
}

/// List pages response
pub type ListPagesResponse = PaginatedResponse<PageListItem>;

/// Get page tree response
pub type GetPageTreeResponse = Vec<PageTreeNode>;

/// Comment on a page
#[derive(Debug, Clone, Deserialize, Serialize, utoipa::ToSchema)]
pub struct PageComment {
    pub id: Id,
    pub page_id: Id,
    pub content: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_page_response_conversion() {
        let page = Page {
            id: "page-1".to_string(),
            project_id: "proj-1".to_string(),
            branch_id: "branch-1".to_string(),
            language_id: Some("lang-1".to_string()),
            parent_id: None,
            kind: "GROUP".to_string(),
            path: "/docs/getting-started".to_string(),
            slug: "getting-started".to_string(),
            title: "Getting Started".to_string(),
            description: Some("Welcome to CMS".to_string()),
            content: "# Getting Started\n\nWelcome!".to_string(),
            icon: Some("book".to_string()),
            config: None,
            translation_key: Some("getting-started-key".to_string()),
            position: 0,
            is_published: true,
            is_indexed: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        let response: PageResponse = page.into();
        assert_eq!(response.id, "page-1");
        assert_eq!(response.path, "/docs/getting-started");
        assert_eq!(response.kind, Some("GROUP".to_string()));
        assert_eq!(response.language_id, Some("lang-1".to_string()));
        assert_eq!(response.icon, Some("book".to_string()));
    }

    #[test]
    fn test_create_page_request_from_frontend_json() {
        let json_str =
            r#"{"title":"Untitled","parentId":null,"languageId":"lang-123","isPublished":false}"#;
        let req: Result<CreatePageRequest, _> = serde_json::from_str(json_str);
        assert!(
            req.is_ok(),
            "Expected frontend add-page payload to deserialize into CreatePageRequest: {:?}",
            req.err()
        );
        let req = req.unwrap();
        assert_eq!(req.title, "Untitled");
        assert_eq!(req.parent_id, None);
        assert_eq!(req.language_id, Some("lang-123".to_string()));
        assert!(!req.is_published);
    }

    #[test]
    fn test_update_page_request_accepts_frontend_publication_field() {
        let request: UpdatePageRequest = serde_json::from_str(r#"{"isPublished":false}"#).unwrap();
        assert_eq!(request.is_published, Some(false));
    }

    #[test]
    fn test_create_group_request_from_frontend_json() {
        let json_str =
            r#"{"title":"New group","kind":"GROUP","slug":"new-group","languageId":"lang-123"}"#;
        let req: Result<CreatePageRequest, _> = serde_json::from_str(json_str);
        assert!(req.is_ok());
        let req = req.unwrap();
        assert_eq!(req.title, "New group");
        assert_eq!(req.kind, Some("GROUP".to_string()));
        assert_eq!(req.slug, "new-group");
        assert_eq!(req.language_id, Some("lang-123".to_string()));
    }

    #[test]
    fn test_page_response_serialization() {
        let page = Page {
            id: "page-1".to_string(),
            project_id: "proj-1".to_string(),
            branch_id: "branch-1".to_string(),
            language_id: Some("lang-1".to_string()),
            parent_id: Some("parent-1".to_string()),
            kind: "PAGE".to_string(),
            path: "/docs/intro".to_string(),
            slug: "intro".to_string(),
            title: "Intro".to_string(),
            description: None,
            content: "Hello".to_string(),
            icon: None,
            config: None,
            translation_key: None,
            position: 1,
            is_published: true,
            is_indexed: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        let response: PageResponse = page.into();
        let val = serde_json::to_value(&response).unwrap();
        assert_eq!(val["id"], "page-1");
        assert_eq!(val["projectId"], "proj-1");
        assert_eq!(val["parentId"], "parent-1");
        assert_eq!(val["languageId"], "lang-1");
        assert_eq!(val["kind"], "PAGE");
        assert_eq!(val["hidden"], false);
    }

    #[test]
    fn test_page_list_item_serialization_omits_none_content() {
        let item = PageListItem {
            id: "page-1".to_string(),
            project_id: "proj-1".to_string(),
            branch_id: "branch-1".to_string(),
            parent_id: None,
            language_id: Some("lang-1".to_string()),
            kind: Some("PAGE".to_string()),
            path: "/intro".to_string(),
            slug: "intro".to_string(),
            title: "Intro".to_string(),
            description: None,
            content: None,
            icon: None,
            config: None,
            translation_key: None,
            position: 0,
            is_published: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };
        let val = serde_json::to_value(&item).unwrap();
        assert_eq!(val["id"], "page-1");
        assert_eq!(val["title"], "Intro");
        assert!(val.get("content").is_none());

        let mut item_with_content = item;
        item_with_content.content = Some("# Markdown body".to_string());
        let val2 = serde_json::to_value(&item_with_content).unwrap();
        assert_eq!(val2["content"], "# Markdown body");
    }

    #[test]
    fn test_delete_page_response_serialization() {
        let resp = DeletePageResponse {
            success: true,
            id: Some(PageId::from("page-del-1")),
        };
        let val = serde_json::to_value(&resp).unwrap();
        assert_eq!(val["success"], true);
        assert_eq!(val["id"], "page-del-1");
    }

    #[test]
    fn test_reorder_page_tree_request_validation() {
        let json_str = r#"{
            "items": [
                { "id": "p-1", "parentId": null, "position": 0 },
                { "id": "p-2", "parentId": "p-1", "position": 1 }
            ]
        }"#;
        let req: ReorderPageTreeRequest = serde_json::from_str(json_str).unwrap();
        assert_eq!(req.items.len(), 2);
        assert_eq!(req.items[0].id.as_str(), "p-1");
        assert!(req.items[0].parent_id.is_none());
        assert_eq!(req.items[1].parent_id.as_ref().unwrap().as_str(), "p-1");
        assert!(req.validate().is_ok());

        let empty = ReorderPageTreeRequest { items: vec![] };
        assert!(empty.validate().is_err());
    }
}
