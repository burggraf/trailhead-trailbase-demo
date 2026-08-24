import { useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { AuthProvider, Protected } from './auth'
import { AppShell } from './components/AppShell'
import { client } from './lib/trailbase'
import { DashboardPage } from './pages/DashboardPage'
import { LearnPage } from './pages/LearnPage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { SettingsPage } from './pages/SettingsPage'
import { TripPage } from './pages/TripPage'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } })

function AuthCallback() {
  const navigate = useNavigate()
  useEffect(() => { client.checkCookies().finally(() => navigate(client.user() ? '/' : '/login', { replace: true })) }, [navigate])
  return <div className="grid min-h-screen place-items-center text-sm text-muted">Finishing sign in…</div>
}

function PrivatePage({ children }: { children: React.ReactNode }) {
  return <Protected><AppShell>{children}</AppShell></Protected>
}

export default function App() {
  return <QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider><Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/auth/callback" element={<AuthCallback />} />
    <Route path="/" element={<PrivatePage><DashboardPage /></PrivatePage>} />
    <Route path="/trips/:tripId" element={<PrivatePage><TripPage /></PrivatePage>} />
    <Route path="/profile" element={<PrivatePage><ProfilePage /></PrivatePage>} />
    <Route path="/settings" element={<PrivatePage><SettingsPage /></PrivatePage>} />
    <Route path="/learn" element={<PrivatePage><LearnPage /></PrivatePage>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></AuthProvider></BrowserRouter></QueryClientProvider>
}
