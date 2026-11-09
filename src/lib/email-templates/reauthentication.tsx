import * as React from 'react'

import { EmailCode, EmailText, MealDeckEmail } from './mealdeck-layout'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <MealDeckEmail
    preview="Your MealDeck verification code"
    heading="Your verification code"
    footerNote="If you didn't request this code, you can safely ignore this email."
  >
    <EmailText>Use this code to confirm it's you. It expires shortly.</EmailText>
    <EmailCode code={token} />
  </MealDeckEmail>
)

export default ReauthenticationEmail
