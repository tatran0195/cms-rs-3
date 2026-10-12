use cms_i18n::{current_locale, error_code_to_key, with_locale, Locale};

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
    assert_eq!(error_code_to_key("auth:invalid_credentials"), "api_error_auth_invalid_credentials");
    assert_eq!(error_code_to_key("http:not_found"), "api_error_http_not_found");
    assert_eq!(error_code_to_key("validation.failed"), "api_error_validation_failed");
}
