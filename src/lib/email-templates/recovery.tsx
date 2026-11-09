import * as React from 'react'

import { EmailButton, EmailFallbackLink, EmailText, MealDeckEmail } from './mealdeck-layout'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <MealDeckEmail
    preview={`Reset your ${siteName} password`}
    heading="Reset your password"
    footerNote="If you didn't ask to reset your password, you can ignore this email. Your password won't change."
  >
    <EmailText>
      We received a request to reset the password for your {siteName} account. Tap the button
      below to choose a new one.
    </EmailText>
    <EmailButton href={confirmationUrl}>Choose a new password</EmailButton>
    <EmailFallbackLink href={confirmationUrl} />
  </MealDeckEmail>
)

export default RecoveryEmail
