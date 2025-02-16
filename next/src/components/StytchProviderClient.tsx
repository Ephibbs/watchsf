'use client'

import { StytchProvider } from '@stytch/nextjs'
import { createStytchUIClient } from '@stytch/nextjs/ui'

const stytchClient = createStytchUIClient(
  process.env.NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN!
)

export default function StytchProviderClient({
  children,
}: {
  children: React.ReactNode
}) {
  return <StytchProvider stytch={stytchClient}>{children}</StytchProvider>
} 