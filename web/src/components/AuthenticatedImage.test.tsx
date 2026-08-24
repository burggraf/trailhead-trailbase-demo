// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthenticatedImage } from './AuthenticatedImage'

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('../lib/trailbase', () => ({ client: { fetch: mocks.fetch } }))

describe('AuthenticatedImage', () => {
  it('loads protected bytes through the authenticated client and releases the object URL', async () => {
    mocks.fetch.mockResolvedValue(new Response(new Blob(['image']), { status: 200 }))
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cover')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)

    const view = render(<AuthenticatedImage src="/protected/cover" alt="Cover" />)
    await waitFor(() => expect(view.getByAltText('Cover').getAttribute('src')).toBe('blob:cover'))
    expect(mocks.fetch).toHaveBeenCalledWith('/protected/cover', expect.objectContaining({ signal: expect.any(AbortSignal) }))

    view.unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:cover')
    createObjectURL.mockRestore()
    revokeObjectURL.mockRestore()
  })
})
