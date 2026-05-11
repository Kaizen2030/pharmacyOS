import { describe, expect, it } from 'vitest'
import { allocateDiscounts, clampDiscount, roundMoney } from './sales'

describe('roundMoney', () => {
  it('rounds to 2 decimal places', () => {
    expect(roundMoney(1.005)).toBe(1.01)
    expect(roundMoney(1.004)).toBe(1.00)
  })

  it('handles whole numbers', () => {
    expect(roundMoney(250)).toBe(250)
  })

  it('handles zero', () => {
    expect(roundMoney(0)).toBe(0)
  })

  it('avoids floating point drift on repeated operations', () => {
    expect(roundMoney(1.005)).toBe(1.01)
    expect(roundMoney(2.675)).toBe(2.68)
  })
})

describe('clampDiscount', () => {
  it('returns the discount unchanged when within range', () => {
    expect(clampDiscount(50, 200)).toBe(50)
  })

  it('clamps to subtotal when discount exceeds it', () => {
    expect(clampDiscount(500, 200)).toBe(200)
  })

  it('clamps to zero when discount is negative', () => {
    expect(clampDiscount(-10, 200)).toBe(0)
  })

  it('allows a discount equal to the full subtotal', () => {
    expect(clampDiscount(200, 200)).toBe(200)
  })

  it('handles NaN and non-numeric input gracefully', () => {
    expect(clampDiscount('abc', 200)).toBe(0)
    expect(clampDiscount(undefined, 200)).toBe(0)
    expect(clampDiscount(null, 200)).toBe(0)
  })

  it('returns zero when subtotal is zero', () => {
    expect(clampDiscount(50, 0)).toBe(0)
  })
})

describe('allocateDiscounts', () => {
  it('returns empty array for empty input', () => {
    expect(allocateDiscounts([], 50)).toEqual([])
  })

  it('returns empty array for null input', () => {
    expect(allocateDiscounts(null, 50)).toEqual([])
  })

  it('allocates zero discount and leaves items unchanged', () => {
    const items = [
      { id: 1, total: 100 },
      { id: 2, total: 200 },
    ]

    const result = allocateDiscounts(items, 0)

    expect(result[0].discount_allocated).toBe(0)
    expect(result[0].total_after_discount).toBe(100)
    expect(result[1].discount_allocated).toBe(0)
    expect(result[1].total_after_discount).toBe(200)
  })

  it('splits discount proportionally by item weight', () => {
    const items = [
      { id: 1, total: 300 },
      { id: 2, total: 100 },
    ]

    const result = allocateDiscounts(items, 100)

    expect(result[0].discount_allocated).toBe(75)
    expect(result[1].discount_allocated).toBe(25)
    expect(result[0].total_after_discount).toBe(225)
    expect(result[1].total_after_discount).toBe(75)
  })

  it('splits evenly for equal-value items', () => {
    const items = [
      { id: 1, total: 100 },
      { id: 2, total: 100 },
    ]

    const result = allocateDiscounts(items, 50)

    expect(result[0].discount_allocated).toBe(25)
    expect(result[1].discount_allocated).toBe(25)
  })

  it('last item absorbs remainder so sum of allocations equals discount exactly', () => {
    const items = [
      { id: 1, total: 10 },
      { id: 2, total: 10 },
      { id: 3, total: 10 },
    ]

    const result = allocateDiscounts(items, 10)
    const totalAllocated = result.reduce((sum, item) => roundMoney(sum + item.discount_allocated), 0)

    expect(totalAllocated).toBe(10)
  })

  it('sum of total_after_discount equals subtotal minus discount', () => {
    const items = [
      { id: 1, total: 250 },
      { id: 2, total: 30 },
      { id: 3, total: 80 },
    ]
    const discount = 50
    const result = allocateDiscounts(items, discount)
    const subtotal = items.reduce((sum, item) => sum + item.total, 0)
    const totalAfter = result.reduce((sum, item) => roundMoney(sum + item.total_after_discount), 0)

    expect(totalAfter).toBe(roundMoney(subtotal - discount))
  })

  it('handles single item and applies the full discount to it', () => {
    const items = [{ id: 1, total: 500 }]
    const result = allocateDiscounts(items, 100)

    expect(result[0].discount_allocated).toBe(100)
    expect(result[0].total_after_discount).toBe(400)
  })

  it('single item with full discount produces zero payable amount', () => {
    const items = [{ id: 1, total: 50 }]
    const result = allocateDiscounts(items, 50)

    expect(result[0].discount_allocated).toBe(50)
    expect(result[0].total_after_discount).toBe(0)
  })

  it('preserves all other item properties', () => {
    const items = [{ id: 1, drug_name: 'Paracetamol', total: 100, qty: 2 }]
    const result = allocateDiscounts(items, 10)

    expect(result[0].drug_name).toBe('Paracetamol')
    expect(result[0].qty).toBe(2)
    expect(result[0].id).toBe(1)
  })

  it('handles negative discount as zero defensively', () => {
    const items = [{ id: 1, total: 100 }]
    const result = allocateDiscounts(items, -20)

    expect(result[0].discount_allocated).toBe(0)
    expect(result[0].total_after_discount).toBe(100)
  })
})
