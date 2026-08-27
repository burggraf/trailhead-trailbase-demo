// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
const suggestion = { type: 'event' as const, title: 'Night Market', description: 'Local food and music.', place: 'Main Square', date: '2026-10-02', time: '', sources: [{ title: 'City events', url: 'https://city.example/event' }, { title: 'City events', url: 'https://city.example/event' }] }
const renderItinerary = (invalidate = vi.fn()) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><Itinerary trip={trip} userId="u1" items={[]} canEdit invalidate={invalidate} /></QueryClientProvider>)
afterEach(cleanup)
beforeEach(() => { mocks.extension.mockReset(); mocks.create.mockReset(); mocks.create.mockResolvedValue('id'); mocks.update.mockReset(); mocks.remove.mockReset(); vi.stubGlobal('confirm', vi.fn(() => true)) })

describe('Itinerary suggestions', () => {
  it('renders, deduplicates, dismisses, and clears suggestions', async () => {
    mocks.extension.mockResolvedValue({ suggestions: [suggestion, { ...suggestion, title: 'Colosseum', description: 'Ancient amphitheatre.', type: 'attraction' as const, sources: [] }] })
    const page = renderItinerary()
    fireEvent.click(page.getByRole('button', { name: 'Suggest things to do' }))
    expect(await page.findByText('Night Market')).toBeTruthy()
    expect(page.getByText('Local food and music.')).toBeTruthy(); expect(page.getAllByRole('link', { name: 'City events' })).toHaveLength(1)
    fireEvent.click(page.getByRole('button', { name: 'Dismiss Night Market' })); expect(page.queryByText('Night Market')).toBeNull()
    fireEvent.click(page.getByRole('button', { name: 'Clear suggestions' })); expect(page.queryByText('Colosseum')).toBeNull()
  })

  it('confirms replacement and clears open scheduling state', async () => {
    mocks.extension.mockResolvedValueOnce({ suggestions: [suggestion] }).mockResolvedValueOnce({ suggestions: [{ ...suggestion, title: 'New idea' }] })
    const page = renderItinerary(); fireEvent.click(page.getByRole('button', { name: 'Suggest things to do' })); await page.findByText('Night Market'); fireEvent.click(page.getByRole('button', { name: 'Schedule' })); expect(page.getByText('Schedule Night Market')).toBeTruthy()
    vi.mocked(confirm).mockReturnValue(false); fireEvent.click(page.getByRole('button', { name: 'Search again' })); expect(page.getByText('Night Market')).toBeTruthy(); expect(mocks.extension).toHaveBeenCalledTimes(1)
    vi.mocked(confirm).mockReturnValue(true); fireEvent.click(page.getByRole('button', { name: 'Search again' })); expect(await page.findByText('New idea')).toBeTruthy(); expect(page.queryByText('Schedule Night Market')).toBeNull()
  })

  it('schedules with optional time and keeps the form on failure', async () => {
    mocks.extension.mockResolvedValue({ suggestions: [suggestion] }); const invalidate = vi.fn(); const page = renderItinerary(invalidate); fireEvent.click(page.getByRole('button', { name: 'Suggest things to do' })); await page.findByText('Night Market'); fireEvent.click(page.getByRole('button', { name: 'Schedule' }))
    const day = page.getAllByLabelText('Date')[0]!; expect(day.getAttribute('min')).toBe(trip.start_date); expect(day.getAttribute('max')).toBe(trip.end_date); expect((page.getAllByLabelText('Time')[0] as HTMLInputElement).value).toBe('')
    mocks.create.mockRejectedValueOnce(new Error('save failed')); fireEvent.submit(page.getByRole('heading', { name: 'Schedule Night Market' }).closest('div')!.querySelector('form')!); expect((await page.findAllByText('save failed')).length).toBeGreaterThan(0); expect(page.getByText('Schedule Night Market')).toBeTruthy()
  })

  it('shows provider errors and retries successfully', async () => { mocks.extension.mockRejectedValueOnce(new Error('Suggestions are temporarily unavailable.')).mockResolvedValueOnce({ suggestions: [suggestion] }); const page = renderItinerary(); fireEvent.click(page.getByRole('button', { name: 'Suggest things to do' })); expect((await page.findByRole('alert')).textContent).toContain('temporarily unavailable'); fireEvent.click(page.getByRole('button', { name: 'Try again' })); expect(await page.findByText('Night Market')).toBeTruthy() })

  it('hides suggestions for viewers and disables duplicate editor searches', async () => {
    const queryClient = new QueryClient(); const page = render(<QueryClientProvider client={queryClient}><Itinerary trip={trip} userId="u1" items={[]} canEdit={false} invalidate={vi.fn()} /></QueryClientProvider>)
    expect(page.queryByText('Suggest things to do')).toBeNull()
    page.rerender(<QueryClientProvider client={queryClient}><Itinerary trip={trip} userId="u1" items={[]} canEdit={true} invalidate={vi.fn()} /></QueryClientProvider>)
    mocks.extension.mockReturnValue(new Promise(() => undefined)); fireEvent.click(page.getByText('Suggest things to do')); expect((await page.findByRole('status')).textContent).toContain('Searching for events and local attractions…'); expect((page.getByText('Suggest things to do').closest('button') as HTMLButtonElement).disabled).toBe(true)
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
