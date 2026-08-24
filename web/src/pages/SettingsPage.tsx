import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Mail, ShieldCheck, Thermometer, Trash2, UserCog } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { Button, Card, Field, Input } from '../components/ui'
import { authUi, client } from '../lib/trailbase'
import { message } from '../lib/api'
import type { Profile, TemperatureUnit } from '../types'

export function SettingsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const anonymous = !user?.email
  const profile = useQuery({ queryKey: ['profile', user?.id], queryFn: async () => (await client.records<Profile>('profiles').list({ filters: [{ column: 'user', value: user!.id }], pagination: { limit: 1 } })).records[0] ?? null, enabled: !!user })
  const temperature = useMutation({
    mutationFn: async (unit: TemperatureUnit) => {
      if (profile.data) return client.records<Profile>('profiles').update(user!.id, { temperature_unit: unit })
      const candidate = user?.username ?? user?.email?.split('@')[0] ?? 'Traveler'
      await client.records('profiles').create({ user: user!.id, display_name: candidate.length >= 2 ? candidate : 'Traveler', bio: '', home_location: '', temperature_unit: unit })
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

  return <div className="mx-auto max-w-3xl"><p className="eyebrow">TrailBase Auth</p><h1 className="mt-2 text-4xl font-black">Account settings</h1><p className="mt-3 text-muted">TrailBase supplies these identity flows and revocable refresh-token sessions.</p>
    {anonymous && <Card className="mt-8 border-amber-300 p-6"><div className="flex items-center gap-2"><ShieldCheck className="text-amber-600" /><h2 className="section-title">Keep this anonymous account</h2></div><p className="mt-2 text-sm text-muted">Promote it before logging out; anonymous accounts cannot sign back in.</p><form className="mt-5 grid gap-4" onSubmit={promote}><Field label="Email"><Input type="email" name="email" required /></Field><Field label="New password"><Input type="password" name="password" minLength={8} required /></Field><Button disabled={busy}>Promote account</Button></form></Card>}
    <Card className="mt-8 p-6"><div className="flex items-center gap-2"><Thermometer className="text-amber-600" /><h2 className="section-title">Temperature</h2></div><p className="mt-2 text-sm text-muted">Choose how weather briefings are displayed for your account.</p><div className="mt-5 grid grid-cols-2 gap-2" aria-label="Temperature unit">{(['C', 'F'] as const).map((unit) => <button key={unit} type="button" aria-pressed={(profile.data?.temperature_unit ?? 'C') === unit} disabled={profile.isPending || temperature.isPending} onClick={() => temperature.mutate(unit)} className={`rounded-xl border px-4 py-3 text-sm font-bold transition ${(profile.data?.temperature_unit ?? 'C') === unit ? 'border-forest bg-forest text-white' : 'border-border bg-card hover:bg-stone'}`}>°{unit} · {unit === 'C' ? 'Celsius' : 'Fahrenheit'}</button>)}</div>{temperature.isPending && <p role="status" className="mt-3 text-sm text-muted">Saving preference…</p>}{temperature.error && <p role="alert" className="mt-3 text-sm text-red-700">{message(temperature.error)}</p>}</Card>
    <div className="mt-8 grid gap-4 sm:grid-cols-2"><SettingLink icon={<KeyRound />} title="Change password" description="TrailBase’s first-party secure flow" href={authUi('change_password')} /><SettingLink icon={<Mail />} title="Change email" description="Verification is handled for you" href={authUi('change_email')} /><SettingLink icon={<UserCog />} title="Change username" description="Available when username policy allows" href={authUi('change_username')} /><SettingLink icon={<ShieldCheck />} title="MFA and OAuth" description="Open the complete auth profile" href={authUi('login')} /></div>
    <Card className="mt-8 border-red-200 p-6 dark:border-red-950"><h2 className="font-bold text-red-700 dark:text-red-300">Danger zone</h2><p className="mt-2 text-sm text-muted">Logout revokes the refresh token; the short-lived JWT remains valid until expiry. Deletion cascades owned application data.</p><div className="mt-5 flex flex-wrap gap-3"><Button variant="secondary" onClick={async () => { await logout(); navigate('/login') }}>Sign out</Button><Button variant="danger" disabled={busy} onClick={remove}><Trash2 size={16} />Delete account</Button></div>{error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}</Card>
  </div>
}

function SettingLink({ icon, title, description, href }: { icon: React.ReactNode; title: string; description: string; href: string }) {
  return <a href={href} className="rounded-2xl border border-border bg-card p-5 transition hover:-translate-y-0.5 hover:shadow-lg"><span className="grid size-10 place-items-center rounded-xl bg-stone text-forest dark:text-emerald-300">{icon}</span><h2 className="mt-4 font-bold">{title}</h2><p className="mt-1 text-sm text-muted">{description}</p></a>
}
