'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useStytch, useStytchUser } from '@stytch/nextjs'

export default function AuthenticatePage() {
  const stytch = useStytch()
  const { user } = useStytchUser()
  const router = useRouter()

  useEffect(() => {
    // If user is already authenticated, redirect to home
    if (user) {
      console.log('User already authenticated, redirecting to home')
      router.replace('/')
      return
    }

    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const tokenType = params.get('stytch_token_type')
    console.log('Authentication attempt:', {
      token: token,
      tokenType: tokenType,
      fullUrl: window.location.href,
      searchParams: window.location.search
    })

    if (token && tokenType === 'magic_links') {
      console.log('Attempting to authenticate magic link...')
      stytch.magicLinks.authenticate(token, {
        session_duration_minutes: 60,
      })
      .then(() => {
        console.log('Authentication successful')
        router.replace('/')
      })
      .catch((error) => {
        console.error('Authentication error details:', error)
        router.replace('/login')
      })
    } else {
      console.log('No valid token/tokenType found, redirecting to login')
      router.replace('/login')
    }
  }, [stytch, router, user])

  return (
    <div className="min-h-screen grid place-items-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Authenticating...</h1>
        <p className="text-gray-600">Please wait while we verify your login.</p>
      </div>
    </div>
  )
} 