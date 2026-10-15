use crate::relations::Relation;

/// Object type specification registering allowed relations.
#[derive(Debug, Clone)]
pub struct ObjectTypeSpec {
    pub object_type: &'static str,
    pub allowed_relations: &'static [Relation],
}

pub const REGISTERED_OBJECT_TYPES: &[ObjectTypeSpec] = &[
    ObjectTypeSpec {
        object_type: "workspace",
        allowed_relations: &[Relation::Owner, Relation::Admin, Relation::Member],
    },
    ObjectTypeSpec {
        object_type: "project",
        allowed_relations: &[
            Relation::Owner,
            Relation::Admin,
            Relation::Editor,
            Relation::Viewer,
        ],
    },
];

/// Look up specification for an object type.
#[must_use]
pub fn lookup(object_type: &str) -> Option<&'static ObjectTypeSpec> {
    REGISTERED_OBJECT_TYPES
        .iter()
        .find(|spec| spec.object_type.eq_ignore_ascii_case(object_type))
}
