import { describe, expect, it } from 'vitest'
import { hashPin, normalizePin } from './pin'

describe('normalizePin', () => {
  it('keeps only digits and trims to four characters', () => {
    expect(normalizePin('12a3-45')).toBe('1234')
  })

  it('returns an empty string for nullish input', () => {
    expect(normalizePin(undefined)).toBe('')
    expect(normalizePin(null)).toBe('')
  })
})

describe('hashPin', () => {
  it('returns a deterministic sha256 hash for the same pin', async () => {
    const first = await hashPin('1234')
    const second = await hashPin('1234')

    expect(first).toBe(second)
    expect(first).toHaveLength(64)
  })

  it('normalizes formatted input before hashing', async () => {
    const raw = await hashPin('12-34')
    const clean = await hashPin('1234')

    expect(raw).toBe(clean)
  })

  it('produces a different hash for a different pin', async () => {
    const first = await hashPin('1234')
    const second = await hashPin('4321')

    expect(first).not.toBe(second)
  })
})
