use thiserror::Error;

#[derive(Debug, Error)]
pub enum AuthzError {
    #[error("unknown object type: {0}")]
    UnknownObjectType(String),

    #[error("invalid relation '{relation}' for object type '{object_type}'")]
    InvalidRelation {
        relation: String,
        object_type: String,
    },

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("internal authz error: {0}")]
    Internal(String),
}
