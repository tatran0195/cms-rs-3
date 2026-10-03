import React from 'react';
import { Body, Container, Head, Hr, Html, Img, Preview, Section, Text } from 'react-email';
import { createEmailTranslator, type EmailLanguage, emailDirection } from '../translate';

const colors = {
  background: '#f1f5f9',
  border: '#e2e8f0',
  brand: '#0f172a',
  footer: '#64748b',
  surface: '#ffffff',
  surfaceMuted: '#f8fafc',
};

const bodyStyle: React.CSSProperties = {
  backgroundColor: colors.background,
  color: colors.brand,
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  margin: 0,
  padding: '24px 12px',
};

export function BaseEmail({
  children,
  language,
  logoUrl = '/brand/technostar-logo.png',
  preview,
}: {
  children: React.ReactNode;
  language: EmailLanguage;
  logoUrl?: string;
  preview: string;
}) {
  const t = createEmailTranslator(language);
  const direction = emailDirection(language);

  return (
    <Html dir={direction} lang={language}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={bodyStyle}>
        <Container
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: '16px',
            margin: '0 auto',
            maxWidth: '560px',
            overflow: 'hidden',
          }}
        >
          <Section style={{ padding: '24px 28px', textAlign: direction === 'rtl' ? 'right' : 'left' }}>
            <Img
              alt={t('email.brand.name')}
              height="32"
              src={logoUrl}
              style={{
                border: 'none',
                display: direction === 'rtl' ? 'inline-block' : 'block',
                height: '32px',
                outline: 'none',
                textDecoration: 'none',
                width: 'auto',
              }}
            />
          </Section>
          <Hr style={{ borderColor: colors.border, margin: 0 }} />
          {children}
          <Section style={{ backgroundColor: colors.surfaceMuted, padding: '18px 28px' }}>
            <Text style={{ color: colors.footer, fontSize: '12px', lineHeight: 1.55, margin: 0 }}>{t('email.brand.footer')}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
