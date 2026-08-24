// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { message } from './api'
import { recordFileUrl } from './trailbase'

describe('client helpers', () => {
  it('keeps server errors useful and unknown errors safe', () => {
    expect(message(new Error('Forbidden'))).toBe('Forbidden')
    expect(message({ status: 401, msg: 'Unauthorized' })).toBe('Invalid credentials or email not verified.')
    expect(message(null)).toBe('Something went wrong')
  })

  it('builds TrailBase record file URLs', () => {
    expect(recordFileUrl('trips', 'abc', 'cover')).toBe('http://localhost:4000/api/records/v1/trips/abc/file/cover')
  })
})
