import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { client } from '../lib/trailbase'

export function useRealtime(api: string, queryKey: readonly unknown[], enabled = true) {
  const queryClient = useQueryClient()
  const stableKey = JSON.stringify(queryKey)

  useEffect(() => {
    if (!enabled || !client.base) return
    let cancelled = false
    let reader: ReadableStreamDefaultReader | undefined

    void client.records(api).subscribeAll().then(async (stream) => {
      if (cancelled) return stream.cancel()
      reader = stream.getReader()
      while (!cancelled) {
        const { done } = await reader.read()
        if (done) break
        await queryClient.invalidateQueries({ queryKey: JSON.parse(stableKey) as unknown[] })
      }
    }).catch((error: unknown) => {
      if (!cancelled) console.error(`Realtime subscription failed for ${api}`, error)
    })

    return () => {
      cancelled = true
      void reader?.cancel()
    }
  }, [api, enabled, queryClient, stableKey])
}
