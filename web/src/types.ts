export type TripRole = 'owner' | 'editor' | 'viewer'

export interface Profile {
  user: string
  display_name: string
  bio: string
  home_location: string
  created: number
  updated: number
}

export interface Trip {
  id: string
  owner: string
  title: string
  destination: string
  start_date: string
  end_date: string
  status: 'planning' | 'booked' | 'completed' | 'cancelled'
  notes: string
  latitude: number | null
  longitude: number | null
  cover: { id: string; filename?: string; original_filename?: string } | null
  created: number
  updated: number
}

export interface TripMember {
  id: string
  trip_id: string
  user_id: string
  role: TripRole
  joined: number
  display_name: string
  avatar_url: string | null
}

export interface ItineraryItem {
  id: string
  trip_id: string
  created_by: string
  day: string
  start_time: string
  title: string
  place: string
  notes: string
  cost_cents: number | null
  position: number
}

export interface ChecklistItem {
  id: string
  trip_id: string
  created_by: string
  assigned_to: string | null
  text: string
  completed: number
  position: number
}

export interface WeatherBriefing {
  id: string
  trip_id: string
  summary: string
  source_json: string
  fetched: number
}

export interface ActivityEvent {
  id: string
  trip_id: string
  actor: string | null
  kind: string
  summary: string
  created: number
}

export interface PendingInvite {
  id: string
  trip_id: string
  trip_title: string
  destination: string
  role: Exclude<TripRole, 'owner'>
  expires: number
}
