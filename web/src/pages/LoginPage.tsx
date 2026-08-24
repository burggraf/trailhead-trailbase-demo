import { useState, type FormEvent } from 'react'
import { Compass, KeyRound } from 'lucide-react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { Button, Card, Field, Input } from '../components/ui'
import { authUi } from '../lib/trailbase'
import { message } from '../lib/api'

export function LoginPage() {
  const { user, login, anonymous } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState('')
  const alert = searchParams.get('alert')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to="/" replace />

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true); setError('')
    try {
      await login(String(data.get('email')), String(data.get('password')))
      navigate('/')
    } catch (err) { setError(message(err)) } finally { setBusy(false) }
  }

  const tryAnonymous = async () => {
    setBusy(true); setError('')
    try { await anonymous(); navigate('/') } catch (err) { setError(message(err)) } finally { setBusy(false) }
  }

  return <main className="grid min-h-screen lg:grid-cols-[1.05fr_.95fr]">
    <section className="relative hidden overflow-hidden bg-forest p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="topo absolute inset-0 opacity-20" />
      <div className="relative flex items-center gap-3 text-lg font-bold"><span className="grid size-10 place-items-center rounded-xl bg-white/15"><Compass /></span>Trailhead</div>
      <div className="relative max-w-xl"><p className="mb-5 text-sm font-bold uppercase tracking-[.24em] text-amber-300">Plan together. Go farther.</p><h1 className="text-6xl font-black leading-[.98] tracking-tight">Turn someday into a shared itinerary.</h1><p className="mt-6 max-w-lg text-lg leading-relaxed text-white/70">Trips, checklists, forecasts, files, and your favorite people—in one calm place.</p></div>
      <p className="relative text-sm text-white/55">Built as a hands-on TrailBase workshop.</p>
    </section>
    <section className="grid place-items-center bg-canvas px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 lg:hidden"><div className="flex items-center gap-2 text-xl font-black text-forest"><Compass /> Trailhead</div></div>
        <p className="text-sm font-bold uppercase tracking-[.18em] text-amber-700">Welcome back</p><h2 className="mt-2 text-4xl font-black tracking-tight">Your next trip starts here.</h2><p className="mt-3 text-muted">Sign in with your TrailBase account.</p>
        <Card className="mt-8 p-6">
          <form className="grid gap-4" onSubmit={submit}>
            <Field label="Email or username"><Input name="email" autoComplete="username" required /></Field>
            <Field label="Password"><Input name="password" type="password" autoComplete="current-password" minLength={8} required /></Field>
            {(error || alert) && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error || alert}</p>}
            <Button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
          </form>
          <div className="my-5 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-border" />OR<span className="h-px flex-1 bg-border" /></div>
          <div className="grid gap-3">
            <Button variant="secondary" onClick={() => location.assign(authUi('login'))}><KeyRound size={17} />Google, OTP, or MFA</Button>
            <Button variant="ghost" disabled={busy} onClick={tryAnonymous}>Try anonymously</Button>
          </div>
        </Card>
        <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm"><a className="link" href={authUi('register')}>Create an account</a><a className="link" href={authUi('reset_password/request')}>Forgot password?</a></div>
      </div>
    </section>
  </main>
}
