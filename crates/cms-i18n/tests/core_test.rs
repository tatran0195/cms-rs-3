use cms_i18n::{accept_language_tags, Catalog, Direction, Locale};

#[test]
fn test_locale_and_catalog_negotiation() {
    let loc = Locale::parse("ja-JP").expect("valid tag");
    assert_eq!(loc.as_str(), "ja-JP");
    assert_eq!(loc.language(), "ja");
    assert_eq!(loc.direction(), Direction::Ltr);

    let rtl = Locale::parse("ar").expect("valid rtl");
    assert_eq!(rtl.direction(), Direction::Rtl);

    let tags = accept_language_tags("ja;q=0.8, en-US;q=0.9, en;q=0.7");
    assert_eq!(tags, vec!["en-US", "ja", "en"]);

    let cat = Catalog::builder(Locale::parse("en").unwrap())
        .add_json("en", r#"{"greeting": "Hello {name}!"}"#)
        .unwrap()
        .add_json("ja", r#"{"greeting": "こんにちは {name}！"}"#)
        .unwrap()
        .build()
        .unwrap();

    let negotiated = cat.negotiate(["ja-JP"]);
    assert_eq!(negotiated.as_str(), "ja");

    let mut args = cms_i18n::Args::new();
    args.set("name", "Taro");
    assert_eq!(cat.format(&negotiated, "greeting", &args).unwrap(), "こんにちは Taro！");
}
