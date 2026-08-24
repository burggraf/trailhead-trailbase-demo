import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, UserRound } from 'lucide-react'
import { useAuth } from '../auth'
import { Button, Card, Field, Input } from '../components/ui'
import { uploadAvatar, message } from '../lib/api'
import { client } from '../lib/trailbase'
import type { Profile } from '../types'

export function ProfilePage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [avatarVersion, setAvatarVersion] = useState(0)
  const profile = useQuery({ queryKey: ['profile', user?.id], queryFn: async () => (await client.records<Profile>('profiles').list({ filters: [{ column: 'user', value: user!.id }], pagination: { limit: 1 } })).records[0] ?? null, enabled: !!user })
  const save = useMutation({ mutationFn: async (record: Partial<Profile>) => { if (profile.data) await client.records<Profile>('profiles').update(user!.id, record); else await client.records('profiles').create({ ...record, user: user!.id }) }, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile', user?.id] }) })
  const avatar = useMutation({ mutationFn: uploadAvatar, onSuccess: () => setAvatarVersion((value) => value + 1) })
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); save.mutate({ display_name: String(data.get('display_name')), bio: String(data.get('bio')), home_location: String(data.get('home_location')) }) }
  const avatarUrl = client.avatarUrl(user?.id)

  return <div className="mx-auto max-w-3xl"><div><p className="eyebrow">Your identity</p><h1 className="mt-2 text-4xl font-black">Traveler profile</h1><p className="mt-3 text-muted">Profiles are private except among people who share a trip.</p></div><Card className="mt-8 p-6 sm:p-8"><div className="mb-8 flex flex-col items-center gap-5 sm:flex-row"><div className="relative">{avatarUrl ? <img key={avatarVersion} src={`${avatarUrl}?v=${avatarVersion}`} className="size-24 rounded-3xl object-cover" alt="Your avatar" /> : <span className="grid size-24 place-items-center rounded-3xl bg-stone"><UserRound size={36} /></span>}<label className="absolute -bottom-2 -right-2 grid size-10 cursor-pointer place-items-center rounded-xl bg-forest text-white shadow-lg" aria-label="Upload avatar"><Camera size={18} /><input type="file" className="sr-only" accept="image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) avatar.mutate(file) }} /></label></div><div><h2 className="text-xl font-bold">{profile.data?.display_name ?? user?.username ?? 'New traveler'}</h2><p className="text-sm text-muted">{user?.email ?? 'Anonymous account'}</p>{avatar.error && <p className="mt-2 text-sm text-red-700">{message(avatar.error)}</p>}</div></div>{profile.isPending ? <div className="h-72 animate-pulse rounded-xl bg-stone" /> : <form className="grid gap-5" onSubmit={submit}><Field label="Display name"><Input name="display_name" defaultValue={profile.data?.display_name ?? user?.username ?? ''} minLength={2} maxLength={60} required /></Field><Field label="Home location"><Input name="home_location" defaultValue={profile.data?.home_location ?? ''} maxLength={120} placeholder="Portland, Oregon" /></Field><Field label="Bio"><textarea className="input min-h-28 resize-y" name="bio" maxLength={280} defaultValue={profile.data?.bio ?? ''} placeholder="What kind of traveler are you?" /></Field>{save.error && <p role="alert" className="text-sm text-red-700">{message(save.error)}</p>}<Button disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save profile'}</Button></form>}</Card></div>
}
