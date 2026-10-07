use cms_entity::authz::{Action, ProjectPermissions, ProjectResource, WorkspacePermissions, WorkspaceResource};

#[test]
fn test_project_matrix_normalization() {
    let raw = serde_json::json!({
        "pages": {
            "create": true,
            "read": true,
            "publish": true,
            "invalid_action": true
        },
        "danger_zone": {
            "read": true,
            "edit": true // unsupported on danger_zone
        },
        "unknown_resource": {
            "read": true
        }
    });

    let matrix = ProjectPermissions::normalize(raw);
    assert!(matrix.has_permission(ProjectResource::Pages, Action::Create));
    assert!(matrix.has_permission(ProjectResource::Pages, Action::Publish));
    assert!(matrix.has_permission(ProjectResource::DangerZone, Action::Read));
    // Unsupported action should be forced to false
    assert!(!matrix.has_permission(ProjectResource::DangerZone, Action::Edit));
    assert!(!matrix.has_permission(ProjectResource::Branches, Action::Read));
}

#[test]
fn test_workspace_matrix_normalization() {
    let raw = serde_json::json!({
        "projects": {
            "create": true,
            "read": true,
            "delete": false
        },
        "audit_logs": {
            "read": true,
            "edit": true // unsupported on audit_logs
        }
    });

    let matrix = WorkspacePermissions::normalize(raw);
    assert!(matrix.has_permission(WorkspaceResource::Projects, Action::Create));
    assert!(matrix.has_permission(WorkspaceResource::Projects, Action::Read));
    assert!(!matrix.has_permission(WorkspaceResource::Projects, Action::Delete));
    assert!(matrix.has_permission(WorkspaceResource::AuditLogs, Action::Read));
    assert!(!matrix.has_permission(WorkspaceResource::AuditLogs, Action::Edit));
}

#[test]
fn test_full_and_empty_matrices() {
    let full = ProjectPermissions::full();
    assert!(full.has_permission(ProjectResource::Pages, Action::Publish));
    assert!(full.has_permission(ProjectResource::Branches, Action::Delete));
    assert!(full.has_permission(ProjectResource::DangerZone, Action::Delete));
    assert!(!full.has_permission(ProjectResource::DangerZone, Action::Create)); // not supported

    let empty = ProjectPermissions::empty();
    assert!(!empty.has_permission(ProjectResource::Pages, Action::Read));

    let ws_full = WorkspacePermissions::full();
    assert!(ws_full.has_permission(WorkspaceResource::Projects, Action::Create));
    assert!(ws_full.has_permission(WorkspaceResource::DangerZone, Action::Delete));
    assert!(!ws_full.has_permission(WorkspaceResource::AuditLogs, Action::Create)); // not supported
}
