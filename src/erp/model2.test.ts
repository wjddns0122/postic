import { describe, expect, it } from 'vitest'
import { canCancel, canRefund, formatMac, gatewayName, isOnline, orderTab, rangeDays, roleAtLeast } from './model'

describe('roleAtLeast', () => {
  it('ranks owner > manager > staff', () => {
    expect(roleAtLeast('owner', 'manager')).toBe(true)
    expect(roleAtLeast('manager', 'manager')).toBe(true)
    expect(roleAtLeast('staff', 'manager')).toBe(false)
    expect(roleAtLeast('manager', 'owner')).toBe(false)
  })
})

describe('orderTab', () => {
  it('sorts orders into 진행 중 / 완료 / 취소·환불', () => {
    expect(orderTab({ status: 'preparing', outcome: null })).toBe('open')
    expect(orderTab({ status: 'ready', outcome: null })).toBe('open')
    expect(orderTab({ status: 'done', outcome: 'completed' })).toBe('done')
    expect(orderTab({ status: 'done', outcome: null })).toBe('done') // ERP 이전 주문
    expect(orderTab({ status: 'done', outcome: 'cancelled' })).toBe('closed')
    expect(orderTab({ status: 'done', outcome: 'refunded' })).toBe('closed')
  })
})

describe('canCancel / canRefund', () => {
  const open = { type: 'purchase' as const, status: 'ready' as const, outcome: null }
  const done = { type: 'purchase' as const, status: 'done' as const, outcome: 'completed' as const }
  it('lets managers cancel only before handover', () => {
    expect(canCancel(open, 'manager')).toBe(true)
    expect(canCancel(open, 'staff')).toBe(false)
    expect(canCancel(done, 'owner')).toBe(false)
  })
  it('lets managers refund only completed purchases', () => {
    expect(canRefund(done, 'manager')).toBe(true)
    expect(canRefund({ ...done, outcome: null }, 'manager')).toBe(true) // ERP 이전 완료 주문
    expect(canRefund(done, 'staff')).toBe(false)
    expect(canRefund(open, 'owner')).toBe(false)
    expect(canRefund({ ...done, type: 'fitting' }, 'owner')).toBe(false)
    expect(canRefund({ ...done, outcome: 'refunded' }, 'owner')).toBe(false)
  })
})

describe('formatMac', () => {
  it('formats 12 hex digits with colons', () => {
    expect(formatMac('789F380FF5AF')).toBe('78:9F:38:0F:F5:AF')
    expect(formatMac(null)).toBe('—')
  })
})

describe('isOnline', () => {
  const now = new Date('2026-11-13T07:50:00Z').getTime()
  it('is online within the window', () => {
    expect(isOnline('2026-11-13T07:49:55Z', now, 10)).toBe(true)
    expect(isOnline('2026-11-13T07:49:45Z', now, 10)).toBe(false)
    expect(isOnline(null, now, 10)).toBe(false)
  })
})

describe('gatewayName', () => {
  it('reads the gateway MAC from the last upload', () => {
    expect(gatewayName('{"gw":"ac233fc26f84","adv":[]}')).toBe('G1-6F84')
    expect(gatewayName('not json')).toBe(null)
    expect(gatewayName(null)).toBe(null)
  })
})

describe('rangeDays', () => {
  it('ends today and counts today', () => {
    expect(rangeDays(7, '2026-11-16')).toEqual({ from: '2026-11-10', to: '2026-11-16' })
    expect(rangeDays(30, '2026-11-16')).toEqual({ from: '2026-10-18', to: '2026-11-16' })
  })
})

describe('errorMessage (staff, tags)', () => {
  it('explains account, owner and tag errors', async () => {
    const { errorMessage } = await import('./model')
    expect(errorMessage('user_not_found')).toBe('그 이메일로 만든 계정이 없어요. 먼저 Supabase에서 계정을 만들어 주세요.')
    expect(errorMessage('last_owner')).toBe('마지막 owner는 내리거나 끌 수 없어요.')
    expect(errorMessage('tag_in_use')).toBe('다른 상품이 쓰고 있는 태그예요.')
    expect(errorMessage('invalid_product')).toBe('판매 중이 아닌 상품이에요.')
  })
})
