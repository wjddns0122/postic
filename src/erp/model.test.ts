import { describe, expect, it } from 'vitest'
import {
  dayLabel,
  dayRange,
  errorMessage,
  formatDelta,
  formatWon,
  headline,
  nextOrderAction,
  rankProducts,
  seoulDay,
  shiftDay,
} from './model'

describe('seoulDay / shiftDay / dayRange', () => {
  it('uses the Asia/Seoul calendar day, not UTC', () => {
    // 2026-11-13 16:00 UTC = 2026-11-14 01:00 KST
    expect(seoulDay(new Date('2026-11-13T16:00:00Z'))).toBe('2026-11-14')
    expect(seoulDay(new Date('2026-11-13T14:59:00Z'))).toBe('2026-11-13')
  })
  it('shifts across month ends', () => {
    expect(shiftDay('2026-11-30', 1)).toBe('2026-12-01')
    expect(shiftDay('2026-11-01', -1)).toBe('2026-10-31')
  })
  it('gives the UTC bounds of a Seoul day', () => {
    expect(dayRange('2026-11-13')).toEqual({ from: '2026-11-12T15:00:00.000Z', to: '2026-11-13T15:00:00.000Z' })
  })
})

describe('dayLabel', () => {
  it('names the weekday and marks today', () => {
    expect(dayLabel('2026-11-13', '2026-11-13')).toBe('11월 13일 금요일 · 오늘')
    expect(dayLabel('2026-11-12', '2026-11-13')).toBe('11월 12일 목요일')
  })
})

describe('formatWon / formatDelta', () => {
  it('groups thousands', () => {
    expect(formatWon(3730000)).toBe('3,730,000')
    expect(formatWon(0)).toBe('0')
  })
  it('signs movements with a real minus sign', () => {
    expect(formatDelta(4)).toBe('+4')
    expect(formatDelta(-1)).toBe('−1')
  })
})

describe('headline', () => {
  it('asks for action when orders are waiting', () => {
    expect(headline({ orders: 10, pending: 2, isToday: true })).toBe('처리할 주문이 2건 있어요')
  })
  it('celebrates a cleared queue', () => {
    expect(headline({ orders: 53, pending: 0, isToday: true })).toBe('오늘 주문 53건을 모두 처리했어요')
    expect(headline({ orders: 53, pending: 0, isToday: false })).toBe('이날 주문 53건')
  })
  it('handles an empty day', () => {
    expect(headline({ orders: 0, pending: 0, isToday: true })).toBe('아직 주문이 없어요')
    expect(headline({ orders: 0, pending: 0, isToday: false })).toBe('이날은 주문이 없었어요')
  })
})

describe('nextOrderAction', () => {
  it('moves a purchase through pickup', () => {
    expect(nextOrderAction({ type: 'purchase', status: 'preparing' })).toEqual({ action: 'ready', label: '픽업 준비 완료' })
    expect(nextOrderAction({ type: 'purchase', status: 'ready' })).toEqual({ action: 'complete', label: '전달 완료' })
  })
  it('moves a fitting through the room', () => {
    expect(nextOrderAction({ type: 'fitting', status: 'preparing' })).toEqual({ action: 'ready', label: '피팅룸 준비 완료' })
    expect(nextOrderAction({ type: 'fitting', status: 'ready' })).toEqual({ action: 'complete', label: '피팅 종료' })
  })
  it('stops when done', () => {
    expect(nextOrderAction({ type: 'purchase', status: 'done' })).toBeNull()
  })
})

describe('rankProducts', () => {
  const sales = [
    { product_id: 'C4', name: '후디드 파카', units: 2, revenue: 118000 },
    { product_id: 'A7', name: '테일러드 자켓', units: 28, revenue: 3612000 },
  ]
  const funnel = [
    { product_id: 'A7', name: '테일러드 자켓', fitting_requests: 21 },
    { product_id: 'B2', name: '초어 자켓', fitting_requests: 1 },
    { product_id: 'C4', name: '후디드 파카', fitting_requests: 1 },
    { product_id: 'ZZ', name: '조용한 상품', fitting_requests: 0 },
  ]

  it('sorts by revenue, keeps products that only had fittings, drops silent ones', () => {
    const rows = rankProducts(sales, funnel)
    expect(rows.map((r) => r.product_id)).toEqual(['A7', 'C4', 'B2'])
    expect(rows[2]).toMatchObject({ units: 0, revenue: 0, fittings: 1 })
  })

  it('sizes bars against the top seller and shares against the total', () => {
    const [a, c, b] = rankProducts(sales, funnel)
    expect(a.barPct).toBe(100)
    expect(c.barPct).toBeCloseTo(3.27, 1)
    expect(b.barPct).toBe(0)
    expect(a.sharePct).toBe(97)
    expect(c.sharePct).toBe(3)
  })

  it('survives a day with no sales', () => {
    const rows = rankProducts([], [{ product_id: 'A7', name: 'x', fitting_requests: 2 }])
    expect(rows).toEqual([{ product_id: 'A7', name: 'x', units: 0, revenue: 0, fittings: 2, barPct: 0, sharePct: 0 }])
  })
})

describe('errorMessage', () => {
  it('maps server codes to Korean', () => {
    expect(errorMessage('forbidden')).toBe('이 작업은 권한이 더 높은 직원만 할 수 있어요.')
    expect(errorMessage('invalid_input')).toBe('지금 상태에서는 할 수 없는 작업이에요.')
  })
  it('falls back for unknown errors', () => {
    expect(errorMessage('boom')).toBe('처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
  })
})

describe('reasonLabel', () => {
  it('names each stock movement reason in Korean', async () => {
    const { reasonLabel } = await import('./model')
    expect(reasonLabel('opening')).toBe('ERP 도입 시점 재고')
    expect(reasonLabel('receive')).toBe('입고')
    expect(reasonLabel('sale')).toBe('판매')
    expect(reasonLabel('return')).toBe('반품')
    expect(reasonLabel('adjust')).toBe('재고 조정')
    expect(reasonLabel('loss')).toBe('분실')
    expect(reasonLabel('other')).toBe('other')
  })
})

describe('seoulTime / seoulStamp', () => {
  it('formats in Seoul time', async () => {
    const { seoulTime, seoulStamp } = await import('./model')
    expect(seoulTime('2026-11-13T07:31:00Z')).toBe('16:31')
    expect(seoulStamp('2026-11-16T08:31:00Z')).toBe('11-16 17:31')
    expect(seoulStamp('2026-11-15T15:05:00Z')).toBe('11-16 00:05')
  })
})
