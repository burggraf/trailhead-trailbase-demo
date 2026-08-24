import type { UnitSystem, WeatherBriefing } from '../types'
import { client, trailbaseUrl } from './trailbase'

export async function uploadRecordFile(api: string, id: string, column: string, file: File) {
  await client.refreshAuthToken()
  const body = new FormData()
  body.append(column, file)
  const response = await fetch(new URL(`/api/records/v1/${api}/${id}`, trailbaseUrl), {
    method: 'PATCH',
    headers: client.headers(),
    body,
  })
  if (!response.ok) throw new Error(await response.text() || `Upload failed (${response.status})`)
}

export async function uploadAvatar(file: File) {
  await client.refreshAuthToken()
  const body = new FormData()
  body.append('file', file)
  const response = await fetch(new URL('/api/auth/v1/avatar', trailbaseUrl), {
    method: 'POST',
    headers: client.headers(),
    body,
  })
  if (!response.ok) throw new Error(await response.text() || `Avatar upload failed (${response.status})`)
}

export interface DailyForecast {
  date: string
  code: number
  highC: number
  lowC: number
  rainChance: number | null
  precipitationMm: number | null
  windKph: number | null
}

export function formatTemperature(celsius: number, system: UnitSystem) {
  const temperature = system === 'imperial' ? celsius * 9 / 5 + 32 : celsius
  return `${Math.round(temperature)}°${system === 'imperial' ? 'F' : 'C'}`
}

export function formatWind(kph: number, system: UnitSystem) {
  const value = system === 'imperial' ? kph / 1.609344 : kph
  return `${Number(value.toFixed(1))} ${system === 'imperial' ? 'mph' : 'km/h'}`
}

export function formatPrecipitation(mm: number, system: UnitSystem) {
  const value = system === 'imperial' ? mm / 25.4 : mm
  return `${Number(value.toFixed(system === 'imperial' ? 2 : 1))} ${system === 'imperial' ? 'inches' : 'mm'}`
}

export function weatherCodeLabel(code: number) {
  if (code === 0) return 'Clear'
  if (code <= 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code === 45 || code === 48) return 'Fog'
  if (code >= 51 && code <= 57) return 'Drizzle'
  if (code >= 61 && code <= 67) return 'Rain'
  if (code >= 71 && code <= 77) return 'Snow'
  if (code >= 80 && code <= 82) return 'Rain showers'
  if (code >= 85 && code <= 86) return 'Snow showers'
  if (code >= 95) return 'Thunderstorms'
  return 'Mixed conditions'
}

export function dailyForecast(weather: Pick<WeatherBriefing, 'source_json'>): DailyForecast[] {
  try {
    const daily = (JSON.parse(weather.source_json) as { daily?: Record<string, unknown> }).daily
    if (!daily || !Array.isArray(daily.time) || !Array.isArray(daily.weather_code) || !Array.isArray(daily.temperature_2m_max) || !Array.isArray(daily.temperature_2m_min)) return []
    const numberAt = (values: unknown, index: number) => Array.isArray(values) && typeof values[index] === 'number' ? values[index] : null
    return daily.time.slice(0, 7).flatMap((date, index) => {
      const code = numberAt(daily.weather_code, index)
      const highC = numberAt(daily.temperature_2m_max, index)
      const lowC = numberAt(daily.temperature_2m_min, index)
      return typeof date === 'string' && code !== null && highC !== null && lowC !== null ? [{ date, code, highC, lowC, rainChance: numberAt(daily.precipitation_probability_max, index), precipitationMm: numberAt(daily.precipitation_sum, index), windKph: numberAt(daily.wind_speed_10m_max, index) }] : []
    })
  } catch { return [] }
}

export function isTripDay(date: string, startDate: string, endDate: string) {
  return date >= startDate && date <= endDate
}

export function weatherSummary(weather: Pick<WeatherBriefing, 'summary' | 'source_json'>, system: UnitSystem) {
  try {
    const source = JSON.parse(weather.source_json) as { current?: { temperature_2m?: unknown }; location?: unknown }
    const celsius = source.current?.temperature_2m
    if (typeof celsius === 'number' && typeof source.location === 'string') {
      return `Currently ${formatTemperature(celsius, system)} in ${source.location}`
    }
  } catch { /* use the stored provider summary */ }
  return weather.summary
}

export function message(error: unknown) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    if ('status' in error && error.status === 401) return 'Invalid credentials or email not verified.'
    if ('message' in error && typeof error.message === 'string') return error.message
    if ('msg' in error && typeof error.msg === 'string') return error.msg
  }
  return 'Something went wrong'
}
