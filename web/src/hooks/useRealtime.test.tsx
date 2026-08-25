// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useRealtime } from './useRealtime'

const mocks = vi.hoisted(() => ({ subscribeAll: vi.fn() }))
vi.mock('../lib/trailbase', () => ({
  client: {
    base: new URL('http://localhost:4000'),
    records: () => ({ subscribeAll: mocks.subscribeAll }),
  },
}))

describe('useRealtime', () => {
  it('invalidates queries from an SDK subscription and cancels it on cleanup', async () => {
    const cancel = vi.fn()
    let controller!: ReadableStreamDefaultController
    mocks.subscribeAll.mockResolvedValue(new ReadableStream({
      start: (streamController) => { controller = streamController },
      cancel,
    }))
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>

    const hook = renderHook(() => useRealtime('trips', ['trip', 'abc']), { wrapper })
    await waitFor(() => expect(mocks.subscribeAll).toHaveBeenCalledOnce())
    await act(() => controller.enqueue({ Update: { id: 1 } }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trip', 'abc'] })

    hook.unmount()
    await waitFor(() => expect(cancel).toHaveBeenCalledOnce())
  })
})
