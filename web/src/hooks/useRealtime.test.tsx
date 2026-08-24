// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useRealtime } from './useRealtime'

const mocks = vi.hoisted(() => ({ token: 'auth-token' }))
vi.mock('../lib/trailbase', () => ({
  client: {
    base: new URL('http://localhost:4000'),
    tokens: () => ({ auth_token: mocks.token }),
  },
}))

describe('useRealtime', () => {
  it('uses a native authenticated WebSocket and closes it on cleanup', async () => {
    const listeners = new Map<string, (event: MessageEvent) => void>()
    const send = vi.fn()
    const close = vi.fn()
    const WebSocketMock = vi.fn(function (this: object) {
      Object.assign(this, { addEventListener: (type: string, listener: (event: MessageEvent) => void) => listeners.set(type, listener), send, close })
    })
    vi.stubGlobal('WebSocket', WebSocketMock)
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>

    const hook = renderHook(() => useRealtime('trips', ['trip', 'abc']), { wrapper })
    expect(WebSocketMock).toHaveBeenCalledWith(new URL('ws://localhost:4000/api/records/v1/trips/subscribe/*?ws=true'))
    listeners.get('open')!(new MessageEvent('open'))
    expect(send).toHaveBeenCalledWith(JSON.stringify({ Init: { auth_token: mocks.token } }))
    await act(() => listeners.get('message')!(new MessageEvent('message')))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trip', 'abc'] })

    hook.unmount()
    expect(close).toHaveBeenCalled()
  })
})
