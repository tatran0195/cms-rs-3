use chrono::Utc;
use cms_biz::export::build_sqlite_export_database;
use cms_entity::{
    branch::Branch,
    language::Language,
    page::PageListItem,
    project::Project,
};

#[tokio::test]
async fn test_export_contains_custom_id() {
    let project = Project {
        id: "proj-1".into(),
        name: "Test Project".into(),
        slug: "test-project".into(),
        description: Some("Test Description".into()),
        icon: None,
        is_public: true,
        config: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };

    let branch = Branch {
        id: "branch-v1".into(),
        project_id: "proj-1".into(),
        name: "v1.0".into(),
        slug: "v1.0".into(),
        description: None,
        is_default: true,
        is_protected: false,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };

    let page = PageListItem {
        id: "page-1".into(),
        project_id: "proj-1".into(),
        branch_id: "branch-v1".into(),
        parent_id: None,
        language_id: Some("lang-en".into()),
        kind: Some("PAGE".into()),
        path: "/getting-started".into(),
        slug: "getting-started".into(),
        title: "Getting Started".into(),
        description: Some("Quick start guide".into()),
        content: Some("# Getting Started\nContent here".into()),
        icon: None,
        config: None,
        translation_key: None,
        custom_id: Some("quick-start-alias".into()),
        position: 0,
        is_published: true,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };

    let language = Language {
        id: "lang-en".into(),
        project_id: "proj-1".into(),
        code: "en".into(),
        name: "English".into(),
        is_default: true,
        is_rtl: false,
        enabled: true,
        position: 0,
        config: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };

    let sqlite_bytes = build_sqlite_export_database(
        project,
        vec![branch],
        vec![page],
        vec![language],
        vec![],
    )
    .await
    .expect("export should succeed");

    let temp = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(temp.path(), &sqlite_bytes).unwrap();

    let pool = sqlx::SqlitePool::connect(&format!("sqlite://{}", temp.path().display()))
        .await
        .unwrap();

    let row = sqlx::query("SELECT custom_id FROM pages WHERE id = 'page-1'")
        .fetch_one(&pool)
        .await
        .expect("column custom_id should exist");

    let custom_id: Option<String> = sqlx::Row::try_get(&row, 0).unwrap();
    assert_eq!(custom_id.as_deref(), Some("quick-start-alias"));
}
