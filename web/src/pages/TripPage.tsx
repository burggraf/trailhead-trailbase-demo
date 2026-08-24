import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CalendarDays, Check, CloudSun, Copy, ImagePlus, ListChecks, MapPin, Plus, RefreshCw, Route, Trash2, UserPlus, Users } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { Badge, Button, Card, Empty, Field, Input } from '../components/ui'
import { uploadRecordFile, message } from '../lib/api'
import { client, extension, recordFileUrl } from '../lib/trailbase'
import { useRealtime } from '../hooks/useRealtime'
import type { ActivityEvent, ChecklistItem, ItineraryItem, Trip, TripMember, TripRole, WeatherBriefing } from '../types'

const tabs = ['overview', 'itinerary', 'checklist', 'members', 'activity'] as const
type Tab = typeof tabs[number]

export function TripPage() {
  const { tripId = '' } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('overview')
  const key = useMemo(() => ['trip', tripId] as const, [tripId])
  const invalidate = () => queryClient.invalidateQueries({ queryKey: key })

  const trip = useQuery({ queryKey: [...key, 'record'], queryFn: () => client.records<Trip>('trips').read(tripId), enabled: !!tripId })
  const members = useQuery({ queryKey: [...key, 'members'], queryFn: async () => (await client.records<TripMember>('trip_members_view').list({ filters: [{ column: 'trip_id', value: tripId }], order: ['joined'], pagination: { limit: 100 } })).records })
  const itinerary = useQuery({ queryKey: [...key, 'itinerary'], queryFn: async () => (await client.records<ItineraryItem>('itinerary_items').list({ filters: [{ column: 'trip_id', value: tripId }], order: ['day', 'start_time', 'position'], pagination: { limit: 200 } })).records })
  const checklist = useQuery({ queryKey: [...key, 'checklist'], queryFn: async () => (await client.records<ChecklistItem>('checklist_items').list({ filters: [{ column: 'trip_id', value: tripId }], order: ['completed', 'position'], pagination: { limit: 200 } })).records })
  const activity = useQuery({ queryKey: [...key, 'activity'], queryFn: async () => (await client.records<ActivityEvent>('activity_events').list({ filters: [{ column: 'trip_id', value: tripId }], order: ['-created'], pagination: { limit: 100 } })).records })
  const weather = useQuery({ queryKey: [...key, 'weather'], queryFn: async () => (await client.records<WeatherBriefing>('weather_briefings').list({ filters: [{ column: 'trip_id', value: tripId }], pagination: { limit: 1 } })).records[0] ?? null })

  useRealtime('itinerary_items', key, !!tripId)
  useRealtime('checklist_items', key, !!tripId)
  useRealtime('trip_members_view', key, !!tripId)
  useRealtime('activity_events', key, !!tripId)
  useRealtime('weather_briefings', key, !!tripId)

  const role = members.data?.find((member) => member.user_id === user?.id)?.role
  const canEdit = role === 'owner' || role === 'editor'
  const isOwner = role === 'owner'

  const removeTrip = useMutation({ mutationFn: () => client.records('trips').delete(tripId), onSuccess: () => navigate('/') })
  const upload = useMutation({ mutationFn: (file: File) => uploadRecordFile('trips', tripId, 'cover', file), onSuccess: invalidate })
  const refreshWeather = useMutation({ mutationFn: () => extension(`/trips/${tripId}/briefing`, { method: 'POST' }), onSuccess: invalidate })

  if (trip.isPending) return <div className="h-96 animate-pulse rounded-3xl bg-stone" />
  if (trip.isError) return <Card className="p-8"><h1 className="text-2xl font-black">Trip unavailable</h1><p className="mt-2 text-muted">{message(trip.error)}</p><Link className="link mt-5 inline-block" to="/">Back to trips</Link></Card>

  return <>
    <Link to="/" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink"><ArrowLeft size={16} />All trips</Link>
    <section className="relative overflow-hidden rounded-3xl bg-forest text-white shadow-xl">
      {trip.data.cover && <img className="absolute inset-0 size-full object-cover opacity-45" src={recordFileUrl('trips', tripId, 'cover')} alt="" />}
      <div className="absolute inset-0 bg-gradient-to-r from-forest via-forest/80 to-transparent" />
      <div className="relative p-7 sm:p-10"><div className="flex flex-wrap gap-2"><Badge tone="amber">{trip.data.status}</Badge><Badge>{role ?? 'member'}</Badge></div><h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">{trip.data.title}</h1><div className="mt-5 flex flex-wrap gap-5 text-sm text-white/75"><span className="flex items-center gap-2"><MapPin size={17} />{trip.data.destination}</span><span className="flex items-center gap-2"><CalendarDays size={17} />{trip.data.start_date} → {trip.data.end_date}</span><span className="flex items-center gap-2"><Users size={17} />{members.data?.length ?? 0} travelers</span></div></div>
    </section>

    <div className="mt-7 flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1" role="tablist">{tabs.map((item) => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`min-h-10 whitespace-nowrap rounded-lg px-4 text-sm font-semibold capitalize ${tab === item ? 'bg-forest text-white' : 'text-muted hover:bg-stone hover:text-ink'}`}>{item}</button>)}</div>

    <div className="mt-7">
      {tab === 'overview' && <Overview trip={trip.data} weather={weather.data} canEdit={canEdit} isOwner={isOwner} upload={upload} refreshWeather={refreshWeather} removeTrip={removeTrip} invalidate={invalidate} />}
      {tab === 'itinerary' && <Itinerary tripId={tripId} userId={user!.id} items={itinerary.data ?? []} canEdit={canEdit} invalidate={invalidate} />}
      {tab === 'checklist' && <Checklist tripId={tripId} userId={user!.id} items={checklist.data ?? []} canEdit={canEdit} invalidate={invalidate} />}
      {tab === 'members' && <Members tripId={tripId} members={members.data ?? []} isOwner={isOwner} invalidate={invalidate} />}
      {tab === 'activity' && <Activity events={activity.data ?? []} members={members.data ?? []} />}
    </div>
  </>
}

