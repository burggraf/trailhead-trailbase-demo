// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { message, weatherSummary } from './api'
import { recordFileUrl } from './trailbase'

describe('client helpers', () => {
  it('keeps server errors useful and unknown errors safe', () => {
    expect(message(new Error('Forbidden'))).toBe('Forbidden')
    expect(message({ status: 401, msg: 'Unauthorized' })).toBe('Invalid credentials or email not verified.')
    expect(message(null)).toBe('Something went wrong')
  })

  it('formats stored Celsius weather for each profile preference', () => {
    const weather = { summary: 'Stored summary', source_json: JSON.stringify({ current: { temperature_2m: 20 }, location: 'Sisters, Oregon' }) }
    expect(weatherSummary(weather, 'C')).toBe('Currently 20°C in Sisters, Oregon')
    expect(weatherSummary(weather, 'F')).toBe('Currently 68°F in Sisters, Oregon')
    expect(weatherSummary({ ...weather, source_json: '{}' }, 'F')).toBe('Stored summary')
  })

  it('builds TrailBase record file URLs', () => {
    expect(recordFileUrl('trips', 'abc', 'cover')).toBe('http://localhost:4000/api/records/v1/trips/abc/file/cover')
  })
})
