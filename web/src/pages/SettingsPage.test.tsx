// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'

const mocks = vi.hoisted(() => ({
  user: { id: 'admin-1', email: 'admin@example.com', username: 'admin', admin: true },
  logout: vi.fn(),
  extension: vi.fn(),
  list: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}))

vi.mock('../auth', () => ({ useAuth: () => ({ user: mocks.user, logout: mocks.logout }) }))
vi.mock('../lib/trailbase', () => ({
  authUi: (path: string) => `http://localhost/${path}`,
  client: {
    records: () => ({ list: mocks.list, update: mocks.update, create: mocks.create }),
    promoteAnonymous: vi.fn(),
    deleteUser: vi.fn(),
  },
  extension: mocks.extension,
}))

const metadata = { configured: true, model: 'gemini-3.1-flash-lite', key_count: 2, search_configured: true }
const renderSettings = () => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><SettingsPage /></QueryClientProvider></MemoryRouter>)

afterEach(cleanup)
beforeEach(() => {
  mocks.user = { id: 'admin-1', email: 'admin@example.com', username: 'admin', admin: true }
  mocks.logout.mockReset()
  mocks.extension.mockReset().mockResolvedValue(metadata)
  mocks.list.mockReset().mockResolvedValue({ records: [] })
  mocks.update.mockReset()
  mocks.create.mockReset()
  vi.stubGlobal('confirm', vi.fn(() => true))
})

describe('AI provider settings', () => {
  it('does not render or query provider settings for non-admin users', async () => {
    mocks.user = { ...mocks.user, admin: false }
    const page = renderSettings()
    expect(page.queryByRole('heading', { name: 'AI provider settings' })).toBeNull()
    await waitFor(() => expect(mocks.list).toHaveBeenCalled())
    expect(mocks.extension).not.toHaveBeenCalled()
  })

  it('shows redacted configuration metadata to admins', async () => {
    const page = renderSettings()
    expect(await page.findByRole('heading', { name: 'AI provider settings' })).toBeTruthy()
    expect(await page.findByText('Configured with 2 Gemini keys')).toBeTruthy()
    expect(page.getByText('Tavily configured')).toBeTruthy()
    expect(mocks.extension).toHaveBeenCalledWith('/admin/ai-settings')
    expect((page.getByLabelText('Primary Gemini API key') as HTMLInputElement).value).toBe('')
    expect((page.getByLabelText('Tavily API key') as HTMLInputElement).value).toBe('')
  })

  it('loads the configured model before rendering the credential form', async () => {
    mocks.extension.mockResolvedValue({ ...metadata, model: 'gemini-custom-model' })
    const page = renderSettings()
    expect(await page.findByRole('heading', { name: 'AI provider settings' })).toBeTruthy()
    expect((await page.findByLabelText('Gemini model') as HTMLInputElement).value).toBe('gemini-custom-model')
  })

  it('shows and can remove a partial configuration', async () => {
    mocks.extension.mockResolvedValue({ configured: false, model: 'gemini-3.1-flash-lite', key_count: 1, search_configured: false })
    const page = renderSettings()
    expect(await page.findByText('Configured with 1 Gemini key')).toBeTruthy()
    expect(page.getByRole('button', { name: 'Remove AI configuration' })).toBeTruthy()
  })

  it('saves replacement credentials and clears the secret fields', async () => {
    mocks.extension.mockResolvedValueOnce(metadata).mockResolvedValueOnce({ ...metadata, key_count: 1 })
    const page = renderSettings()
    await page.findByLabelText('Primary Gemini API key')
    fireEvent.change(page.getByLabelText('Primary Gemini API key'), { target: { value: 'primary-key' } })
    fireEvent.change(page.getByLabelText('Backup Gemini API key (optional)'), { target: { value: 'backup-key' } })
    fireEvent.change(page.getByLabelText('Tavily API key'), { target: { value: 'tavily-key' } })
    fireEvent.submit(page.getByRole('button', { name: 'Save AI settings' }).closest('form')!)
    await waitFor(() => expect(mocks.extension).toHaveBeenLastCalledWith('/admin/ai-settings', {
      method: 'POST',
      body: JSON.stringify({ api_keys: 'primary-key\nbackup-key', tavily_api_key: 'tavily-key', model: 'gemini-3.1-flash-lite' }),
    }))
    expect(await page.findByText('AI provider settings saved.')).toBeTruthy()
    expect((page.getByLabelText('Primary Gemini API key') as HTMLInputElement).value).toBe('')
    expect((page.getByLabelText('Backup Gemini API key (optional)') as HTMLInputElement).value).toBe('')
    expect((page.getByLabelText('Tavily API key') as HTMLInputElement).value).toBe('')
  })

  it('removes configuration only after confirmation', async () => {
    mocks.extension.mockResolvedValueOnce(metadata).mockResolvedValueOnce({ configured: false, model: 'gemini-3.1-flash-lite', key_count: 0, search_configured: false })
    const page = renderSettings()
    await page.findByText('Configured with 2 Gemini keys')
    vi.mocked(confirm).mockReturnValue(false)
    fireEvent.click(page.getByRole('button', { name: 'Remove AI configuration' }))
    expect(mocks.extension).toHaveBeenCalledTimes(1)
    vi.mocked(confirm).mockReturnValue(true)
    fireEvent.click(page.getByRole('button', { name: 'Remove AI configuration' }))
    await waitFor(() => expect(mocks.extension).toHaveBeenLastCalledWith('/admin/ai-settings', {
      method: 'POST',
      body: JSON.stringify({ api_keys: '', tavily_api_key: '', model: 'gemini-3.1-flash-lite' }),
    }))
    expect(await page.findByText('AI provider configuration removed.')).toBeTruthy()
  })
})
