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
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    if ('status' in error && error.status === 401) return 'Invalid credentials or email not verified.'
    if ('message' in error && typeof error.message === 'string') return error.message
    if ('msg' in error && typeof error.msg === 'string') return error.msg
  }
  return 'Something went wrong'
}
