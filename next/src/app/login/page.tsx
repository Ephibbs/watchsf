'use client'

import { StytchLogin } from '@stytch/nextjs'
import { Products } from '@stytch/vanilla-js'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://localhost:3000'

export default function LoginPage() {
  const config = {
    products: [Products.emailMagicLinks],
    emailMagicLinksOptions: {
      loginRedirectURL: `${BASE_URL}/authenticate`,
      loginExpirationMinutes: 30,
      signupRedirectURL: `${BASE_URL}/authenticate`,
      signupExpirationMinutes: 30,
    },
    styles: {
      container: {
        width: '100%',
        maxWidth: '400px',
      },
      buttons: {
        primary: {
          backgroundColor: '#2563eb',
          borderColor: '#2563eb',
        },
      },
    },
  }

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-md">
        <StytchLogin config={config} />
      </div>
    </div>
  )
} 