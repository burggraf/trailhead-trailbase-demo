// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Members } from './TripPage'

const mocks = vi.hoisted(() => ({ extension: vi.fn(), update: vi.fn(), remove: vi.fn() }))
vi.mock('../lib/trailbase', () => ({
  client: {
    base: new URL('http://localhost:4000'),
    records: () => ({ update: mocks.update, delete: mocks.remove }),
  },
  extension: mocks.extension,
  recordFileUrl: vi.fn(),
}))

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
