import { useEffect, useState, type ImgHTMLAttributes } from 'react'
import { client } from '../lib/trailbase'

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string }

export function AuthenticatedImage({ src, ...props }: Props) {
  const [objectUrl, setObjectUrl] = useState<string>()

  useEffect(() => {
    const controller = new AbortController()
    let url: string | undefined

    void client.fetch(src, { signal: controller.signal })
      .then((response) => response.blob())
      .then((blob) => {
        if (controller.signal.aborted) return
        url = URL.createObjectURL(blob)
        setObjectUrl(url)
      })
      .catch(() => undefined)

    return () => {
      controller.abort()
      if (url) URL.revokeObjectURL(url)
    }
  }, [src])

  return objectUrl ? <img {...props} src={objectUrl} /> : null
}
