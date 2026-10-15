use cms_i18n::{current_locale, error_code_to_key, localize_error, with_locale, Args, Locale};

#[tokio::test]
async fn test_task_local_locale_scoping() {
    assert_eq!(current_locale(), Locale::default());

    let ja = Locale::parse("ja").unwrap();
    with_locale(ja.clone(), async {
        assert_eq!(current_locale(), ja);
    })
    .await;

    assert_eq!(current_locale(), Locale::default());
}

#[test]
fn test_error_code_mapping() {
    assert_eq!(
        error_code_to_key("auth:invalid_credentials"),
        "api_error_auth_invalid_credentials"
    );
    assert_eq!(
        error_code_to_key("http:not_found"),
        "api_error_http_not_found"
    );
    assert_eq!(
        error_code_to_key("validation.failed"),
        "api_error_validation_failed"
    );
}

#[test]
fn test_embedded_error_localization() {
    let empty_args = Args::new();
    let ja = Locale::parse("ja").unwrap();
    let en = Locale::parse("en").unwrap();
    let zh = Locale::parse("zh-CN").unwrap();

    let ja_msg = localize_error("auth:invalid_credentials", &ja, &empty_args);
    assert_eq!(
        ja_msg.as_deref(),
        Some("メールアドレスまたはパスワードが無効です")
    );

    let en_msg = localize_error("auth:invalid_credentials", &en, &empty_args);
    assert_eq!(en_msg.as_deref(), Some("Invalid email or password"));

    let zh_msg = localize_error("auth:invalid_credentials", &zh, &empty_args);
    assert_eq!(zh_msg.as_deref(), Some("邮箱或密码无效"));

    let mut path_args = Args::new();
    path_args.set("path", "/api/v1/projects/xyz");
    let ja_not_found = localize_error("http:not_found", &ja, &path_args);
    assert_eq!(
        ja_not_found.as_deref(),
        Some("リソースが見つかりません: /api/v1/projects/xyz")
    );
}
