import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Mail, UserPlus, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { Badge, Button, Card, Empty } from '../components/ui'
import { message } from '../lib/api'
import { authUi, extension } from '../lib/trailbase'
import type { PendingInvite } from '../types'

export function InvitationsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const invitations = useQuery({ queryKey: ['invites'], queryFn: async () => (await extension<{ records: PendingInvite[] }>('/invites')).records, enabled: !!user })
  const accept = useMutation({
    mutationFn: (id: string) => extension<{ trip_id: string }>(`/invites/${id}/accept`, { method: 'POST' }),
    onSuccess: async ({ trip_id }) => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['invites'] }), queryClient.invalidateQueries({ queryKey: ['trips'] })]); navigate(`/trips/${trip_id}`) },
  })
  const decline = useMutation({
    mutationFn: (id: string) => extension(`/invites/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invites'] }),
  })

  if (!user) {
    const returnTo = `${window.location.origin}/invitations`
    return <main className="grid min-h-screen place-items-center bg-canvas px-5 py-12"><Card className="w-full max-w-lg p-7 text-center"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-amber-100 text-amber-800"><Mail /></div><p className="eyebrow mt-6">Trip invitation</p><h1 className="mt-2 text-3xl font-black">Sign in to review your invitations</h1><p className="mt-3 text-muted">Create or sign in to your Trailhead account using the invited email address. You choose whether to join.</p><div className="mt-7 grid gap-3 sm:grid-cols-2"><a className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-forest px-4 py-2 text-sm font-semibold text-white" href={authUi('register', returnTo)}><UserPlus size={17} />Create an account</a><Link className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-ink" to="/login" state={{ from: '/invitations' }}>Sign in</Link></div></Card></main>
  }

  return <section className="mx-auto max-w-3xl"><p className="eyebrow">Your invitations</p><h1 className="mt-2 text-4xl font-black tracking-tight">Choose your next adventure</h1><p className="mt-3 text-muted">You will only join a trip after accepting its invitation.</p>
    {invitations.isPending ? <div className="mt-7 h-44 animate-pulse rounded-2xl bg-stone" /> : invitations.isError ? <p role="alert" className="mt-7 text-red-700">{message(invitations.error)}</p> : invitations.data?.length ? <div className="mt-7 grid gap-4">{invitations.data.map((invite) => <Card key={invite.id} className="p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-center"><div className="grid size-12 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800"><Mail /></div><div className="mr-auto"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-black">{invite.trip_title}</h2><Badge tone="amber">{invite.role}</Badge></div><p className="mt-1 text-sm text-muted">{invite.inviter_name} invited you to {invite.destination}</p><p className="mt-2 text-xs text-muted">Expires {new Date(invite.expires * 1000).toLocaleString()}</p></div><div className="flex gap-2"><Button variant="secondary" disabled={decline.isPending} onClick={() => decline.mutate(invite.id)}><X size={16} />Decline</Button><Button disabled={accept.isPending} onClick={() => accept.mutate(invite.id)}><Check size={16} />Accept</Button></div></div></Card>)}</div> : <div className="mt-7"><Empty title="No pending invitations">When someone invites this email address to a trip, it will appear here.<div className="mt-4"><Link className="link" to="/">Return to your trips</Link></div></Empty></div>}
    {(accept.error || decline.error) && <p role="alert" className="mt-4 text-sm text-red-700">{message(accept.error || decline.error)}</p>}
  </section>
}
