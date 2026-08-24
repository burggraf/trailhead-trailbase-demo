import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { client } from '../lib/trailbase'

export function useRealtime(api: string, queryKey: readonly unknown[], enabled = true) {
  const queryClient = useQueryClient()
  const stableKey = JSON.stringify(queryKey)

  useEffect(() => {
    if (!enabled || !client.base) return
    const url = new URL(`/api/records/v1/${api}/subscribe/*?ws=true`, client.base)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const socket = new WebSocket(url)

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ Init: { auth_token: client.tokens()?.auth_token ?? null } }))
    })
    socket.addEventListener('message', () => {
      void queryClient.invalidateQueries({ queryKey: JSON.parse(stableKey) as unknown[] })
    })

    return () => socket.close()
  }, [api, enabled, queryClient, stableKey])
}
