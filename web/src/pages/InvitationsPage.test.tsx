// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from '../components/AppShell'
import { InvitationsPage } from './InvitationsPage'

const mocks = vi.hoisted(() => ({
  extension: vi.fn(),
  logout: vi.fn(),
  user: undefined as undefined | { id: string; email: string },
}))

vi.mock('../auth', () => ({
  useAuth: () => ({ user: mocks.user, ready: true, logout: mocks.logout }),
}))
vi.mock('../lib/trailbase', () => ({
  authUi: (path: string, redirect: string) => `http://localhost:4000/_/auth/${path}?redirect_uri=${encodeURIComponent(redirect)}`,
  client: { avatarUrl: () => undefined },
  extension: mocks.extension,
}))

function view(node: React.ReactNode, path = '/invitations') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[path]}>{node}</MemoryRouter></QueryClientProvider>)
}

const invitation = {
  id: 'invite-1',
  trip_id: 'trip-1',
  trip_title: 'Alpine Escape',
  destination: 'Innsbruck, Austria',
  inviter_name: 'Alice',
  role: 'editor',
  expires: 1_800_000_000,
}

describe('InvitationsPage', () => {
  beforeEach(() => {
    mocks.extension.mockReset()
    mocks.logout.mockReset()
    mocks.user = undefined
    sessionStorage.clear()
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) })
  })

  it('offers account creation and sign in without exposing invitations when signed out', () => {
    const page = view(<InvitationsPage />)
    expect(page.getByRole('link', { name: 'Create an account' }).getAttribute('href')).toContain('/_/auth/register')
    expect(page.getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login')
    expect(mocks.extension).not.toHaveBeenCalled()
  })

  it('lets the matching user accept or decline an invitation without a token', async () => {
    mocks.user = { id: 'user-1', email: 'guest@example.com' }
    mocks.extension.mockImplementation(async (path: string) => path === '/invites' ? { records: [invitation] } : path.endsWith('/accept') ? { trip_id: 'trip-1' } : { declined: true })
    const page = view(<InvitationsPage />)

    expect(await page.findByText('Alpine Escape')).toBeTruthy()
    fireEvent.click(page.getByRole('button', { name: 'Decline' }))
    await waitFor(() => expect(mocks.extension).toHaveBeenCalledWith('/invites/invite-1', { method: 'DELETE' }))
  })

  it('shows a persistent invitation count in the app header', async () => {
    mocks.user = { id: 'user-1', email: 'guest@example.com' }
    mocks.extension.mockResolvedValue({ records: [invitation] })
    const page = view(<AppShell><div>Trips</div></AppShell>)
    const link = await page.findByRole('link', { name: /Invitations.*1/ })
    expect(link.getAttribute('href')).toBe('/invitations')
  })
})
