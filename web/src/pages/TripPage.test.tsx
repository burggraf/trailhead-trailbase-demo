// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Itinerary, Members } from './TripPage'
import type { Trip } from '../types'

const mocks = vi.hoisted(() => ({ extension: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }))
vi.mock('../lib/trailbase', () => ({
  client: {
    base: new URL('http://localhost:4000'),
    records: (name: string) => ({ create: (...args: unknown[]) => mocks.create(name, ...args), update: (...args: unknown[]) => mocks.update(name, ...args), delete: (...args: unknown[]) => mocks.remove(name, ...args), list: vi.fn().mockResolvedValue({ records: [] }), read: vi.fn() }),
  },
  extension: mocks.extension,
  recordFileUrl: vi.fn(),
}))

const trip: Trip = { id: 'trip-1', owner: 'u1', title: 'Trip', destination: 'Rome', start_date: '2026-10-01', end_date: '2026-10-04', status: 'planning', notes: '', latitude: null, longitude: null, cover: null, created: 0, updated: 0 }

describe('Itinerary suggestions', () => {
  it('hides suggestions for viewers and disables duplicate editor searches', async () => {
    const queryClient = new QueryClient(); const page = render(<QueryClientProvider client={queryClient}><Itinerary trip={trip} userId="u1" items={[]} canEdit={false} invalidate={vi.fn()} /></QueryClientProvider>)
    expect(page.queryByText('Suggest things to do')).toBeNull()
    page.rerender(<QueryClientProvider client={queryClient}><Itinerary trip={trip} userId="u1" items={[]} canEdit={true} invalidate={vi.fn()} /></QueryClientProvider>)
    mocks.extension.mockReturnValue(new Promise(() => undefined)); fireEvent.click(page.getByText('Suggest things to do')); expect(await page.findByRole('status')).toHaveTextContent('Searching for events and local attractions…'); expect(page.getByText('Suggest things to do').closest('button')).toBeDisabled()
  })
})

describe('trip owner invitations', () => {
  it('shows delivery status and lets the owner resend or cancel', async () => {
    const pending = { id: 'invite-1', email: 'guest@example.com', role: 'viewer', expires: 1_800_000_000, email_status: 'failed', last_sent: null }
    mocks.extension.mockImplementation(async (path: string) => path === '/trips/trip-1/invites' ? { records: [pending] } : { delivery: 'sent' })
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const page = render(<QueryClientProvider client={queryClient}><Members tripId="trip-1" members={[]} isOwner invalidate={vi.fn()} /></QueryClientProvider>)

    expect(await page.findByText('guest@example.com')).toBeTruthy()
    expect(page.getByText('Delivery failed')).toBeTruthy()
    fireEvent.click(page.getByRole('button', { name: 'Resend invitation' }))
    await waitFor(() => expect(mocks.extension).toHaveBeenCalledWith('/trips/trip-1/invites/invite-1/resend', { method: 'POST' }))
    fireEvent.click(page.getByRole('button', { name: 'Cancel invitation' }))
    await waitFor(() => expect(mocks.extension).toHaveBeenCalledWith('/trips/trip-1/invites/invite-1', { method: 'DELETE' }))
  })
})
