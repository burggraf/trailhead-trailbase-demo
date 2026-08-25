import { BookOpen, LogOut, Mail, Map, Moon, Settings, Sun, UserRound } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { AuthenticatedImage } from './AuthenticatedImage'
import { Button } from './ui'
import { client, extension } from '../lib/trailbase'
import type { PendingInvite } from '../types'

const redirectedUsers = new Set<string>()

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const invitations = useQuery({ queryKey: ['invites', user?.id], queryFn: async () => (await extension<{ records: PendingInvite[] }>('/invites')).records, enabled: !!user?.email })
  const [dark, setDark] = useState(() => { try { return window.localStorage.theme === 'dark' || (!('theme' in window.localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches) } catch { return false } })
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); try { window.localStorage.theme = dark ? 'dark' : 'light' } catch { /* keep the in-memory preference */ } }, [dark])
  useEffect(() => {
    if (!user || !invitations.data?.length || location.pathname === '/invitations') return
    const key = `trailhead-invitation-redirect:${user.id}`
    if (redirectedUsers.has(key)) return
    try {
      if (window.sessionStorage.getItem(key)) {
        redirectedUsers.add(key)
        return
      }
      window.sessionStorage.setItem(key, '1')
    } catch { /* the in-memory fallback still prevents repeated redirects */ }
    redirectedUsers.add(key)
    navigate('/invitations')
  }, [invitations.data, location.pathname, navigate, user])
  const avatar = user ? client.avatarUrl(user.id) : undefined

  return <div className="min-h-screen bg-canvas">
    <header className="sticky top-0 z-30 border-b border-white/10 bg-forest text-white shadow-lg shadow-forest/10">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-5 px-4 sm:px-6">
        <NavLink to="/" className="mr-auto flex items-center gap-2 text-lg font-black"><img src="/trailhead-logo.svg" className="size-9" alt="" />Trailhead</NavLink>
        <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">
          <NavLink to="/" end className="nav-link"><Map size={17} />Trips</NavLink>
          <NavLink to="/learn" className="nav-link"><BookOpen size={17} />Learn</NavLink>
        </nav>
        <NavLink to="/invitations" aria-label={`Invitations ${invitations.data?.length ?? 0}`} className="relative inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white/75 hover:bg-white/10 hover:text-white"><Mail size={18} /><span className="hidden md:inline">Invitations</span>{!!invitations.data?.length && <span className="grid min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-xs font-black text-forest">{invitations.data.length}</span>}</NavLink>
        <Button variant="ghost" className="size-10 px-0 text-white/75 hover:bg-white/10 hover:text-white" aria-label="Toggle dark mode" onClick={() => setDark(!dark)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</Button>
        <div className="group relative">
          <button className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-white/10" aria-label="Account menu">
            <span className="relative grid size-8 place-items-center rounded-lg bg-amber-400 text-forest">
              <UserRound size={17} />
              {avatar && <AuthenticatedImage src={avatar} className="absolute inset-0 size-8 rounded-lg object-cover" alt="" />}
            </span>
          </button>
          <div className="invisible absolute right-0 top-11 w-56 translate-y-1 rounded-xl border border-border bg-card p-2 text-ink opacity-0 shadow-xl transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
            <p className="truncate px-3 py-2 text-xs text-muted">{user?.email ?? user?.username ?? 'Anonymous traveler'}</p>
            <NavLink className="menu-link" to="/profile"><UserRound size={16} />Profile</NavLink>
            <NavLink className="menu-link" to="/settings"><Settings size={16} />Settings</NavLink>
            <button className="menu-link w-full" onClick={async () => { await logout(); navigate('/login') }}><LogOut size={16} />Sign out</button>
          </div>
        </div>
      </div>
    </header>
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
  </div>
}
