import { initClient, type User } from 'trailbase'

export const trailbaseUrl = import.meta.env.VITE_TRAILBASE_URL ?? 'http://localhost:4000'

const listeners = new Set<(user?: User) => void>()

export const client = initClient(trailbaseUrl, {
  onAuthChange: (_client, user) => listeners.forEach((listener) => listener(user)),
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
