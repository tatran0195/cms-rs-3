use crate::types::EmailLanguage;

/// Translate a message key for the given language, interpolating placeholders like `{key}`.
pub fn translate(lang: &EmailLanguage, key: &str, vars: &[(&str, &str)]) -> String {
    let raw =
        lookup_raw(lang, key).unwrap_or_else(|| lookup_raw(&EmailLanguage::En, key).unwrap_or(key));

    let mut result = raw.to_string();
    for (k, v) in vars {
        let needle = format!("{{{}}}", k);
        result = result.replace(&needle, v);
    }
    result
}

fn lookup_raw(lang: &EmailLanguage, key: &str) -> Option<&'static str> {
    match lang {
        EmailLanguage::Ar => lookup_ar(key).or_else(|| lookup_en(key)),
        EmailLanguage::Ja => lookup_ja(key).or_else(|| lookup_en(key)),
        _ => lookup_en(key),
    }
}

fn lookup_en(key: &str) -> Option<&'static str> {
    Some(match key {
        "email.brand.name" => "TechnoStar",
        "email.brand.footer" => {
            "This automated message was sent by TechnoStar. If you did not request it, you can \
             safely ignore it."
        }
        "email.brand.fallbackLink" => {
            "If the button does not work, copy and paste this link into your browser:"
        }

        "email.otp.signIn.subject" => "Your cms sign-in code",
        "email.otp.signIn.preview" => "Use this one-time code to sign in.",
        "email.otp.signIn.message" => "Use this one-time code to sign in.",

        "email.otp.changeEmail.subject" => "Your cms code to change your email",
        "email.otp.changeEmail.preview" => "Use this one-time code to change your email.",
        "email.otp.changeEmail.message" => "Use this one-time code to change your email.",

        "email.otp.verifyEmail.subject" => "Your cms email verification code",
        "email.otp.verifyEmail.preview" => "Use this one-time code to verify your email.",
        "email.otp.verifyEmail.message" => "Use this one-time code to verify your email.",

        "email.otp.forgotPassword.subject" => "Your cms password reset code",
        "email.otp.forgotPassword.preview" => "Use this one-time code to reset your password.",
        "email.otp.forgotPassword.message" => "Use this one-time code to reset your password.",

        "email.otp.title" => "Your cms code",
        "email.otp.expiry" => "The code expires in {minutes} minutes and can be used only once.",

        "email.verifyEmail.subject" => "Verify your cms email",
        "email.verifyEmail.preview" => "Confirm your email address to finish setting up cms.",
        "email.verifyEmail.title" => "Verify your email address",
        "email.verifyEmail.message" => {
            "Confirm this email address to finish setting up your cms account."
        }
        "email.verifyEmail.action" => "Verify email",
        "email.verifyEmail.detail" => {
            "This verification link is single-use. If it expires, request a new one from the \
             sign-in page."
        }

        "email.memberJoined.subject" => "{memberName} joined {organizationName}",
        "email.memberJoined.preview" => "{memberName} joined {organizationName}.",
        "email.memberJoined.title" => "New teammate in {organizationName}",
        "email.memberJoined.message" => {
            "{memberName} just joined {organizationName} and can now collaborate on its \
             documentation."
        }

        "email.newSignIn.subject" => "New sign-in to your cms account",
        "email.newSignIn.preview" => "We noticed a sign-in from a new device or location.",
        "email.newSignIn.title" => "New sign-in detected",
        "email.newSignIn.withIp" => {
            "We noticed a new sign-in to your account from a new location (IP {ipAddress})."
        }
        "email.newSignIn.withoutIp" => {
            "We noticed a new sign-in to your account from a new device."
        }
        "email.newSignIn.detail" => {
            "If this was not you, sign out other sessions immediately and contact support@cms.com."
        }

        "email.invite.subject" => "{inviterName} invited you to {organizationName} on cms",
        "email.invite.preview" => "Join {organizationName} on cms.",
        "email.invite.title" => "You're invited to {organizationName}",
        "email.invite.message" => {
            "{inviterName} invited you to collaborate on documentation in {organizationName} as \
             {role}."
        }
        "email.invite.action" => "Accept invitation",
        "email.invite.expiry" => "This invitation expires in {days} days.",

        "email.readerInvite.subject" => "Your access to {projectName}",
        "email.readerInvite.preview" => "You were invited to read {projectName}.",
        "email.readerInvite.title" => "Private documentation access",
        "email.readerInvite.message" => "You were invited to read {projectName}.",
        "email.readerInvite.action" => "Activate reader access",
        "email.readerInvite.expiry" => "This one-time link expires in {days} days.",

        "email.deployment.ready.subject" => "{projectName} published — v{version} is live",
        "email.deployment.ready.preview" => {
            "{projectName} version {version} published successfully."
        }
        "email.deployment.ready.title" => "{projectName} is live",
        "email.deployment.ready.message" => {
            "Version v{version} of {projectName} published successfully and is now live."
        }
        "email.deployment.ready.action" => "View site",

        "email.deployment.failed.subject" => "{projectName} publish failed (v{version})",
        "email.deployment.failed.preview" => "{projectName} version {version} did not publish.",
        "email.deployment.failed.title" => "{projectName} failed to publish",
        "email.deployment.failed.message" => {
            "Publishing version v{version} of {projectName} failed."
        }
        "email.deployment.failed.detail" => "Error: {error}",

        _ => return None,
    })
}

