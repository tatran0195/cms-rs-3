//! Authorization Domain Types, Resources, Actions, and 2D Permission Matrices

use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use ts_rs::TS;

/// Actions supported across permission matrices
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema, TS)]
#[serde(rename_all = "snake_case")]
pub enum Action {
    Create,
    Read,
    Edit,
    Delete,
    Publish,
}

impl Action {
    pub fn from_u8(val: u8) -> Result<Self, &'static str> {
        match val {
            0 => Ok(Self::Create),
            1 => Ok(Self::Read),
            2 => Ok(Self::Edit),
            3 => Ok(Self::Delete),
            4 => Ok(Self::Publish),
            _ => Err("Invalid action code"),
        }
    }
}

/// Resources scoped to Workspace governance
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema, TS)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceResource {
    Projects,
    Members,
    Roles,
    ApiKeys,
    AuditLogs,
    Settings,
    DangerZone,
}

impl WorkspaceResource {
    pub fn from_u8(val: u8) -> Result<Self, &'static str> {
        match val {
            0 => Ok(Self::Projects),
            1 => Ok(Self::Members),
            2 => Ok(Self::Roles),
            3 => Ok(Self::ApiKeys),
            4 => Ok(Self::AuditLogs),
            5 => Ok(Self::Settings),
            6 => Ok(Self::DangerZone),
            _ => Err("Invalid workspace resource code"),
        }
    }

    pub fn supported_actions(&self) -> &'static [Action] {
        match self {
            Self::AuditLogs => &[Action::Read],
            Self::Settings => &[Action::Read, Action::Edit],
            Self::DangerZone => &[Action::Read, Action::Delete],
            _ => &[Action::Create, Action::Read, Action::Edit, Action::Delete],
        }
    }
}

/// Resources scoped to Project documentation & configuration
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, ToSchema, TS)]
#[serde(rename_all = "snake_case")]
pub enum ProjectResource {
    Pages,
    Branches,
    Deployments,
    Domains,
    Openapi,
    Assets,
    Addons,
    Members,
    Roles,
    Analytics,
    Comments,
    DangerZone,
}

impl ProjectResource {
    pub fn from_u8(val: u8) -> Result<Self, &'static str> {
        match val {
            0 => Ok(Self::Pages),
            1 => Ok(Self::Branches),
            2 => Ok(Self::Deployments),
            3 => Ok(Self::Domains),
            4 => Ok(Self::Openapi),
            5 => Ok(Self::Assets),
            6 => Ok(Self::Addons),
            7 => Ok(Self::Members),
            8 => Ok(Self::Roles),
            9 => Ok(Self::Analytics),
            10 => Ok(Self::Comments),
            11 => Ok(Self::DangerZone),
            _ => Err("Invalid project resource code"),
        }
    }

    pub fn supported_actions(&self) -> &'static [Action] {
        match self {
            Self::Pages => &[Action::Create, Action::Read, Action::Edit, Action::Delete, Action::Publish],
            Self::Deployments => &[Action::Create, Action::Read, Action::Delete, Action::Publish],
            Self::Analytics => &[Action::Read],
            Self::DangerZone => &[Action::Read, Action::Delete],
            _ => &[Action::Create, Action::Read, Action::Edit, Action::Delete],
        }
    }
}

pub type ResourcePermissions = HashMap<Action, bool>;

/// 2D Permission Matrix for Project-level resources
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema, TS)]
pub struct ProjectPermissions(pub HashMap<ProjectResource, ResourcePermissions>);

impl ProjectPermissions {
    pub fn empty() -> Self {
        Self(HashMap::new())
    }

    pub fn full() -> Self {
        let mut map = HashMap::new();
        for res in [
            ProjectResource::Pages, ProjectResource::Branches, ProjectResource::Deployments,
            ProjectResource::Domains, ProjectResource::Openapi, ProjectResource::Assets,
            ProjectResource::Addons, ProjectResource::Members, ProjectResource::Roles,
            ProjectResource::Analytics, ProjectResource::Comments, ProjectResource::DangerZone,
        ] {
            let mut actions = HashMap::new();
            for act in res.supported_actions() {
                actions.insert(*act, true);
            }
            map.insert(res, actions);
        }
        Self(map)
    }

    pub fn has_permission(&self, resource: ProjectResource, action: Action) -> bool {
        self.0.get(&resource)
            .and_then(|acts| acts.get(&action))
            .copied()
            .unwrap_or(false)
    }

    pub fn normalize(raw: serde_json::Value) -> Self {
        let mut out = Self::empty();
        if let Some(obj) = raw.as_object() {
            for (res_str, acts_val) in obj {
                if let Ok(resource) = serde_json::from_value::<ProjectResource>(serde_json::Value::String(res_str.clone())) {
                    if let Some(acts_obj) = acts_val.as_object() {
                        let supported = resource.supported_actions();
                        let mut act_map = HashMap::new();
                        for (act_str, val) in acts_obj {
                            if let Ok(action) = serde_json::from_value::<Action>(serde_json::Value::String(act_str.clone())) {
                                if supported.contains(&action) {
                                    act_map.insert(action, val.as_bool().unwrap_or(false));
                                }
                            }
                        }
                        out.0.insert(resource, act_map);
                    }
                }
            }
        }
        out
    }
}

