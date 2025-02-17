'use client'

import { useStytch } from '@stytch/nextjs'
import { useRouter } from 'next/navigation'

export default function Header() {
  const stytch = useStytch()
  const router = useRouter()

  const handleLogout = async () => {
    await stytch.session.revoke()
    router.push('/login')
  }

  return (
    <header className="w-full py-4 px-8 fixed top-0 z-50">
      <div className="max-w-7xl mx-auto flex justify-between items-center">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-red-300 to-red-400 bg-clip-text text-transparent">
          WatchSF
        </h1>
        <nav className="flex gap-4 items-center">
          <a href="#" className="text-gray-600 hover:text-primary transition-colors">About</a>
          <a href="#" className="text-gray-600 hover:text-primary transition-colors">Contact</a>
          <button 
            onClick={handleLogout}
            className="text-gray-600 hover:text-primary transition-colors"
          >
            Logout
          </button>
        </nav>
      </div>
    </header>
  )
} 