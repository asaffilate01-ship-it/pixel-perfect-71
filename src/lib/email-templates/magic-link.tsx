import * as React from 'react'

import { EmailButton, EmailFallbackLink, EmailText, MealDeckEmail } from './mealdeck-layout'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <MealDeckEmail
    preview={`Your ${siteName} sign-in link`}
    heading="Sign in to MealDeck"
    footerNote="If you didn't ask for this link, you can safely ignore this email."
  >
    <EmailText>Tap the button below to sign in to your {siteName} account. This link expires shortly.</EmailText>
    <EmailButton href={confirmationUrl}>Sign in</EmailButton>
    <EmailFallbackLink href={confirmationUrl} />
  </MealDeckEmail>
)

export default MagicLinkEmail