fn lookup_ar(key: &str) -> Option<&'static str> {
    Some(match key {
        "email.brand.name" => "تكنوستار",
        "email.brand.footer" => {
            "تم إرسال هذه الرسالة الآلية بواسطة تكنوستار. إذا لم تكن قد طلبتها، يمكنك تجاهلها \
             بأمان."
        }
        "email.brand.fallbackLink" => "إذا كان الزر لا يعمل، انسخ هذا الرابط والصقه في متصفحك:",

        "email.otp.signIn.subject" => "رمز تسجيل الدخول الخاص بك في نيبليف",
        "email.otp.signIn.preview" => "استخدم هذا الرمز لمرة واحدة لتسجيل الدخول.",
        "email.otp.signIn.message" => "استخدم هذا الرمز لمرة واحدة لتسجيل الدخول.",

        "email.newSignIn.subject" => "تسجيل دخول جديد إلى حسابك في نيبليف",
        "email.newSignIn.preview" => "رصدنا تسجيل دخول من جهاز أو موقع جديد.",
        "email.newSignIn.title" => "تم رصد تسجيل دخول جديد",
        "email.newSignIn.withIp" => {
            "رصدنا تسجيل دخول جديد إلى حسابك من موقع جديد (عنوان IP {ipAddress})."
        }
        "email.newSignIn.withoutIp" => "رصدنا تسجيل دخول جديد إلى حسابك من جهاز جديد.",
        "email.newSignIn.detail" => {
            "إذا لم يكن هذا أنت، قم بتسجيل الخروج من الجلسات الأخرى فوراً وتواصل مع الدعم."
        }

        "email.verifyEmail.subject" => "تأكيد بريدك الإلكتروني في نيبليف",
        "email.verifyEmail.action" => "تأكيد البريد الإلكتروني",

        "email.invite.action" => "قبول الدعوة",
        "email.readerInvite.action" => "تفعيل وصول القارئ",

        _ => return None,
    })
}

