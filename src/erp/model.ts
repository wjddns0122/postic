// ERP 화면용 순수 함수 (데이터 → 화면 값). 서버 호출은 api.ts

export type Role = 'owner' | 'manager' | 'staff'
export type OrderType = 'purchase' | 'fitting'
export type OrderStatus = 'preparing' | 'ready' | 'done'
export type OrderAction = 'ready' | 'complete' | 'cancel' | 'refund'

const SEOUL = 'Asia/Seoul'
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** 서울 기준 날짜 'YYYY-MM-DD' */
export function seoulDay(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SEOUL, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

export function shiftDay(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 서울의 하루를 UTC 시각 범위로 (orders.created_at 조회용) */
export function dayRange(day: string): { from: string; to: string } {
  const from = new Date(`${day}T00:00:00+09:00`)
  const to = new Date(`${shiftDay(day, 1)}T00:00:00+09:00`)
  return { from: from.toISOString(), to: to.toISOString() }
}

export function dayLabel(day: string, today: string): string {
  const [, m, d] = day.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]
  return `${m}월 ${d}일 ${weekday}요일${day === today ? ' · 오늘' : ''}`
}

const parts = (iso: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: SEOUL,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  )

/** '16:31' (서울 시각) */
export const seoulTime = (iso: string) => {
  const p = parts(iso)
  return `${p.hour}:${p.minute}`
}

/** '11-16 17:31' (서울 시각) */
export const seoulStamp = (iso: string) => {
  const p = parts(iso)
  return `${p.month}-${p.day} ${p.hour}:${p.minute}`
}

export const formatWon = (n: number) => n.toLocaleString('ko-KR')

/** +4 / −1 (빼기는 U+2212) */
export const formatDelta = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`)

export function headline({ orders, pending, isToday }: { orders: number; pending: number; isToday: boolean }): string {
  if (pending > 0) return `처리할 주문이 ${pending}건 있어요`
  if (orders === 0) return isToday ? '아직 주문이 없어요' : '이날은 주문이 없었어요'
  return isToday ? `오늘 주문 ${orders}건을 모두 처리했어요` : `이날 주문 ${orders}건`
}

/** 주문의 다음 단계 버튼 (완료면 없음) */
export function nextOrderAction(o: { type: OrderType; status: OrderStatus }): { action: OrderAction; label: string } | null {
  if (o.status === 'preparing') return { action: 'ready', label: o.type === 'purchase' ? '픽업 준비 완료' : '피팅룸 준비 완료' }
  if (o.status === 'ready') return { action: 'complete', label: o.type === 'purchase' ? '전달 완료' : '피팅 종료' }
  return null
}

export type RankRow = {
  product_id: string
  name: string
  units: number
  revenue: number
  fittings: number
  /** 1등 매출 대비 막대 길이 % */
  barPct: number
  /** 전체 매출 중 비중 % (반올림) */
  sharePct: number
}

/** 상품별 매출 + 피팅 요청 → 매출순. 매출도 피팅도 없는 상품은 뺀다 */
export function rankProducts(
  sales: { product_id: string; name: string; units: number; revenue: number }[],
  funnel: { product_id: string; name: string; fitting_requests: number }[],
): RankRow[] {
  const rows = new Map<string, RankRow>()
  const row = (id: string, name: string) => {
    let r = rows.get(id)
    if (!r) rows.set(id, (r = { product_id: id, name, units: 0, revenue: 0, fittings: 0, barPct: 0, sharePct: 0 }))
    return r
  }
  for (const s of sales) Object.assign(row(s.product_id, s.name), { units: s.units, revenue: s.revenue })
  for (const f of funnel) if (f.fitting_requests > 0) row(f.product_id, f.name).fittings = f.fitting_requests

  const list = [...rows.values()].sort((a, b) => b.revenue - a.revenue || b.fittings - a.fittings)
  const top = list[0]?.revenue ?? 0
  const total = list.reduce((sum, r) => sum + r.revenue, 0)
  for (const r of list) {
    r.barPct = top ? (r.revenue / top) * 100 : 0
    r.sharePct = total ? Math.round((r.revenue / total) * 100) : 0
  }
  return list
}

const RANK: Record<Role, number> = { owner: 3, manager: 2, staff: 1 }
export const roleAtLeast = (role: Role, min: Role) => RANK[role] >= RANK[min]

type OrderLike = { type?: OrderType; status: OrderStatus; outcome: 'completed' | 'cancelled' | 'refunded' | null }

/** 주문 탭: 진행 중(open) / 완료(done) / 취소·환불(closed) */
export function orderTab(o: OrderLike): 'open' | 'done' | 'closed' {
  if (o.outcome === 'cancelled' || o.outcome === 'refunded') return 'closed'
  return o.status === 'done' ? 'done' : 'open'
}

/** 취소: manager 이상, 건네기 전(done 아님) */
export const canCancel = (o: OrderLike, role: Role) => roleAtLeast(role, 'manager') && o.status !== 'done' && o.outcome == null

/** 환불: manager 이상, 수령 완료된 구매 */
export const canRefund = (o: OrderLike, role: Role) =>
  roleAtLeast(role, 'manager') && o.type === 'purchase' && o.status === 'done' && (o.outcome ?? 'completed') === 'completed'

export const formatMac = (mac: string | null) => (mac ? mac.match(/.{2}/g)!.join(':') : '—')

export function isOnline(lastSeen: string | null, now: number, onlineSeconds: number) {
  return lastSeen != null && now - new Date(lastSeen).getTime() <= onlineSeconds * 1000
}

/** G1 업로드 본문의 gw(MAC) 끝 4자리로 게이트 이름 */
export function gatewayName(body: string | null): string | null {
  try {
    const gw = body ? (JSON.parse(body) as { gw?: string }).gw : undefined
    return gw ? `G1-${gw.slice(-4).toUpperCase()}` : null
  } catch {
    return null
  }
}

/** 오늘로 끝나는 n일 범위 */
export const rangeDays = (n: number, today: string) => ({ from: shiftDay(today, -(n - 1)), to: today })

const REASONS: Record<string, string> = {
  opening: 'ERP 도입 시점 재고',
  receive: '입고',
  sale: '판매',
  return: '반품',
  adjust: '재고 조정',
  loss: '분실',
}

export const reasonLabel = (reason: string) => REASONS[reason] ?? reason

const ERRORS: Record<string, string> = {
  not_staff: '직원 계정이 아니에요. 매장 owner에게 등록을 요청하세요.',
  forbidden: '이 작업은 권한이 더 높은 직원만 할 수 있어요.',
  not_found: '대상을 찾을 수 없어요. 새로고침해 주세요.',
  invalid_input: '지금 상태에서는 할 수 없는 작업이에요.',
  out_of_stock: '재고가 없어요.',
  rate_limited: '요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.',
  user_not_found: '그 이메일로 만든 계정이 없어요. 먼저 Supabase에서 계정을 만들어 주세요.',
  last_owner: '마지막 owner는 내리거나 끌 수 없어요.',
  tag_in_use: '다른 상품이 쓰고 있는 태그예요.',
  invalid_product: '판매 중이 아닌 상품이에요.',
}

export const errorMessage = (code: string) => ERRORS[code] ?? '처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
