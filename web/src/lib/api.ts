import { client, trailbaseUrl } from './trailbase'

export async function uploadRecordFile(api: string, id: string, column: string, file: File) {
  await client.refreshAuthToken()
  const body = new FormData()
  body.append(column, file)
  const response = await fetch(new URL(`/api/records/v1/${api}/${id}`, trailbaseUrl), {
    method: 'PATCH',
    headers: client.headers(),
    body,
  })
  if (!response.ok) throw new Error(await response.text() || `Upload failed (${response.status})`)
}

export async function uploadAvatar(file: File) {
  await client.refreshAuthToken()
  const body = new FormData()
  body.append('file', file)
  const response = await fetch(new URL('/api/auth/v1/avatar', trailbaseUrl), {
    method: 'POST',
    headers: client.headers(),
    body,
  })
  if (!response.ok) throw new Error(await response.text() || `Avatar upload failed (${response.status})`)
}

export function message(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong'
}
