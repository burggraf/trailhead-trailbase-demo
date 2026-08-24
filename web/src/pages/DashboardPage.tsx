import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CalendarDays, MapPin, Plus, Users, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { AuthenticatedImage } from '../components/AuthenticatedImage'
import { Badge, Button, Card, Empty, Field, Input } from '../components/ui'
import { client, extension, recordFileUrl } from '../lib/trailbase'
import { message } from '../lib/api'
import type { PendingInvite, Trip } from '../types'

export function DashboardPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [creating, setCreating] = useState(false)
  const trips = useQuery({ queryKey: ['trips'], queryFn: async () => (await client.records<Trip>('trips').list({ order: ['start_date'], pagination: { limit: 100 } })).records })
  const invites = useQuery({ queryKey: ['invites'], queryFn: async () => (await extension<{ records: PendingInvite[] }>('/invites')).records })
  const create = useMutation({
    mutationFn: async (trip: Pick<Trip, 'title' | 'destination' | 'start_date' | 'end_date' | 'status' | 'notes'>) => extension<{ id: string }>('/trips', { method: 'POST', body: JSON.stringify(trip) }),
    onSuccess: async ({ id }) => { await queryClient.invalidateQueries({ queryKey: ['trips'] }); navigate(`/trips/${id}`) },
  })
  const accept = useMutation({
    mutationFn: (token: string) => extension<{ trip_id: string }>(`/invites/${token}/accept`, { method: 'POST' }),
    onSuccess: async ({ trip_id }) => { await Promise.all([queryClient.invalidateQueries({ queryKey: ['trips'] }), queryClient.invalidateQueries({ queryKey: ['invites'] })]); navigate(`/trips/${trip_id}`) },
  })

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    create.mutate({ title: String(data.get('title')), destination: String(data.get('destination')), start_date: String(data.get('start_date')), end_date: String(data.get('end_date')), status: 'planning', notes: '' })
  }

  return <>
    <section className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div><p className="eyebrow">Your basecamp</p><h1 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">Where to next?</h1><p className="mt-3 text-muted">Welcome back, {user?.username ?? user?.email?.split('@')[0] ?? 'traveler'}.</p></div>
      <Button onClick={() => setCreating(true)}><Plus size={18} />Plan a trip</Button>
    </section>

    {!!invites.data?.length && <section className="mb-10"><h2 className="section-title">Invitations</h2><div className="mt-4 grid gap-3">{invites.data.map((invite) => <Card key={invite.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><div className="grid size-11 place-items-center rounded-xl bg-amber-100 text-amber-800"><Users /></div><div className="mr-auto"><h3 className="font-bold">{invite.trip_title}</h3><p className="text-sm text-muted">{invite.destination} · invited as {invite.role}</p></div><form onSubmit={(event) => { event.preventDefault(); const token = String(new FormData(event.currentTarget).get('token')); accept.mutate(token) }} className="flex gap-2"><Input className="w-44" name="token" placeholder="Paste invite token" required /><Button disabled={accept.isPending}>Join trip</Button></form></Card>)}</div></section>}

    <section><div className="flex items-center justify-between"><h2 className="section-title">Your trips</h2><Badge tone="green">{trips.data?.length ?? 0} total</Badge></div>
      {trips.isPending ? <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{[1,2,3].map((n) => <div key={n} className="h-72 animate-pulse rounded-2xl bg-stone" />)}</div> : trips.isError ? <p role="alert" className="mt-5 text-red-700">{message(trips.error)}</p> : trips.data?.length ? <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{trips.data.map((trip) => <Link key={trip.id} to={`/trips/${trip.id}`} className="group"><Card className="h-full overflow-hidden transition hover:-translate-y-1 hover:shadow-xl"><div className="relative h-40 overflow-hidden bg-[linear-gradient(135deg,#274c3a,#d8973c)]">{trip.cover && <AuthenticatedImage className="size-full object-cover transition duration-500 group-hover:scale-105" src={`${recordFileUrl('trips', trip.id, 'cover')}?v=${trip.cover.id}`} alt="" />}<div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" /><Badge tone="amber"><span className="absolute left-4 top-4">{trip.status}</span></Badge><h3 className="absolute bottom-4 left-4 right-4 text-2xl font-black text-white">{trip.title}</h3></div><div className="grid gap-3 p-5"><p className="flex items-center gap-2 text-sm text-muted"><MapPin size={16} />{trip.destination}</p><p className="flex items-center gap-2 text-sm text-muted"><CalendarDays size={16} />{trip.start_date} → {trip.end_date}</p><div className="mt-2 flex items-center font-semibold text-forest dark:text-emerald-300">Open trip <ArrowRight className="ml-auto transition group-hover:translate-x-1" size={18} /></div></div></Card></Link>)}</div> : <div className="mt-5"><Empty title="No trips yet">Plan your first trip to see Record API CRUD, tenant rules, files, and realtime working together.<div className="mt-5"><Button onClick={() => setCreating(true)}><Plus size={17} />Plan your first trip</Button></div></Empty></div>}
    </section>

    {creating && <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="create-title"><Card className="w-full max-w-lg p-6"><div className="flex items-center"><div><p className="eyebrow">New adventure</p><h2 id="create-title" className="text-2xl font-black">Plan a trip</h2></div><Button variant="ghost" className="ml-auto size-10 px-0" aria-label="Close" onClick={() => setCreating(false)}><X /></Button></div><form className="mt-6 grid gap-4" onSubmit={submit}><Field label="Trip name"><Input name="title" placeholder="Summer in the Dolomites" minLength={2} required /></Field><Field label="Destination"><Input name="destination" placeholder="Cortina d’Ampezzo, Italy" minLength={2} required /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Starts"><Input name="start_date" type="date" required /></Field><Field label="Ends"><Input name="end_date" type="date" required /></Field></div>{create.error && <p role="alert" className="text-sm text-red-700">{message(create.error)}</p>}<Button disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create trip'}</Button></form></Card></div>}
  </>
}
