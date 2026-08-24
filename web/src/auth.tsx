/* oxlint-disable react/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from 'trailbase'
import { Navigate, useLocation } from 'react-router-dom'
import { client, onAuthChange } from './lib/trailbase'

interface AuthState {
  user?: User
  ready: boolean
  login: (identifier: string, password: string) => Promise<void>
  logout: () => Promise<void>
  anonymous: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | undefined>(() => client.user())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthChange(setUser)
    client.checkCookies().catch(() => undefined).finally(() => {
      setUser(client.user())
      setReady(true)
    })
    return unsubscribe
  }, [])

  const value = useMemo<AuthState>(() => ({
    user,
    ready,
    login: async (identifier, password) => {
      const mfa = await client.login(identifier, password)
      if (mfa) throw new Error('This account requires a TOTP code. Use TrailBase’s built-in login screen.')
    },
    logout: async () => { await client.logout() },
    anonymous: async () => { await client.loginAnonymously() },
  }), [ready, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used within AuthProvider')
  return auth
}

export function Protected({ children }: { children: ReactNode }) {
  const { ready, user } = useAuth()
  const location = useLocation()
  if (!ready) return <div className="grid min-h-screen place-items-center text-sm text-muted">Connecting to TrailBase…</div>
  if (!user) return <Navigate to={`/login${location.search}`} replace state={{ from: location.pathname }} />
  return children
}
