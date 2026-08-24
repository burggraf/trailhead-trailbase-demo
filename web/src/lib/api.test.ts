// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { dailyForecast, formatPrecipitation, formatTemperature, formatWind, isTripDay, message, weatherCodeLabel, weatherSummary } from './api'
import { recordFileUrl } from './trailbase'

describe('client helpers', () => {
  it('keeps server errors useful and unknown errors safe', () => {
    expect(message(new Error('Forbidden'))).toBe('Forbidden')
    expect(message({ status: 401, msg: 'Unauthorized' })).toBe('Invalid credentials or email not verified.')
    expect(message(null)).toBe('Something went wrong')
  })

  it('formats metric source weather for each measurement system', () => {
    const weather = { summary: 'Stored summary', source_json: JSON.stringify({ current: { temperature_2m: 20 }, location: 'Sisters, Oregon' }) }
    expect(weatherSummary(weather, 'metric')).toBe('Currently 20°C in Sisters, Oregon')
    expect(weatherSummary(weather, 'imperial')).toBe('Currently 68°F in Sisters, Oregon')
    expect(formatWind(30.8, 'metric')).toBe('30.8 km/h')
    expect(formatWind(30.8, 'imperial')).toBe('19.1 mph')
    expect(formatPrecipitation(6.2, 'metric')).toBe('6.2 mm')
    expect(formatPrecipitation(6.2, 'imperial')).toBe('0.24 inches')
    expect(weatherSummary({ ...weather, source_json: '{}' }, 'imperial')).toBe('Stored summary')
  })

  it('parses daily outlooks and labels WMO weather codes', () => {
    const weather = {
      source_json: JSON.stringify({ daily: {
        time: ['2026-08-24', '2026-08-25'], weather_code: [0, 61],
        temperature_2m_max: [20.4, 18.2], temperature_2m_min: [10.1, 9.8],
        precipitation_probability_max: [5, 80], precipitation_sum: [0, 6.2], wind_speed_10m_max: [12, 24],
      } }),
    }
    expect(dailyForecast(weather)).toEqual([
      { date: '2026-08-24', code: 0, highC: 20.4, lowC: 10.1, rainChance: 5, precipitationMm: 0, windKph: 12 },
      { date: '2026-08-25', code: 61, highC: 18.2, lowC: 9.8, rainChance: 80, precipitationMm: 6.2, windKph: 24 },
    ])
    expect(weatherCodeLabel(0)).toBe('Clear')
    expect(weatherCodeLabel(61)).toBe('Rain')
    expect(formatTemperature(20, 'imperial')).toBe('68°F')
    expect(isTripDay('2026-08-25', '2026-08-25', '2026-08-27')).toBe(true)
    expect(isTripDay('2026-08-24', '2026-08-25', '2026-08-27')).toBe(false)
  })

  it('builds TrailBase record file URLs', () => {
    expect(recordFileUrl('trips', 'abc', 'cover')).toBe('http://localhost:4000/api/records/v1/trips/abc/file/cover')
  })
})
