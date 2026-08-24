import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { client } from '../lib/trailbase'

export function useRealtime(api: string, queryKey: readonly unknown[], enabled = true) {
  const queryClient = useQueryClient()
  const stableKey = JSON.stringify(queryKey)

  useEffect(() => {
    if (!enabled) return
    let active = true
    let reader: ReadableStreamDefaultReader | undefined

    const subscribedKey = JSON.parse(stableKey) as unknown[]
    void client.records(api).subscribeAll().then((stream) => {
      reader = stream.getReader()
      const read = async (): Promise<void> => {
        const result = await reader?.read()
        if (!active || !result || result.done) return
        await queryClient.invalidateQueries({ queryKey: subscribedKey })
        return read()
      }
      return read()
    }).catch(() => undefined)

    return () => {
      active = false
      void reader?.cancel()
    }
  }, [api, enabled, queryClient, stableKey])
}
