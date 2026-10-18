use cms_seed::PlatformBootstrapOptions;

#[test]
fn test_bootstrap_options_default() {
    let opts = PlatformBootstrapOptions::default();
    assert_eq!(opts.admin_email, "admin@company.local");
    assert_eq!(opts.workspace_slug, "company-docs");
    assert!(opts.skip_if_initialized);
    assert!(opts.create_starter_project);
    assert!(!opts.force);
}
