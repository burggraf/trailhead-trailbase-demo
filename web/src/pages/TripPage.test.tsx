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
const suggestion = { type: 'event' as const, title: 'Night Market', description: 'Local food and music.', place: 'Main Square', date: '2026-10-02', time: '', sources: [{ title: 'City events', url: 'https://city.example/event' }, { title: 'City events', url: 'https://city.example/event' }, { title: 'Unsafe source', url: 'http://city.example/unsafe' }] }
const renderItinerary = (invalidate = vi.fn()) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><Itinerary trip={trip} userId="u1" items={[]} canEdit invalidate={invalidate} /></QueryClientProvider>)
afterEach(cleanup)
beforeEach(() => { mocks.extension.mockReset(); mocks.create.mockReset(); mocks.create.mockResolvedValue('id'); mocks.update.mockReset(); mocks.remove.mockReset(); vi.stubGlobal('confirm', vi.fn(() => true)) })

describe('Itinerary suggestions', () => {
  it('renders, deduplicates, dismisses, and clears suggestions', async () => {
    mocks.extension.mockResolvedValue({ suggestions: [suggestion, { ...suggestion, title: 'Colosseum', description: 'Ancient amphitheatre.', type: 'attraction' as const, sources: [] }] })
    const page = renderItinerary()
    fireEvent.click(page.getByRole('button', { name: 'Suggest things to do' }))
    expect(await page.findByText('Night Market')).toBeTruthy()
    expect(page.getByText('event')).toBeTruthy(); expect(page.getByText('Local food and music.')).toBeTruthy(); expect(page.getAllByText(/^Main Square · 2026-10-02 ·\s*$/)).toHaveLength(2)
    const sources = page.getAllByRole('link', { name: 'City events' }); expect(sources).toHaveLength(1); expect(sources[0]!.getAttribute('href')).toBe('https://city.example/event'); expect(sources[0]!.getAttribute('target')).toBe('_blank'); expect(sources[0]!.getAttribute('rel')).toContain('noreferrer'); expect(page.queryByRole('link', { name: 'Unsafe source' })).toBeNull()
    fireEvent.click(page.getByRole('button', { name: 'Dismiss Night Market' })); expect(page.queryByText('Night Market')).toBeNull()
    fireEvent.click(page.getByRole('button', { name: 'Clear suggestions' })); expect(page.queryByText('Colosseum')).toBeNull()
  })

  it('confirms replacement and clears open scheduling state', async () => {
    mocks.extension.mockResolvedValueOnce({ suggestions: [suggestion] }).mockResolvedValueOnce({ suggestions: [{ ...suggestion, title: 'New idea' }] })
    const page = renderItinerary(); fireEvent.click(page.getByRole('button', { name: 'Suggest things to do' })); await page.findByText('Night Market'); fireEvent.click(page.getByRole('button', { name: 'Schedule' })); expect(page.getByText('Schedule Night Market')).toBeTruthy()
    vi.mocked(confirm).mockReturnValue(false); fireEvent.click(page.getByRole('button', { name: 'Search again' })); expect(page.getByText('Night Market')).toBeTruthy(); expect(mocks.extension).toHaveBeenCalledTimes(1)
    vi.mocked(confirm).mockReturnValue(true); fireEvent.click(page.getByRole('button', { name: 'Search again' })); expect(await page.findByText('New idea')).toBeTruthy(); expect(page.queryByText('Schedule Night Market')).toBeNull()
  })

  it('opens the schedule editor inside the selected suggestion card', async () => {
    mocks.extension.mockResolvedValue({ suggestions: [suggestion] })
    const page = renderItinerary()
    fireEvent.click(page.getByRole('button', { name: 'Suggest things to do' }))
    await page.findByText('Night Market')
    const scheduleButton = page.getByRole('button', { name: 'Schedule' })
    fireEvent.click(scheduleButton)
    const heading = page.getByRole('heading', { name: 'Schedule Night Market' })
    expect(scheduleButton.parentElement?.contains(heading)).toBe(true)
    expect(page.getByRole('button', { name: 'Scheduling…' }).getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(page.getAllByLabelText('Title')[0])
  })

  it('schedules with optional time and keeps the form on failure', async () => {
    mocks.extension.mockResolvedValue({ suggestions: [suggestion] }); const invalidate = vi.fn(); const page = renderItinerary(invalidate); fireEvent.click(page.getByRole('button', { name: 'Suggest things to do' })); await page.findByText('Night Market'); fireEvent.click(page.getByRole('button', { name: 'Schedule' }))
    const day = page.getAllByLabelText('Date')[0]!; expect(day.getAttribute('min')).toBe(trip.start_date); expect(day.getAttribute('max')).toBe(trip.end_date); expect((page.getAllByLabelText('Time')[0] as HTMLInputElement).value).toBe('')
    mocks.create.mockRejectedValueOnce(new Error('save failed')); fireEvent.submit(page.getByRole('heading', { name: 'Schedule Night Market' }).closest('div')!.querySelector('form')!); expect((await page.findAllByText('save failed')).length).toBeGreaterThan(0); expect(page.getByText('Schedule Night Market')).toBeTruthy()
  })

  it('shows provider errors and retries successfully', async () => { mocks.extension.mockRejectedValueOnce(new Error('Suggestions are temporarily unavailable.')).mockResolvedValueOnce({ suggestions: [suggestion] }); const page = renderItinerary(); fireEvent.click(page.getByRole('button', { name: 'Suggest things to do' })); expect((await page.findByRole('alert')).textContent).toContain('temporarily unavailable'); fireEvent.click(page.getByRole('button', { name: 'Try again' })); expect(await page.findByText('Night Market')).toBeTruthy() })

  it('clears an open schedule form with Clear suggestions', async () => {
    mocks.extension.mockResolvedValue({ suggestions: [suggestion] }); const page = renderItinerary(); fireEvent.click(page.getByRole('button', { name: 'Suggest things to do' })); await page.findByText('Night Market'); fireEvent.click(page.getByRole('button', { name: 'Schedule' })); fireEvent.click(page.getByRole('button', { name: 'Clear suggestions' })); expect(page.queryByText('Night Market')).toBeNull(); expect(page.queryByText('Schedule Night Market')).toBeNull()
  })

  it('rolls back and safely retries when activity logging fails', async () => {
    mocks.extension.mockResolvedValue({ suggestions: [suggestion] }); mocks.create.mockImplementation((name: string) => name === 'activity_events' ? Promise.reject(new Error('activity failed')) : Promise.resolve('item-id')); mocks.remove.mockResolvedValue(undefined); const page = renderItinerary(); fireEvent.click(page.getByRole('button', { name: 'Suggest things to do' })); await page.findByText('Night Market'); fireEvent.click(page.getByRole('button', { name: 'Schedule' })); const form = page.getByRole('heading', { name: 'Schedule Night Market' }).closest('div')!.querySelector('form')!; fireEvent.submit(form); expect((await page.findAllByText('activity failed')).length).toBeGreaterThan(0); expect(mocks.remove).toHaveBeenCalledWith('itinerary_items', 'item-id'); expect(page.getByText('Schedule Night Market')).toBeTruthy(); expect(page.getByText('Night Market')).toBeTruthy(); mocks.create.mockResolvedValue('retry-id'); fireEvent.submit(form); await waitFor(() => expect(page.queryByText('Schedule Night Market')).toBeNull()); expect(mocks.create.mock.calls.filter(([name]) => name === 'itinerary_items')).toHaveLength(2); expect(mocks.create.mock.calls.filter(([name]) => name === 'activity_events')).toHaveLength(2); expect(mocks.remove).toHaveBeenCalledTimes(1)
  })

  it('uses edited fields and writes itinerary before activity', async () => {
    mocks.extension.mockResolvedValue({ suggestions: [suggestion] }); const invalidate = vi.fn(); const page = renderItinerary(invalidate); fireEvent.click(page.getByRole('button', { name: 'Suggest things to do' })); await page.findByText('Night Market'); fireEvent.click(page.getByRole('button', { name: 'Schedule' })); fireEvent.change(page.getAllByLabelText('Title')[0]!, { target: { value: 'Edited market' } }); fireEvent.change(page.getAllByLabelText('Place')[0]!, { target: { value: 'Edited square' } }); fireEvent.change(page.getAllByLabelText('Date')[0]!, { target: { value: '2026-10-03' } }); fireEvent.submit(page.getByRole('heading', { name: 'Schedule Night Market' }).closest('div')!.querySelector('form')!); await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2)); expect(mocks.create.mock.calls[0]).toEqual(['itinerary_items', expect.objectContaining({ title: 'Edited market', place: 'Edited square', day: '2026-10-03', start_time: '' })]); expect(mocks.create.mock.calls[1]![0]).toBe('activity_events'); expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[1]!); expect(invalidate).toHaveBeenCalled(); expect(page.queryByText('Schedule Night Market')).toBeNull(); expect(page.queryByRole('button', { name: 'Dismiss Night Market' })).toBeNull()
  })

  it('guards duplicate schedule submissions while pending', async () => {
    let finishItinerary!: (id: string) => void
    mocks.extension.mockResolvedValue({ suggestions: [suggestion] }); mocks.create.mockImplementation((name: string) => name === 'itinerary_items' ? new Promise((resolve) => { finishItinerary = resolve }) : Promise.resolve('event-id')); const page = renderItinerary(); fireEvent.click(page.getByRole('button', { name: 'Suggest things to do' })); await page.findByText('Night Market'); fireEvent.click(page.getByRole('button', { name: 'Schedule' })); fireEvent.change(page.getAllByLabelText('Date')[0]!, { target: { value: '2026-10-02' } }); fireEvent.change(page.getAllByLabelText('Time')[0]!, { target: { value: '10:00' } }); fireEvent.click(page.getAllByRole('button', { name: 'Add to itinerary' })[0]!); fireEvent.click(page.getAllByRole('button', { name: 'Add to itinerary' })[0]!); await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1)); expect((page.getAllByRole('button', { name: 'Add to itinerary' })[0] as HTMLButtonElement).disabled).toBe(true); finishItinerary('item-id'); await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2)); expect(mocks.create.mock.calls.filter(([name]) => name === 'itinerary_items')).toHaveLength(1); expect(mocks.create.mock.calls.filter(([name]) => name === 'activity_events')).toHaveLength(1)
  })

  it('guards duplicate manual submissions while pending', () => {
    mocks.create.mockReturnValue(new Promise(() => undefined)); const page = renderItinerary(); const day = page.getByLabelText('Date'); expect(day.getAttribute('min')).toBe(trip.start_date); expect(day.getAttribute('max')).toBe(trip.end_date); fireEvent.change(day, { target: { value: '2026-10-02' } }); fireEvent.change(page.getByLabelText('What’s happening?'), { target: { value: 'Manual stop' } }); fireEvent.submit(page.container.querySelector('form')!); fireEvent.submit(page.container.querySelector('form')!); return waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
  })

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
