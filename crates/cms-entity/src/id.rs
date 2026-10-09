//! Nominal Typed Identifiers
//!
//! Strongly-typed newtype wrappers around string identifiers to prevent
//! accidental ID transposition across service boundaries at compile time.

use std::{fmt, ops::Deref, str::FromStr};

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

macro_rules! define_id {
    ($name:ident, $doc:expr) => {
        #[doc = $doc]
        #[derive(
            Debug,
            Clone,
            PartialEq,
            Eq,
            PartialOrd,
            Ord,
            Hash,
            Serialize,
            Deserialize,
            sqlx::Type,
            ToSchema,
        )]
        #[sqlx(transparent)]
        #[serde(transparent)]
        pub struct $name(pub String);

        impl ts_rs::TS for $name {
            type WithoutGenerics = Self;
            type OptionInnerType = Self;

            fn name(_cfg: &ts_rs::Config) -> String {
                stringify!($name).to_string()
            }

            fn inline(_cfg: &ts_rs::Config) -> String {
                "string".to_string()
            }

            fn inline_flattened(_cfg: &ts_rs::Config) -> String {
                "string".to_string()
            }

            fn decl(_cfg: &ts_rs::Config) -> String {
                format!("type {} = string;", stringify!($name))
            }
        }

        impl $name {
            /// Generate a new unique ID using UUID v4
            pub fn new() -> Self {
                Self(Uuid::new_v4().to_string())
            }

            /// Create from an existing string
            pub fn from_string(s: impl Into<String>) -> Self {
                Self(s.into())
            }

            /// Borrow as string slice
            pub fn as_str(&self) -> &str {
                &self.0
            }

            /// Consume into inner String
            pub fn into_inner(self) -> String {
                self.0
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(f, "{}", self.0)
            }
        }

        impl Deref for $name {
            type Target = str;
            fn deref(&self) -> &Self::Target {
                &self.0
            }
        }

        impl AsRef<str> for $name {
            fn as_ref(&self) -> &str {
                &self.0
            }
        }

        impl From<String> for $name {
            fn from(s: String) -> Self {
                Self(s)
            }
        }

        impl From<&str> for $name {
            fn from(s: &str) -> Self {
                Self(s.to_string())
            }
        }

        impl From<Uuid> for $name {
            fn from(u: Uuid) -> Self {
                Self(u.to_string())
            }
        }

        impl From<$name> for String {
            fn from(id: $name) -> Self {
                id.0
            }
        }

        impl FromStr for $name {
            type Err = std::convert::Infallible;
            fn from_str(s: &str) -> Result<Self, Self::Err> {
                Ok(Self(s.to_string()))
            }
        }

        impl PartialEq<str> for $name {
            fn eq(&self, other: &str) -> bool {
                self.0 == other
            }
        }

        impl PartialEq<&str> for $name {
            fn eq(&self, other: &&str) -> bool {
                self.0 == *other
            }
        }

        impl PartialEq<String> for $name {
            fn eq(&self, other: &String) -> bool {
                self.0 == *other
            }
        }
    };
}

define_id!(ProjectId, "Nominal identifier for a project");
define_id!(UserId, "Nominal identifier for a user");
define_id!(BranchId, "Nominal identifier for a branch");
define_id!(PageId, "Nominal identifier for a page");
define_id!(CommentId, "Nominal identifier for a comment");
define_id!(AssetId, "Nominal identifier for an asset");
define_id!(DeploymentId, "Nominal identifier for a deployment");
define_id!(DomainId, "Nominal identifier for a custom domain");
define_id!(LanguageId, "Nominal identifier for a project language");
define_id!(
    IntegrationId,
    "Nominal identifier for an external integration"
);
define_id!(ApiKeyId, "Nominal identifier for an API key");
define_id!(AudienceId, "Nominal identifier for reader access audience");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_typed_id_generation_and_conversions() {
        let p1 = ProjectId::new();
        assert!(!p1.is_empty());
        assert_eq!(p1.as_str(), &*p1);

        let p2 = ProjectId::from("my-project-id");
        assert_eq!(p2, "my-project-id");
        assert_eq!(p2.to_string(), "my-project-id");

        let p3: ProjectId = "parsed-id".parse().unwrap();
        assert_eq!(p3, "parsed-id");

        let s: String = p3.into();
        assert_eq!(s, "parsed-id");
    }

    #[test]
    fn test_typed_id_serde_roundtrip() {
        let id = ProjectId::from("proj_12345");
        let json = serde_json::to_string(&id).unwrap();
        assert_eq!(json, "\"proj_12345\"");

        let deserialized: ProjectId = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, id);
    }

    #[test]
    fn test_distinct_nominal_types_prevent_accidental_assignment() {
        let p = ProjectId::from("proj_1");
        let u = UserId::from("user_1");
        assert_eq!(p.as_str(), "proj_1");
        assert_eq!(u.as_str(), "user_1");
    }
}
