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

/// Resources scoped to Workspace / Organization governance
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
