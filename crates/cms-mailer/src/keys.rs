//! Message keys used by this crate — **exactly** as they appear in
//! `packages/i18n/messages/{locale}.json` (Paraglide / inlang flat format).
//!
//! Never build keys with `format!`: a literal here is greppable, reviewable and
//! verified at boot by `Catalog::audit(keys::ALL, keys::PLURAL)`.

macro_rules! define_keys {
    ($($name:ident = $lit:literal;)*) => {
        $(pub const $name: &str = $lit;)*
        /// Keys the default locale must contain verbatim.
        pub const ALL: &[&str] = &[$($lit),*];
    };
}

define_keys! {
    BRAND_NAME = "email_brand_name";
    BRAND_FOOTER = "email_brand_footer";
    BRAND_FALLBACKLINK = "email_brand_fallbacklink";
    OTP_SIGNIN_SUBJECT = "email_otp_signin_subject";
    OTP_SIGNIN_PREVIEW = "email_otp_signin_preview";
    OTP_SIGNIN_MESSAGE = "email_otp_signin_message";
    OTP_CHANGEEMAIL_SUBJECT = "email_otp_changeemail_subject";
    OTP_CHANGEEMAIL_PREVIEW = "email_otp_changeemail_preview";
    OTP_CHANGEEMAIL_MESSAGE = "email_otp_changeemail_message";
    OTP_VERIFYEMAIL_SUBJECT = "email_otp_verifyemail_subject";
    OTP_VERIFYEMAIL_PREVIEW = "email_otp_verifyemail_preview";
    OTP_VERIFYEMAIL_MESSAGE = "email_otp_verifyemail_message";
    OTP_FORGOTPASSWORD_SUBJECT = "email_otp_forgotpassword_subject";
    OTP_FORGOTPASSWORD_PREVIEW = "email_otp_forgotpassword_preview";
    OTP_FORGOTPASSWORD_MESSAGE = "email_otp_forgotpassword_message";
    OTP_TITLE = "email_otp_title";
    VERIFYEMAIL_SUBJECT = "email_verifyemail_subject";
    VERIFYEMAIL_PREVIEW = "email_verifyemail_preview";
    VERIFYEMAIL_TITLE = "email_verifyemail_title";
    VERIFYEMAIL_MESSAGE = "email_verifyemail_message";
    VERIFYEMAIL_ACTION = "email_verifyemail_action";
    VERIFYEMAIL_DETAIL = "email_verifyemail_detail";
    MEMBERJOINED_SUBJECT = "email_memberjoined_subject";
    MEMBERJOINED_PREVIEW = "email_memberjoined_preview";
    MEMBERJOINED_TITLE = "email_memberjoined_title";
    MEMBERJOINED_MESSAGE = "email_memberjoined_message";
    NEWSIGNIN_SUBJECT = "email_newsignin_subject";
    NEWSIGNIN_PREVIEW = "email_newsignin_preview";
    NEWSIGNIN_TITLE = "email_newsignin_title";
    NEWSIGNIN_WITHIP = "email_newsignin_withip";
    NEWSIGNIN_WITHOUTIP = "email_newsignin_withoutip";
    NEWSIGNIN_DETAIL = "email_newsignin_detail";
    INVITE_SUBJECT = "email_invite_subject";
    INVITE_PREVIEW = "email_invite_preview";
    INVITE_TITLE = "email_invite_title";
    INVITE_MESSAGE = "email_invite_message";
    INVITE_ACTION = "email_invite_action";
    READERINVITE_SUBJECT = "email_readerinvite_subject";
    READERINVITE_PREVIEW = "email_readerinvite_preview";
    READERINVITE_TITLE = "email_readerinvite_title";
    READERINVITE_MESSAGE = "email_readerinvite_message";
    READERINVITE_ACTION = "email_readerinvite_action";
    DEPLOYMENT_READY_SUBJECT = "email_deployment_ready_subject";
    DEPLOYMENT_READY_PREVIEW = "email_deployment_ready_preview";
    DEPLOYMENT_READY_TITLE = "email_deployment_ready_title";
    DEPLOYMENT_READY_MESSAGE = "email_deployment_ready_message";
    DEPLOYMENT_READY_ACTION = "email_deployment_ready_action";
    DEPLOYMENT_FAILED_SUBJECT = "email_deployment_failed_subject";
    DEPLOYMENT_FAILED_PREVIEW = "email_deployment_failed_preview";
    DEPLOYMENT_FAILED_TITLE = "email_deployment_failed_title";
    DEPLOYMENT_FAILED_MESSAGE = "email_deployment_failed_message";
    DEPLOYMENT_FAILED_DETAIL = "email_deployment_failed_detail";
}

// Plural groups follow the web convention already used in `en.json`
// (`settings_members_count_one` / `_other`): the default locale must provide
// `<base>_other` (or, for legacy files, the bare `<base>`).
pub const OTP_EXPIRY: &str = "email_otp_expiry";
pub const INVITE_EXPIRY: &str = "email_invite_expiry";
pub const READERINVITE_EXPIRY: &str = "email_readerinvite_expiry";

/// Plural groups, resolved through `Catalog::format_plural`.
pub const PLURAL: &[&str] = &[OTP_EXPIRY, INVITE_EXPIRY, READERINVITE_EXPIRY];
