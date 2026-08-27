import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tokens } from 'trailbase'

const mocks = vi.hoisted(() => {
  const client = { tokens: vi.fn(), fetch: vi.fn() }
  return { client, initClient: vi.fn((_url: unknown, _options: unknown) => client) }
})

vi.mock('trailbase', () => ({ initClient: mocks.initClient }))

const values = new Map<string, string>()
const storage = {
  clear: () => values.clear(),
  getItem: (key: string) => values.get(key) ?? null,
  removeItem: (key: string) => values.delete(key),
  setItem: (key: string, value: string) => values.set(key, value),
}

describe('TrailBase authentication persistence', () => {
  beforeEach(() => {
    storage.clear()
    vi.stubGlobal('window', { localStorage: storage, sessionStorage: storage })
    mocks.client.tokens.mockReset()
    mocks.client.fetch.mockReset()
    mocks.initClient.mockClear()
    vi.resetModules()
  })

  it('propagates extension JSON errors', async () => {
    mocks.client.fetch.mockResolvedValue(new Response(JSON.stringify({ message: 'Suggestions are temporarily unavailable.' }), { status: 503 }))
    const { extension } = await import('./trailbase')
    await expect(extension('/x')).rejects.toThrow('Suggestions are temporarily unavailable.')
  })

  it('uses a status fallback for non-JSON extension errors', async () => {
    mocks.client.fetch.mockResolvedValue(new Response('<html>unavailable</html>', { status: 503, headers: { 'content-type': 'text/html' } }))
    const { extension } = await import('./trailbase')
    await expect(extension('/x')).rejects.toThrow('Request failed (503)')
  })

  it('returns parsed extension data on success', async () => {
    mocks.client.fetch.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const { extension } = await import('./trailbase')
    await expect(extension('/x')).resolves.toEqual({ ok: true })
  })

  it('stores only safe internal authentication return paths', async () => {
    const { rememberAuthReturn, takeAuthReturn } = await import('./trailbase')
    rememberAuthReturn('/invitations')
    expect(takeAuthReturn()).toBe('/invitations')
    expect(takeAuthReturn()).toBe('/')
    rememberAuthReturn('//evil.example')
    expect(takeAuthReturn()).toBe('/')
  })

  it('restores, updates, and clears auth tokens', async () => {
    const saved = { auth_token: 'saved', refresh_token: 'refresh', csrf_token: null }
    storage.setItem('trailhead-auth-tokens', JSON.stringify(saved))

    await import('./trailbase')
    const options = mocks.initClient.mock.calls[0]![1] as {
      tokens?: Tokens
      onAuthChange: (client: typeof mocks.client, user?: unknown) => void
    }
    expect(options.tokens).toEqual(saved)

    const updated = { ...saved, auth_token: 'updated' }
    mocks.client.tokens.mockReturnValue(updated)
    options.onAuthChange(mocks.client, undefined)
    expect(JSON.parse(storage.getItem('trailhead-auth-tokens')!)).toEqual(updated)

    mocks.client.tokens.mockReturnValue(undefined)
    options.onAuthChange(mocks.client, undefined)
    expect(storage.getItem('trailhead-auth-tokens')).toBeNull()
  })
})
