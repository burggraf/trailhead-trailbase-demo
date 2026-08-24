import { initClient, type Tokens, type User } from 'trailbase'

export const trailbaseUrl = import.meta.env.VITE_TRAILBASE_URL ?? 'http://localhost:4000'

const listeners = new Set<(user?: User) => void>()
const authTokensKey = 'trailhead-auth-tokens'

function savedTokens(): Tokens | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const value = window.localStorage.getItem(authTokensKey)
    if (!value) return undefined
    const tokens = JSON.parse(value) as Tokens
    if (typeof tokens.auth_token === 'string') return tokens
    window.localStorage.removeItem(authTokensKey)
  } catch { /* discard invalid or unavailable storage */ }
  return undefined
}

export const client = initClient(trailbaseUrl, {
  tokens: savedTokens(),
  onAuthChange: (client, user) => {
    try {
      const tokens = client.tokens()
      if (tokens) window.localStorage.setItem(authTokensKey, JSON.stringify(tokens))
      else window.localStorage.removeItem(authTokensKey)
    } catch { /* authentication still works when storage is unavailable */ }
    listeners.forEach((listener) => listener(user))
  },
})

export function onAuthChange(listener: (user?: User) => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function authUi(path: string, redirect = window.location.origin) {
  const url = new URL(`/_/auth/${path}`, trailbaseUrl)
  url.searchParams.set('redirect_uri', redirect)
  return url.toString()
}

export async function extension<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await client.fetch(`/trailhead${path}`, init)
  return response.json() as Promise<T>
}

export function recordFileUrl(api: string, id: string, column: string) {
  return new URL(`/api/records/v1/${api}/${id}/file/${column}`, trailbaseUrl).toString()
}
