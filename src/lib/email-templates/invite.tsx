import * as React from 'react'

import { EmailButton, EmailFallbackLink, EmailText, MealDeckEmail } from './mealdeck-layout'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteName, confirmationUrl }: InviteEmailProps) => (
  <MealDeckEmail
    preview={`You've been invited to ${siteName}`}
    heading="You're invited to MealDeck"
    footerNote="If you weren't expecting this invitation, you can safely ignore this email."
  >
    <EmailText>
      You've been invited to create a {siteName} account. Tap the button below to accept and set
      up your account.
    </EmailText>
    <EmailButton href={confirmationUrl}>Accept invitation</EmailButton>
    <EmailFallbackLink href={confirmationUrl} />
  </MealDeckEmail>
)

export default InviteEmail