function Overview({ trip, weather, canEdit, isOwner, upload, refreshWeather, removeTrip, invalidate }: { trip: Trip; weather?: WeatherBriefing | null; canEdit: boolean; isOwner: boolean; upload: ReturnType<typeof useMutation<void, Error, File>>; refreshWeather: ReturnType<typeof useMutation<unknown, Error, void>>; removeTrip: ReturnType<typeof useMutation<void, Error, void>>; invalidate: () => Promise<unknown> }) {
  const save = useMutation({ mutationFn: (record: Partial<Trip>) => client.records<Trip>('trips').update(trip.id, record), onSuccess: invalidate })
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); save.mutate({ title: String(data.get('title')), destination: String(data.get('destination')), status: String(data.get('status')) as Trip['status'], notes: String(data.get('notes')) }) }
  return <div className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
    <Card className="p-6"><div className="flex items-center gap-2"><Route className="text-amber-600" /><h2 className="section-title">Trip details</h2></div><form className="mt-6 grid gap-4" onSubmit={submit}><Field label="Name"><Input name="title" defaultValue={trip.title} disabled={!canEdit} /></Field><Field label="Destination"><Input name="destination" defaultValue={trip.destination} disabled={!canEdit} /></Field><Field label="Status"><select name="status" defaultValue={trip.status} disabled={!canEdit} className="input">{['planning','booked','completed','cancelled'].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Notes"><textarea name="notes" defaultValue={trip.notes} disabled={!canEdit} className="input min-h-36 resize-y" maxLength={5000} /></Field>{save.error && <p className="text-sm text-red-700">{message(save.error)}</p>}{canEdit && <Button disabled={save.isPending}>Save details</Button>}</form></Card>
    <div className="grid content-start gap-6"><Card className="p-6"><div className="flex items-center"><CloudSun className="mr-2 text-amber-600" /><h2 className="section-title">Weather briefing</h2></div>{weather ? <><p className="mt-4 text-lg font-semibold">{weather.summary}</p><p className="mt-2 text-xs text-muted">Updated {new Date(weather.fetched * 1000).toLocaleString()}</p></> : <p className="mt-4 text-sm text-muted">Generate a briefing using Nominatim and Open-Meteo.</p>}<Button className="mt-5 w-full" variant="secondary" disabled={refreshWeather.isPending} onClick={() => refreshWeather.mutate()}><RefreshCw size={16} className={refreshWeather.isPending ? 'animate-spin' : ''} />{weather ? 'Refresh' : 'Generate'} briefing</Button>{refreshWeather.error && <p className="mt-3 text-sm text-red-700">{message(refreshWeather.error)}</p>}</Card>
    {canEdit && <Card className="p-6"><h2 className="section-title">Cover photo</h2><label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border p-5 text-sm font-semibold text-muted hover:bg-stone"><ImagePlus size={18} />Upload JPEG, PNG, or WebP<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file) }} /></label>{upload.error && <p className="mt-2 text-sm text-red-700">{message(upload.error)}</p>}</Card>}
    {isOwner && <Card className="border-red-200 p-6 dark:border-red-950"><h2 className="font-bold text-red-700 dark:text-red-300">Danger zone</h2><p className="mt-2 text-sm text-muted">Deleting a trip cascades all tenant data and files.</p><Button className="mt-4" variant="danger" disabled={removeTrip.isPending} onClick={() => confirm('Delete this trip and all its data?') && removeTrip.mutate()}><Trash2 size={16} />Delete trip</Button></Card>}</div>
  </div>
}

function Itinerary({ tripId, userId, items, canEdit, invalidate }: { tripId: string; userId: string; items: ItineraryItem[]; canEdit: boolean; invalidate: () => Promise<unknown> }) {
  const add = useMutation({ mutationFn: (record: Partial<ItineraryItem>) => client.records('itinerary_items').create(record), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: (id: string) => client.records('itinerary_items').delete(id), onSuccess: invalidate })
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); add.mutate({ trip_id: tripId, created_by: userId, day: String(data.get('day')), start_time: data.get('start_time') ? `${String(data.get('start_time'))}:00` : '', title: String(data.get('title')), place: String(data.get('place')), notes: '', position: items.length }, { onSuccess: () => form.reset() }) }
  return <div className="grid gap-6 lg:grid-cols-[.7fr_1.3fr]">{canEdit && <Card className="h-fit p-6"><div className="flex items-center gap-2"><Plus className="text-amber-600" /><h2 className="section-title">Add a stop</h2></div><form className="mt-5 grid gap-4" onSubmit={submit}><Field label="Date"><Input type="date" name="day" required /></Field><Field label="Time"><Input type="time" name="start_time" /></Field><Field label="What’s happening?"><Input name="title" placeholder="Sunrise hike" required /></Field><Field label="Place"><Input name="place" placeholder="Tre Cime trailhead" /></Field><Button disabled={add.isPending}>Add to itinerary</Button>{add.error && <p className="text-sm text-red-700">{message(add.error)}</p>}</form></Card>}<section><h2 className="section-title">Itinerary</h2>{items.length ? <div className="mt-5 grid gap-3">{items.map((item) => <Card key={item.id} className="flex items-start gap-4 p-5"><div className="min-w-20 rounded-xl bg-stone p-3 text-center"><p className="text-xs font-bold uppercase text-muted">{new Date(`${item.day}T00:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</p><p className="mt-1 text-sm font-semibold">{item.start_time || 'Anytime'}</p></div><div className="mr-auto"><h3 className="font-bold">{item.title}</h3>{item.place && <p className="mt-1 flex items-center gap-1 text-sm text-muted"><MapPin size={14} />{item.place}</p>}</div>{canEdit && <Button variant="ghost" className="size-9 px-0" aria-label={`Delete ${item.title}`} onClick={() => remove.mutate(item.id)}><Trash2 size={16} /></Button>}</Card>)}</div> : <div className="mt-5"><Empty title="Nothing scheduled">Add the first stop to shape the trip together.</Empty></div>}</section></div>
}

function Checklist({ tripId, userId, items, canEdit, invalidate }: { tripId: string; userId: string; items: ChecklistItem[]; canEdit: boolean; invalidate: () => Promise<unknown> }) {
  const add = useMutation({ mutationFn: (text: string) => client.records('checklist_items').create({ trip_id: tripId, created_by: userId, text, completed: 0, position: items.length }), onSuccess: invalidate })
  const toggle = useMutation({ mutationFn: (item: ChecklistItem) => client.records('checklist_items').update(item.id, { completed: item.completed ? 0 : 1 }), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: (id: string) => client.records('checklist_items').delete(id), onSuccess: invalidate })
  const complete = items.filter((item) => item.completed).length
  return <section className="mx-auto max-w-3xl"><div className="flex items-end justify-between"><div><p className="eyebrow">Shared progress</p><h2 className="section-title mt-1">Packing checklist</h2></div><Badge tone="green">{complete}/{items.length} done</Badge></div>{canEdit && <form className="mt-5 flex gap-2" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); add.mutate(String(data.get('text')), { onSuccess: () => form.reset() }) }}><Input name="text" placeholder="Add a shared task…" maxLength={200} required /><Button><Plus size={17} />Add</Button></form>}<Card className="mt-5 divide-y divide-border overflow-hidden">{items.length ? items.map((item) => <div key={item.id} className="flex items-center gap-3 p-4"><button disabled={!canEdit} onClick={() => toggle.mutate(item)} aria-label={item.completed ? `Mark ${item.text} incomplete` : `Mark ${item.text} complete`} className={`grid size-6 place-items-center rounded-md border ${item.completed ? 'border-forest bg-forest text-white' : 'border-border'}`}>{item.completed ? <Check size={15} /> : null}</button><span className={`mr-auto ${item.completed ? 'text-muted line-through' : ''}`}>{item.text}</span>{canEdit && <Button variant="ghost" className="size-9 px-0" onClick={() => remove.mutate(item.id)} aria-label={`Delete ${item.text}`}><Trash2 size={15} /></Button>}</div>) : <div className="p-10 text-center text-sm text-muted">Your shared checklist is empty.</div>}</Card></section>
}

function Members({ tripId, members, isOwner, invalidate }: { tripId: string; members: TripMember[]; isOwner: boolean; invalidate: () => Promise<unknown> }) {
  const [token, setToken] = useState('')
  const invite = useMutation({ mutationFn: (input: { email: string; role: string }) => extension<{ token: string }>(`/trips/${tripId}/invites`, { method: 'POST', body: JSON.stringify(input) }), onSuccess: (data) => setToken(data.token) })
  const update = useMutation({ mutationFn: ({ id, role }: { id: string; role: TripRole }) => client.records('trip_members').update(id, { role }), onSuccess: invalidate })
  const remove = useMutation({ mutationFn: (id: string) => client.records('trip_members').delete(id), onSuccess: invalidate })
  return <div className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]"><section><h2 className="section-title">Travelers</h2><div className="mt-5 grid gap-3">{members.map((member) => <Card key={member.id} className="flex items-center gap-4 p-4">{member.avatar_url ? <img className="size-11 rounded-xl object-cover" src={new URL(member.avatar_url, client.base).toString()} alt="" /> : <span className="grid size-11 place-items-center rounded-xl bg-stone font-bold">{member.display_name[0]}</span>}<div className="mr-auto"><h3 className="font-bold">{member.display_name}</h3><p className="text-sm text-muted">Joined {new Date(member.joined * 1000).toLocaleDateString()}</p></div>{isOwner && member.role !== 'owner' ? <><select className="input w-auto" value={member.role} aria-label={`Role for ${member.display_name}`} onChange={(event) => update.mutate({ id: member.id, role: event.target.value as TripRole })}><option value="editor">editor</option><option value="viewer">viewer</option></select><Button variant="ghost" className="size-9 px-0" onClick={() => remove.mutate(member.id)} aria-label={`Remove ${member.display_name}`}><Trash2 size={16} /></Button></> : <Badge tone={member.role === 'owner' ? 'amber' : 'neutral'}>{member.role}</Badge>}</Card>)}</div></section>{isOwner && <Card className="h-fit p-6"><div className="flex items-center gap-2"><UserPlus className="text-amber-600" /><h2 className="section-title">Invite someone</h2></div><form className="mt-5 grid gap-4" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); invite.mutate({ email: String(data.get('email')), role: String(data.get('role')) }) }}><Field label="Email"><Input type="email" name="email" required /></Field><Field label="Role"><select className="input" name="role"><option value="editor">Editor — can plan</option><option value="viewer">Viewer — read only</option></select></Field><Button disabled={invite.isPending}>Create invitation</Button></form>{token && <div className="mt-4 rounded-xl bg-stone p-4"><p className="text-xs font-bold uppercase text-muted">Local workshop token</p><code className="mt-2 block break-all text-xs">{token}</code><Button variant="ghost" className="mt-2" onClick={() => navigator.clipboard.writeText(token)}><Copy size={15} />Copy token</Button></div>}{invite.error && <p className="mt-3 text-sm text-red-700">{message(invite.error)}</p>}</Card>}</div>
}

function Activity({ events, members }: { events: ActivityEvent[]; members: TripMember[] }) {
  const names = new Map(members.map((member) => [member.user_id, member.display_name]))
  return <section className="mx-auto max-w-3xl"><h2 className="section-title">Activity</h2>{events.length ? <div className="relative mt-5 grid gap-4 before:absolute before:bottom-4 before:left-[19px] before:top-4 before:w-px before:bg-border">{events.map((event) => <div key={event.id} className="relative flex gap-4"><span className="z-10 grid size-10 shrink-0 place-items-center rounded-full border border-border bg-card text-forest"><ListChecks size={17} /></span><Card className="flex-1 p-4"><p><strong>{event.actor ? names.get(event.actor) ?? 'A traveler' : 'Trailhead'}</strong> {event.summary.toLowerCase()}</p><p className="mt-1 text-xs text-muted">{new Date(event.created * 1000).toLocaleString()}</p></Card></div>)}</div> : <Empty title="No activity yet">Changes made by the team will appear here in realtime.</Empty>}</section>
}