fn lookup_ja(key: &str) -> Option<&'static str> {
    Some(match key {
        "email.brand.name" => "TechnoStar",
        "email.brand.footer" => {
            "この自動送信メールは TechnoStar \
             より送信されました。心当たりがない場合は破棄してください。"
        }
        "email.brand.fallbackLink" => {
            "ボタンが機能しない場合は、次のURLをブラウザに貼り付けてください:"
        }

        "email.otp.signIn.subject" => "CMS サインイン コード",
        "email.otp.signIn.preview" => "このワンタイムコードを使用してサインインしてください。",
        "email.otp.signIn.message" => "このワンタイムコードを使用してサインインしてください。",

        "email.otp.changeEmail.subject" => "メールアドレス変更の確認コード",
        "email.otp.changeEmail.preview" => {
            "このワンタイムコードを使用してメールアドレスを変更してください。"
        }
        "email.otp.changeEmail.message" => {
            "このワンタイムコードを使用してメールアドレスを変更してください。"
        }

        "email.otp.verifyEmail.subject" => "CMS メールアドレス確認コード",
        "email.otp.verifyEmail.preview" => {
            "このワンタイムコードを使用してメールアドレスを確認してください。"
        }
        "email.otp.verifyEmail.message" => {
            "このワンタイムコードを使用してメールアドレスを確認してください。"
        }

        "email.otp.forgotPassword.subject" => "CMS パスワードリセットコード",
        "email.otp.forgotPassword.preview" => {
            "このワンタイムコードを使用してパスワードをリセットしてください。"
        }
        "email.otp.forgotPassword.message" => {
            "このワンタイムコードを使用してパスワードをリセットしてください。"
        }

        "email.otp.title" => "CMS 認証コード",
        "email.otp.expiry" => "このコードの有効期限は {minutes} 分で、1回のみ使用可能です。",

        "email.verifyEmail.subject" => "CMS メールアドレスの確認",
        "email.verifyEmail.preview" => "メールアドレスを確認してCMSの設定を完了してください。",
        "email.verifyEmail.title" => "メールアドレスの確認",
        "email.verifyEmail.message" => {
            "このメールアドレスを確認してCMSアカウントの設定を完了してください。"
        }
        "email.verifyEmail.action" => "メールアドレスを確認",
        "email.verifyEmail.detail" => {
            "この確認リンクは1回のみ有効です。有効期限が切れた場合は再リクエストしてください。"
        }

        "email.memberJoined.subject" => "{memberName} が {organizationName} に参加しました",
        "email.memberJoined.preview" => "{memberName} が {organizationName} に参加しました。",
        "email.memberJoined.title" => "{organizationName} の新しいチームメンバー",
        "email.memberJoined.message" => {
            "{memberName} が {organizationName} \
             に参加し、ドキュメントの共同作業が可能になりました。"
        }

        "email.newSignIn.subject" => "CMS アカウントへの新しいサインイン",
        "email.newSignIn.preview" => "新しいデバイスまたは場所からのサインインを検出しました。",
        "email.newSignIn.title" => "新しいサインインを検出しました",
        "email.newSignIn.withIp" => {
            "新しい場所 (IP: {ipAddress}) からのアカウントへのサインインを検出しました。"
        }
        "email.newSignIn.withoutIp" => {
            "新しいデバイスからのアカウントへのサインインを検出しました。"
        }
        "email.newSignIn.detail" => {
            "ご自身によるサインインでない場合は、直ちに他のセッションからログアウトし、\
             サポートにご連絡ください。"
        }

        "email.invite.subject" => {
            "{inviterName} があなたを CMS の {organizationName} に招待しました"
        }
        "email.invite.preview" => "CMS で {organizationName} に参加しましょう。",
        "email.invite.title" => "{organizationName} への招待",
        "email.invite.message" => {
            "{inviterName} があなたを {organizationName} の {role} として招待しました。"
        }
        "email.invite.action" => "招待を承諾",
        "email.invite.expiry" => "この招待の有効期限は {days} 日間です。",

        "email.readerInvite.subject" => "{projectName} への閲覧アクセス権",
        "email.readerInvite.preview" => "{projectName} の閲覧に招待されました。",
        "email.readerInvite.title" => "限定ドキュメントへのアクセス",
        "email.readerInvite.message" => "{projectName} の閲覧に招待されました。",
        "email.readerInvite.action" => "閲覧アクセスを有効化",
        "email.readerInvite.expiry" => "このリンクの有効期限は {days} 日間です。",

        "email.deployment.ready.subject" => {
            "{projectName} の公開完了 — v{version} が公開されました"
        }
        "email.deployment.ready.preview" => {
            "{projectName} バージョン {version} の公開が完了しました。"
        }
        "email.deployment.ready.title" => "{projectName} が公開されました",
        "email.deployment.ready.message" => {
            "{projectName} バージョン v{version} が正常に公開され、現在利用可能です。"
        }
        "email.deployment.ready.action" => "サイトを表示",

        "email.deployment.failed.subject" => "{projectName} の公開失敗 (v{version})",
        "email.deployment.failed.preview" => {
            "{projectName} バージョン {version} の公開に失敗しました。"
        }
        "email.deployment.failed.title" => "{projectName} の公開に失敗しました",
        "email.deployment.failed.message" => {
            "{projectName} バージョン v{version} の公開中にエラーが発生しました。"
        }
        "email.deployment.failed.detail" => "エラー: {error}",

        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_interpolation() {
        let translated = translate(&EmailLanguage::En, "email.otp.expiry", &[("minutes", "10")]);
        assert_eq!(
            translated,
            "The code expires in 10 minutes and can be used only once."
        );
    }

    #[test]
    fn test_arabic_override() {
        let translated = translate(&EmailLanguage::Ar, "email.newSignIn.subject", &[]);
        assert_eq!(translated, "تسجيل دخول جديد إلى حسابك في نيبليف");
    }
}
