import { erp } from './client'
import {
  dayRange,
  errorMessage,
  rankProducts,
  type OrderAction,
  type OrderStatus,
  type OrderType,
  type RankRow,
  type Role,
} from './model'

export type Me = { user_id: string; email: string; display_name: string; role: Role }

export type RecentOrder = {
  id: string
  pickup_code: string
  type: OrderType
  size: string | null
  status: OrderStatus
  outcome: 'completed' | 'cancelled' | 'refunded' | null
  created_at: string
  product_name: string
}

export type LowStock = { sku_id: string; product_name: string; size: string; on_hand: number }
export type Movement = { id: number; delta: number; reason: string; created_at: string; sku_id: string; product_name: string; size: string }

export type TodayData = {
  day: string
  role: Role
  counts: { orders: number; purchases: number; fittings: number }
  pending: number
  /** manager 이상만 */
  revenue: { revenue: number; refunds: number; net: number } | null
  /** manager 이상만 */
  ranking: RankRow[] | null
  lowStock: LowStock[]
  movements: Movement[]
  recent: RecentOrder[]
  tags: { online: number; total: number; gateway: string | null; lastSeen: string | null }
}

/** 서버 오류 코드(예: 'forbidden') → 한국어 문구로 던진다 */
export function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(errorMessage(res.error.message))
  return res.data
}

export async function loadMe(): Promise<Me | null> {
  return check(await erp.rpc('erp_me')) as Me | null
}

export async function loadToday(day: string, role: Role): Promise<TodayData> {
  const manager = role === 'owner' || role === 'manager'
  const { from, to } = dayRange(day)

  const [dash, orders, low, moves, tagRows, tagged, sales, byProduct, funnel] = await Promise.all([
    erp.rpc('erp_dashboard'),
    erp
      .from('orders')
      .select('id, pickup_code, type, size, status, outcome, created_at, products(name)')
      .gte('created_at', from)
      .lt('created_at', to)
      .order('created_at', { ascending: false })
      .limit(500),
    erp.from('erp_stock_view').select('sku_id, product_name, size, on_hand').eq('low', true).eq('active', true).order('on_hand'),
    erp
      .from('inventory_movements')
      .select('id, delta, reason, created_at, sku_id, skus(size, products(name))')
      .order('created_at', { ascending: false })
      .limit(6),
    erp.from('tag_presence').select('gateway, last_seen').eq('simulated', false).order('last_seen', { ascending: false }).limit(1),
    erp.from('products').select('id', { count: 'exact', head: true }).eq('status', 'active').not('mac', 'is', null),
    manager ? erp.rpc('erp_sales_daily', { p_from: day, p_to: day }) : null,
    manager ? erp.rpc('erp_sales_by_product', { p_from: day, p_to: day }) : null,
    manager ? erp.rpc('erp_product_funnel', { p_from: day, p_to: day }) : null,
  ])

  const d = check(dash) as { pending: number; tags_online: number }
  const dayOrders = check(orders) ?? []
  const live = dayOrders.filter((o) => o.outcome !== 'cancelled')
  const salesRow = sales ? check(sales)?.[0] : undefined

  return {
    day,
    role,
    counts: {
      orders: live.length,
      purchases: live.filter((o) => o.type === 'purchase').length,
      fittings: live.filter((o) => o.type === 'fitting').length,
    },
    pending: d.pending,
    revenue: salesRow ? { revenue: salesRow.revenue, refunds: salesRow.refunds, net: salesRow.net } : null,
    ranking: byProduct && funnel ? rankProducts(check(byProduct) ?? [], check(funnel) ?? []) : null,
    lowStock: (check(low) ?? []).map((r) => ({
      sku_id: r.sku_id ?? '',
      product_name: r.product_name ?? '',
      size: r.size ?? '',
      on_hand: r.on_hand ?? 0,
    })),
    movements: (check(moves) ?? []).map((m) => ({
      id: m.id,
      delta: m.delta,
      reason: m.reason,
      created_at: m.created_at,
      sku_id: m.sku_id,
      size: m.skus?.size ?? '',
      product_name: m.skus?.products?.name ?? m.sku_id,
    })),
    recent: dayOrders.slice(0, 8).map((o) => ({
      id: o.id,
      pickup_code: o.pickup_code,
      type: o.type as OrderType,
      size: o.size,
      status: o.status as OrderStatus,
      outcome: o.outcome as RecentOrder['outcome'],
      created_at: o.created_at,
      product_name: o.products?.name ?? '',
    })),
    tags: {
      online: d.tags_online,
      total: tagged.count ?? 0,
      gateway: check(tagRows)?.[0]?.gateway ?? null,
      lastSeen: check(tagRows)?.[0]?.last_seen ?? null,
    },
  }
}

export async function receiveStock(sku: string, qty: number) {
  check(await erp.rpc('erp_receive_stock', { p_sku: sku, p_qty: qty }))
}

export async function orderAction(order: string, action: OrderAction) {
  check(await erp.rpc('erp_order_action', { p_order: order, p_action: action }))
}
