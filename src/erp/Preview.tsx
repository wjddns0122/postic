// 개발 서버 전용 미리보기 (/erp/preview, /erp/preview?role=staff). 배포 빌드에는 포함되지 않는다.
// 값은 11월 13일 시연 실데이터와 11월 16일 재고를 옮긴 것이다. 버튼은 이 화면 안에서만 값을 바꾼다.
import { useState } from 'react'
import type { TodayData } from './api'
import { ErpShell } from './ErpShell'
import { rankProducts, type Role } from './model'
import { TodayView } from './TodayView'

const DAY = '2026-11-13'

function fixture(role: Role): TodayData {
  const manager = role !== 'staff'
  return {
    day: DAY,
    role,
    counts: { orders: 53, purchases: 30, fittings: 23 },
    pending: 1,
    revenue: manager ? { revenue: 3730000, refunds: 0, net: 3730000 } : null,
    ranking: manager
      ? rankProducts(
          [
            { product_id: 'A7-32F1', name: '3버튼 테일러드 자켓', units: 28, revenue: 3612000 },
            { product_id: 'C4-77A0', name: '후디드 파카', units: 2, revenue: 118000 },
          ],
          [
            { product_id: 'A7-32F1', name: '3버튼 테일러드 자켓', fitting_requests: 21 },
            { product_id: 'B2-19C7', name: '셀비지 코듀로이 초어 자켓', fitting_requests: 1 },
            { product_id: 'C4-77A0', name: '후디드 파카', fitting_requests: 1 },
          ],
        )
      : null,
    lowStock: [
      { sku_id: 'A7-32F1/XL', product_name: '3버튼 테일러드 자켓', size: 'XL', on_hand: 0 },
      { sku_id: 'A7-32F1/L', product_name: '3버튼 테일러드 자켓', size: 'L', on_hand: 1 },
      { sku_id: 'B2-19C7/XL', product_name: '셀비지 코듀로이 초어 자켓', size: 'XL', on_hand: 1 },
      { sku_id: 'C4-77A0/S', product_name: '후디드 파카', size: 'S', on_hand: 1 },
    ],
    movements: [
      { id: 4, delta: 6, reason: 'opening', created_at: '2026-11-16T08:31:00Z', sku_id: 'C4-77A0/M', size: 'M', product_name: '후디드 파카' },
      { id: 3, delta: 5, reason: 'opening', created_at: '2026-11-16T08:31:00Z', sku_id: 'B2-19C7/M', size: 'M', product_name: '셀비지 코듀로이 초어 자켓' },
      { id: 2, delta: 4, reason: 'opening', created_at: '2026-11-16T08:31:00Z', sku_id: 'A7-32F1/M', size: 'M', product_name: '3버튼 테일러드 자켓' },
      { id: 1, delta: -1, reason: 'sale', created_at: '2026-11-13T07:31:00Z', sku_id: 'A7-32F1/L', size: 'L', product_name: '3버튼 테일러드 자켓' },
    ],
    recent: [
      { id: 'p1', pickup_code: 'B-94', type: 'purchase', size: 'M', status: 'preparing', outcome: null, created_at: '2026-11-13T07:33:00Z', product_name: '3버튼 테일러드 자켓' },
      { id: 'p2', pickup_code: 'B-93', type: 'purchase', size: 'L', status: 'done', outcome: 'completed', created_at: '2026-11-13T07:31:00Z', product_name: '3버튼 테일러드 자켓' },
      { id: 'p3', pickup_code: 'B-92', type: 'fitting', size: 'M', status: 'done', outcome: 'completed', created_at: '2026-11-13T07:31:00Z', product_name: '3버튼 테일러드 자켓' },
      { id: 'p4', pickup_code: 'B-91', type: 'fitting', size: 'S', status: 'done', outcome: 'completed', created_at: '2026-11-13T07:28:00Z', product_name: '3버튼 테일러드 자켓' },
      { id: 'p5', pickup_code: 'B-90', type: 'purchase', size: 'S', status: 'done', outcome: 'completed', created_at: '2026-11-13T07:25:00Z', product_name: '3버튼 테일러드 자켓' },
      { id: 'p6', pickup_code: 'B-89', type: 'purchase', size: 'S', status: 'done', outcome: 'completed', created_at: '2026-11-13T07:25:00Z', product_name: '3버튼 테일러드 자켓' },
    ],
    tags: { online: 3, total: 3, gateway: 'G1-6F84', lastSeen: '2026-11-13T07:49:55Z' },
  }
}

export default function Preview() {
  const role = (new URLSearchParams(location.search).get('role') as Role) || 'owner'
  const [data, setData] = useState(() => fixture(role))
  const wait = () => new Promise((r) => setTimeout(r, 400))
  return (
    <ErpShell me={{ user_id: 'preview', email: 'preview@postic.dev', display_name: '미리보기', role }} onSignOut={() => {}}>
      <TodayView
        data={data}
        today={DAY}
        busy={null}
        error={null}
        onDay={() => {}}
        onReceive={async (sku, qty) => {
          await wait()
          setData((d) => ({ ...d, lowStock: d.lowStock.map((l) => (l.sku_id === sku ? { ...l, on_hand: l.on_hand + qty } : l)).filter((l) => l.on_hand <= 1) }))
        }}
        onOrderAction={async (id, action) => {
          await wait()
          setData((d) => ({
            ...d,
            pending: action === 'complete' ? Math.max(0, d.pending - 1) : d.pending,
            recent: d.recent.map((o) => (o.id === id ? { ...o, status: action === 'ready' ? 'ready' : 'done', outcome: action === 'complete' ? 'completed' : o.outcome } : o)),
          }))
        }}
      />
    </ErpShell>
  )
}