/// 2D Permission Matrix for Workspace-level resources
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, ToSchema, TS)]
pub struct WorkspacePermissions(pub HashMap<WorkspaceResource, ResourcePermissions>);

impl WorkspacePermissions {
    pub fn empty() -> Self {
        Self(HashMap::new())
    }

    pub fn full() -> Self {
        let mut map = HashMap::new();
        for res in [
            WorkspaceResource::Projects, WorkspaceResource::Members, WorkspaceResource::Roles,
            WorkspaceResource::ApiKeys, WorkspaceResource::AuditLogs, WorkspaceResource::Settings,
            WorkspaceResource::DangerZone,
        ] {
            let mut actions = HashMap::new();
            for act in res.supported_actions() {
                actions.insert(*act, true);
            }
            map.insert(res, actions);
        }
        Self(map)
    }

    pub fn has_permission(&self, resource: WorkspaceResource, action: Action) -> bool {
        self.0.get(&resource)
            .and_then(|acts| acts.get(&action))
            .copied()
            .unwrap_or(false)
    }

    pub fn normalize(raw: serde_json::Value) -> Self {
        let mut out = Self::empty();
        if let Some(obj) = raw.as_object() {
            for (res_str, acts_val) in obj {
                if let Ok(resource) = serde_json::from_value::<WorkspaceResource>(serde_json::Value::String(res_str.clone())) {
                    if let Some(acts_obj) = acts_val.as_object() {
                        let supported = resource.supported_actions();
                        let mut act_map = HashMap::new();
                        for (act_str, val) in acts_obj {
                            if let Ok(action) = serde_json::from_value::<Action>(serde_json::Value::String(act_str.clone())) {
                                if supported.contains(&action) {
                                    act_map.insert(action, val.as_bool().unwrap_or(false));
                                }
                            }
                        }
                        out.0.insert(resource, act_map);
                    }
                }
            }
        }
        out
    }
}

/// Dynamic permission catalog resource item
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, TS)]
pub struct PermissionCatalogResource<R> {
    pub key: R,
    pub actions: Vec<Action>,
}

/// Dynamic permission catalog describing supported resources and actions
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, TS)]
pub struct PermissionCatalog<R> {
    pub resources: Vec<PermissionCatalogResource<R>>,
    pub actions: Vec<Action>,
}

impl PermissionCatalog<ProjectResource> {
    pub fn project_catalog() -> Self {
        let resources = vec![
            ProjectResource::Pages, ProjectResource::Branches, ProjectResource::Deployments,
            ProjectResource::Domains, ProjectResource::Openapi, ProjectResource::Assets,
            ProjectResource::Addons, ProjectResource::Members, ProjectResource::Roles,
            ProjectResource::Analytics, ProjectResource::Comments, ProjectResource::DangerZone,
        ]
        .into_iter()
        .map(|r| PermissionCatalogResource {
            actions: r.supported_actions().to_vec(),
            key: r,
        })
        .collect();

        Self {
            resources,
            actions: vec![Action::Create, Action::Read, Action::Edit, Action::Delete, Action::Publish],
        }
    }
}

impl PermissionCatalog<WorkspaceResource> {
    pub fn workspace_catalog() -> Self {
        let resources = vec![
            WorkspaceResource::Projects, WorkspaceResource::Members, WorkspaceResource::Roles,
            WorkspaceResource::ApiKeys, WorkspaceResource::AuditLogs, WorkspaceResource::Settings,
            WorkspaceResource::DangerZone,
        ]
        .into_iter()
        .map(|r| PermissionCatalogResource {
            actions: r.supported_actions().to_vec(),
            key: r,
        })
        .collect();

        Self {
            resources,
            actions: vec![Action::Create, Action::Read, Action::Edit, Action::Delete],
        }
    }
}


/// Custom role scoped to a Project
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, TS)]
pub struct ProjectRole {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub description: Option<String>,
    pub is_default: bool,
    pub permissions: ProjectPermissions,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// Member of a Project
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, TS)]
pub struct ProjectMember {
    pub id: String,
    pub project_id: String,
    pub user_id: String,
    pub role: String, // "owner" | "member"
    pub role_id: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

/// DTO to create a new role
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, TS)]
pub struct CreateRoleRequest {
    pub name: String,
    pub description: Option<String>,
    #[serde(default)]
    pub is_default: bool,
    pub permissions: serde_json::Value,
}

/// DTO to update an existing role
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, TS)]
pub struct UpdateRoleRequest {
    pub name: Option<String>,
    pub description: Option<String>,
    pub is_default: Option<bool>,
    pub permissions: Option<serde_json::Value>,
}

/// Response containing the count of active members/resources using a role
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, TS)]
pub struct RoleUsageResponse {
    pub usage_count: i64,
}

/// DTO to add a user to a project
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, TS)]
pub struct AddProjectMemberRequest {
    pub user_id: String,
    #[serde(default = "default_member_role")]
    pub role: String,
    pub role_id: Option<String>,
}

fn default_member_role() -> String {
    "member".to_string()
}

/// DTO to update a project member's role
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema, TS)]
pub struct UpdateProjectMemberRequest {
    pub role: Option<String>,
    pub role_id: Option<String>,
}

