use serde::{Deserialize, Serialize};

/// Canonical Zanzibar relations modeled across CMS.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Relation {
    Owner,
    Admin,
    Editor,
    Viewer,
    Member,
}

impl Relation {
    /// Canonical wire code representation.
    #[must_use]
    pub const fn as_code(self) -> &'static str {
        match self {
            Self::Owner => "owner",
            Self::Admin => "admin",
            Self::Editor => "editor",
            Self::Viewer => "viewer",
            Self::Member => "member",
        }
    }

    /// Parse relation from code string.
    #[must_use]
    pub fn from_code(code: &str) -> Option<Self> {
        match code.trim().to_lowercase().as_str() {
            "owner" => Some(Self::Owner),
            "admin" => Some(Self::Admin),
            "editor" => Some(Self::Editor),
            "viewer" => Some(Self::Viewer),
            "member" => Some(Self::Member),
            _ => None,
        }
    }

    /// Set of relations that IMPLY this relation.
    /// E.g. When checking for `Viewer`, `[Viewer, Editor, Admin, Owner]` all satisfy.
    #[must_use]
    pub const fn implied_by(self) -> &'static [Self] {
        match self {
            Self::Viewer => &[Self::Viewer, Self::Editor, Self::Admin, Self::Owner],
            Self::Editor => &[Self::Editor, Self::Admin, Self::Owner],
            Self::Admin => &[Self::Admin, Self::Owner],
            Self::Owner => &[Self::Owner],
            Self::Member => &[Self::Member, Self::Admin, Self::Owner],
        }
    }
}
