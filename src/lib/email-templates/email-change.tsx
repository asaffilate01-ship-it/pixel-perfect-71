import * as React from 'react'

import { Link } from '@react-email/components'

import { EmailButton, EmailFallbackLink, EmailText, MealDeckEmail, emailLink } from './mealdeck-layout'

interface EmailChangeEmailProps {
  siteName: string
  // oldEmail is the user's current address (HookData.OldEmail). For the
  // NEW-recipient half of a secure email_change fanout, `email` equals the
  // recipient (NEW), so the "from" line must render oldEmail to read
  // "from OLD to NEW" instead of "from NEW to NEW".
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => {
  const fromAddress = oldEmail || email
  return (
    <MealDeckEmail
      preview={`Confirm your new ${siteName} email address`}
      heading="Confirm your new email"
      footerNote="If you didn't ask to change your email, please secure your account by resetting your password."
    >
      <EmailText>
        You asked to change the email on your {siteName} account from{' '}
        <Link href={`mailto:${fromAddress}`} style={emailLink}>
          {fromAddress}
        </Link>{' '}
        to{' '}
        <Link href={`mailto:${newEmail}`} style={emailLink}>
          {newEmail}
        </Link>
        .
      </EmailText>
      <EmailButton href={confirmationUrl}>Confirm email change</EmailButton>
      <EmailFallbackLink href={confirmationUrl} />
    </MealDeckEmail>
  )
}

export default EmailChangeEmail
