import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

// Shared MealDeck branding for account emails. Email clients need inline
// literal colours; these mirror the app's red + gold brand tokens.
export const BRAND = {
  red: '#B3261E',
  gold: '#C9A227',
  ink: '#1F1410',
  body: '#4A3F3A',
  muted: '#8A7F79',
  panel: '#FBF6EE',
  siteUrl: 'https://mealdeck.co.uk',
  logoUrl: 'https://mealdeck.co.uk/email/mealdeck-card-logo-v2.png',
  supportEmail: 'info@mealdeck.co.uk',
}

const fontStack = "'DM Sans', 'Helvetica Neue', Arial, sans-serif"
const displayStack = "'Outfit', 'Helvetica Neue', Arial, sans-serif"

interface MealDeckEmailProps {
  preview: string
  heading: string
  children: React.ReactNode
  footerNote?: string
}

export const MealDeckEmail = ({ preview, heading, children, footerNote }: MealDeckEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>{preview}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Link href={BRAND.siteUrl}>
            <Img src={BRAND.logoUrl} width="180" height="180" alt="MealDeck" style={logo} />
          </Link>
        </Section>
        <Hr style={goldRule} />
        <Section style={content}>
          <Heading style={h1}>{heading}</Heading>
          {children}
        </Section>
        <Hr style={softRule} />
        <Section>
          {footerNote ? <Text style={footer}>{footerNote}</Text> : null}
          <Text style={footer}>
            Questions? Reply to this email or contact{' '}
            <Link href={`mailto:${BRAND.supportEmail}`} style={footerLink}>
              {BRAND.supportEmail}
            </Link>
            .
          </Text>
          <Text style={footerSmall}>
            MealDeck is a trading name of 313 Brands Ltd ·{' '}
            <Link href={BRAND.siteUrl} style={footerLink}>
              mealdeck.co.uk
            </Link>
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const EmailText = ({ children }: { children: React.ReactNode }) => (
  <Text style={text}>{children}</Text>
)

export const EmailButton = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Section style={buttonWrap}>
    <Button className="dm-btn" style={button} href={href}>
      {children}
    </Button>
  </Section>
)

export const EmailFallbackLink = ({ href }: { href: string }) => (
  <Text style={fallback}>
    Button not working? Copy this link into your browser:
    <br />
    <Link href={href} style={fallbackLink}>
      {href}
    </Link>
  </Text>
)

export const EmailCode = ({ code }: { code: string }) => (
  <Section style={codePanel}>
    <Text style={codeText}>{code}</Text>
  </Section>
)

export const emailLink = { color: BRAND.red, textDecoration: 'underline', fontWeight: 600 }

const main = { backgroundColor: '#ffffff', fontFamily: fontStack, margin: 0, padding: 0 }
const container = { maxWidth: '560px', margin: '0 auto', padding: '28px 24px 32px' }
const header = { textAlign: 'center' as const }
const logo = { display: 'block', margin: '0 auto', height: 'auto' }
const goldRule = { borderColor: BRAND.gold, borderWidth: '2px 0 0', margin: '20px 0 24px' }
const softRule = { borderColor: '#EDE4D8', margin: '32px 0 16px' }
const content = { padding: '0 4px' }
const h1 = {
  fontFamily: displayStack,
  fontSize: '24px',
  fontWeight: 800,
  color: BRAND.ink,
  margin: '0 0 18px',
  lineHeight: '1.25',
}
const text = { fontSize: '15px', color: BRAND.body, lineHeight: '1.6', margin: '0 0 18px' }
const buttonWrap = { textAlign: 'center' as const, margin: '28px 0 24px' }
const button = {
  backgroundColor: BRAND.red,
  color: '#ffffff',
  fontFamily: displayStack,
  fontSize: '15px',
  fontWeight: 700,
  borderRadius: '12px',
  padding: '14px 28px',
  textDecoration: 'none',
  display: 'inline-block',
}
const fallback = { fontSize: '12px', color: BRAND.muted, lineHeight: '1.5', margin: '0 0 8px', wordBreak: 'break-all' as const }
const fallbackLink = { color: BRAND.muted, textDecoration: 'underline' }
const codePanel = {
  backgroundColor: BRAND.panel,
  border: `1px solid ${BRAND.gold}`,
  borderRadius: '12px',
  margin: '8px 0 24px',
  textAlign: 'center' as const,
}
const codeText = {
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: '30px',
  fontWeight: 700,
  letterSpacing: '6px',
  color: BRAND.ink,
  margin: '18px 0',
}
const footer = { fontSize: '12px', color: BRAND.muted, lineHeight: '1.5', margin: '0 0 8px' }
const footerSmall = { fontSize: '11px', color: BRAND.muted, lineHeight: '1.5', margin: '8px 0 0' }
const footerLink = { color: BRAND.muted, textDecoration: 'underline' }
// Rendered as a text child, which React may HTML-escape: keep this CSS free of >, &, and quotes.
const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .dm-btn { background-color: #D93A2F !important; color: #ffffff !important; }
  }
  [data-ogsc] .dm-btn { background-color: #D93A2F !important; color: #ffffff !important; }
  [data-ogsb] .dm-btn { background-color: #D93A2F !important; color: #ffffff !important; }
`
