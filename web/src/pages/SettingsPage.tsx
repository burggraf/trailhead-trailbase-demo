import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Mail, Ruler, ShieldCheck, Sparkles, Trash2, UserCog } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { Button, Card, Field, Input } from '../components/ui'
import { authUi, client, extension } from '../lib/trailbase'
import { message } from '../lib/api'
import type { Profile, UnitSystem } from '../types'

type AiSettingsMetadata = { configured: boolean; model: string; key_count: number; search_configured: boolean }
const aiSettingsKey = ['admin', 'ai-settings'] as const

export function SettingsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiNotice, setAiNotice] = useState('')
  const anonymous = !user?.email
  const profile = useQuery({ queryKey: ['profile', user?.id], queryFn: async () => (await client.records<Profile>('profiles').list({ filters: [{ column: 'user', value: user!.id }], pagination: { limit: 1 } })).records[0] ?? null, enabled: !!user })
  const aiSettings = useQuery({ queryKey: aiSettingsKey, queryFn: () => extension<AiSettingsMetadata>('/admin/ai-settings'), enabled: user?.admin === true })
  const measurement = useMutation({
    mutationFn: async (system: UnitSystem) => {
      if (profile.data) return client.records<Profile>('profiles').update(user!.id, { unit_system: system })
      const candidate = user?.username ?? user?.email?.split('@')[0] ?? 'Traveler'
      await client.records('profiles').create({ user: user!.id, display_name: candidate.length >= 2 ? candidate : 'Traveler', bio: '', home_location: '', unit_system: system })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', user?.id] }),
  })

  const promote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true); setError('')
    try { await client.promoteAnonymous({ email: String(data.get('email')), password: String(data.get('password')) }) } catch (err) { setError(message(err)) } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!confirm('Permanently delete your TrailBase user and all owned data?')) return
    setBusy(true)
    try { await client.deleteUser(); navigate('/login') } catch (err) { setError(message(err)); setBusy(false) }
  }
  const saveAiSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const keys = [String(data.get('gemini_primary')).trim(), String(data.get('gemini_backup')).trim()].filter(Boolean).join('\n')
    setAiBusy(true); setAiError(''); setAiNotice('')
    try {
      const result = await extension<AiSettingsMetadata>('/admin/ai-settings', { method: 'POST', body: JSON.stringify({ api_keys: keys, tavily_api_key: String(data.get('tavily_api_key')).trim(), model: String(data.get('model')).trim() }) })
      queryClient.setQueryData(aiSettingsKey, result)
      form.reset()
      setAiNotice('AI provider settings saved.')
    } catch (err) { setAiError(message(err)) } finally { setAiBusy(false) }
  }
  const removeAiSettings = async () => {
    if (!confirm('Remove the Gemini and Tavily configuration? Suggestions will stop working.')) return
    setAiBusy(true); setAiError(''); setAiNotice('')
    try {
      const result = await extension<AiSettingsMetadata>('/admin/ai-settings', { method: 'POST', body: JSON.stringify({ api_keys: '', tavily_api_key: '', model: aiSettings.data?.model ?? 'gemini-3.1-flash-lite' }) })
      queryClient.setQueryData(aiSettingsKey, result)
      setAiNotice('AI provider configuration removed.')
    } catch (err) { setAiError(message(err)) } finally { setAiBusy(false) }
  }

  return <div className="mx-auto max-w-3xl"><p className="eyebrow">TrailBase Auth</p><h1 className="mt-2 text-4xl font-black">Account settings</h1><p className="mt-3 text-muted">TrailBase supplies these identity flows and revocable refresh-token sessions.</p>
    {anonymous && <Card className="mt-8 border-amber-300 p-6"><div className="flex items-center gap-2"><ShieldCheck className="text-amber-600" /><h2 className="section-title">Keep this anonymous account</h2></div><p className="mt-2 text-sm text-muted">Promote it before logging out; anonymous accounts cannot sign back in.</p><form className="mt-5 grid gap-4" onSubmit={promote}><Field label="Email"><Input type="email" name="email" required /></Field><Field label="New password"><Input type="password" name="password" minLength={8} required /></Field><Button disabled={busy}>Promote account</Button></form></Card>}
    <Card className="mt-8 p-6"><div className="flex items-center gap-2"><Ruler className="text-amber-600" /><h2 className="section-title">Measurement system</h2></div><p className="mt-2 text-sm text-muted">Applied across temperatures, wind, precipitation, and distances.</p><div className="mt-5 grid grid-cols-2 gap-2" aria-label="Measurement system">{(['metric', 'imperial'] as const).map((system) => <button key={system} type="button" aria-pressed={(profile.data?.unit_system ?? 'metric') === system} disabled={profile.isPending || measurement.isPending} onClick={() => measurement.mutate(system)} className={`rounded-xl border px-4 py-3 text-sm font-bold capitalize transition ${(profile.data?.unit_system ?? 'metric') === system ? 'border-forest bg-forest text-white' : 'border-border bg-card hover:bg-stone'}`}>{system}<span className={`mt-1 block text-xs font-normal normal-case ${(profile.data?.unit_system ?? 'metric') === system ? 'text-white/70' : 'text-muted'}`}>{system === 'metric' ? '°C · km/h · mm · km' : '°F · mph · inches · miles'}</span></button>)}</div>{measurement.isPending && <p role="status" className="mt-3 text-sm text-muted">Saving preference…</p>}{measurement.error && <p role="alert" className="mt-3 text-sm text-red-700">{message(measurement.error)}</p>}</Card>
    {user?.admin && <Card className="mt-8 p-6"><div className="flex items-center gap-2"><Sparkles className="text-amber-600" /><h2 className="section-title">AI provider settings</h2></div><p className="mt-2 text-sm text-muted">Configure the server-side Gemini and Tavily credentials used by itinerary suggestions.</p>{aiSettings.isPending ? <p role="status" className="mt-4 text-sm text-muted">Loading provider status…</p> : aiSettings.error ? <p role="alert" className="mt-4 text-sm text-red-700">{message(aiSettings.error)}</p> : <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold"><span className="rounded-full bg-stone px-3 py-1.5">{aiSettings.data?.key_count ? `Configured with ${aiSettings.data.key_count} Gemini ${aiSettings.data.key_count === 1 ? 'key' : 'keys'}` : 'Gemini not configured'}</span><span className="rounded-full bg-stone px-3 py-1.5">{aiSettings.data?.search_configured ? 'Tavily configured' : 'Tavily not configured'}</span></div>}{aiSettings.isSuccess && <><p className="mt-4 text-sm text-muted">Keys are write-only. Saving replaces the complete configuration, so re-enter every key you want to keep.</p><form className="mt-5 grid gap-4" autoComplete="off" onSubmit={saveAiSettings}><Field label="Primary Gemini API key"><Input type="password" name="gemini_primary" autoComplete="off" spellCheck={false} required /></Field><Field label="Backup Gemini API key (optional)"><Input type="password" name="gemini_backup" autoComplete="off" spellCheck={false} /></Field><Field label="Tavily API key"><Input type="password" name="tavily_api_key" autoComplete="off" spellCheck={false} required /></Field><Field label="Gemini model"><Input name="model" defaultValue={aiSettings.data?.model ?? 'gemini-3.1-flash-lite'} spellCheck={false} required /></Field><Button disabled={aiBusy}>{aiBusy ? 'Saving…' : 'Save AI settings'}</Button></form>{!!(aiSettings.data?.key_count || aiSettings.data?.search_configured) && <Button className="mt-3" variant="ghost" disabled={aiBusy} onClick={removeAiSettings}>Remove AI configuration</Button>}</>}{aiNotice && <p role="status" className="mt-3 text-sm text-emerald-700">{aiNotice}</p>}{aiError && <p role="alert" className="mt-3 text-sm text-red-700">{aiError}</p>}</Card>}
    <div className="mt-8 grid gap-4 sm:grid-cols-2"><SettingLink icon={<KeyRound />} title="Change password" description="TrailBase’s first-party secure flow" href={authUi('change_password')} /><SettingLink icon={<Mail />} title="Change email" description="Verification is handled for you" href={authUi('change_email')} /><SettingLink icon={<UserCog />} title="Change username" description="Available when username policy allows" href={authUi('change_username')} /><SettingLink icon={<ShieldCheck />} title="MFA and OAuth" description="Open the complete auth profile" href={authUi('login')} /></div>
    <Card className="mt-8 border-red-200 p-6 dark:border-red-950"><h2 className="font-bold text-red-700 dark:text-red-300">Danger zone</h2><p className="mt-2 text-sm text-muted">Logout revokes the refresh token; the short-lived JWT remains valid until expiry. Deletion cascades owned application data.</p><div className="mt-5 flex flex-wrap gap-3"><Button variant="secondary" onClick={async () => { await logout(); navigate('/login') }}>Sign out</Button><Button variant="danger" disabled={busy} onClick={remove}><Trash2 size={16} />Delete account</Button></div>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}</Card>
  </div>
}

function SettingLink({ icon, title, description, href }: { icon: React.ReactNode; title: string; description: string; href: string }) {
  return <a href={href} className="rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-lg"><span className="grid size-10 place-items-center rounded-xl bg-stone text-forest dark:text-emerald-300">{icon}</span><h2 className="mt-4 font-bold">{title}</h2><p className="mt-1 text-sm text-muted">{description}</p></a>
}
