import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import * as stytch from 'stytch'

// Initialize the Stytch backend client
const client = new stytch.Client({
  project_id: process.env.STYTCH_PROJECT_ID as string,
  secret: process.env.STYTCH_SECRET as string,
})

export async function middleware(req: NextRequest) {
  // Public paths that don't require authentication
  const publicPaths = [
    '/login',
    '/api',
    '/_next',
    '/authenticate',
    '/favicon.ico',
    '/static',
    '/originalevan_simple_digital_icon_of_the_golden_gate_bridge_--_0f9cbc8b-0951-450d-ae37-143e8f76c577_0.svg'
  ]

  // Check if the current path is public
  if (publicPaths.some(path => req.nextUrl.pathname === path || req.nextUrl.pathname.startsWith(path))) {
    return NextResponse.next()
  }

  // Check for session token
  const sessionJwt = req.cookies.get('stytch_session_jwt')?.value

  // Also check for headless client session token
  const headlessSessionJwt = req.cookies.get('stytch_session_react_jwt')?.value

  if (!sessionJwt && !headlessSessionJwt) {
    console.log('No session JWT found, redirecting to login')
    return NextResponse.redirect(new URL('/login', req.url))
  }

  try {
    // Try to verify whichever token exists
    const token = sessionJwt || headlessSessionJwt
    await client.sessions.authenticate({ session_jwt: token })
    return NextResponse.next()
  } catch (error) {
    // Log the error details
    console.error('Session verification failed:', error)
    // Clear invalid cookies and redirect to login
    const response = NextResponse.redirect(new URL('/login', req.url))
    response.cookies.delete('stytch_session_jwt')
    response.cookies.delete('stytch_session_react_jwt')
    return response
  }
}

// Configure which routes to run middleware on
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
} 