import * as React from 'react'

import { Link } from '@react-email/components'

import { EmailButton, EmailFallbackLink, EmailText, MealDeckEmail, emailLink } from './mealdeck-layout'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ siteName, recipient, confirmationUrl }: SignupEmailProps) => (
  <MealDeckEmail
    preview={`Confirm your email to finish joining ${siteName}`}
    heading="Welcome to MealDeck"
    footerNote="If you didn't create a MealDeck account, you can safely ignore this email."
  >
    <EmailText>
      Thanks for joining {siteName}. Please confirm that{' '}
      <Link href={`mailto:${recipient}`} style={emailLink}>
        {recipient}
      </Link>{' '}
      is your email address to finish setting up your account.
    </EmailText>
    <EmailButton href={confirmationUrl}>Confirm my email</EmailButton>
    <EmailFallbackLink href={confirmationUrl} />
  </MealDeckEmail>
)

export default SignupEmail
