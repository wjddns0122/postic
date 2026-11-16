import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { deviceId, supabase, tagKey, type Order, type Presence, type Product, type Settings } from './lib'

type Seen = Presence & { seenAt: number; rssiAvg: number }

type Live = {
  products: Product[]
  orders: Order[]
  settings: Settings
  now: number
  seen: (p: Product) => Seen | undefined
  isOnline: (p: Product) => boolean
  online: Product[]
  anySimulated: boolean
  reload: () => void
  /** Broadcast나 RPC 응답으로 받은 주문 한 건을 목록에 반영 */
  mergeOrder: (o: Order) => void
  applySettings: (s: Settings) => void
}

const Ctx = createContext<Live | null>(null)

const byNewest = (a: Order, b: Order) => b.created_at.localeCompare(a.created_at)

/**
 * 동시 접속 대응 (Supabase 무료 플랜):
 * - 태그 상태 2초, 주문·설정 6초마다 조회한다. Postgres Changes 구독은 Nano DB에서
 *   구독 관리 커넥션이 2개뿐이라 수십 명이 붙으면 일부 기기가 이벤트를 못 받는다.
 * - 내 주문 변경만 Broadcast `device:<기기 토큰>` 채널로 바로 받는다 (orders_broadcast 트리거).
 *   직원 대시보드는 `staff:orders` 채널을 따로 구독한다.
 */
export function LiveProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([])
  const [presence, setPresence] = useState<Record<string, Seen>>({})
  const [orders, setOrders] = useState<Order[]>([])
  const [settings, setSettings] = useState<Settings>({ id: 1, rssi_threshold: -100, online_seconds: 10 })
  const [now, setNow] = useState(Date.now())
  const presenceRef = useRef(presence)
  presenceRef.current = presence

  const upsertPresence = (p: Presence, seenAt: number) => {
    const prev = presenceRef.current[p.key]
    const rssi = p.rssi ?? -100
    const rssiAvg = prev ? Math.round(prev.rssiAvg * 0.6 + rssi * 0.4) : rssi
    setPresence((s) => ({ ...s, [p.key]: { ...p, seenAt, rssiAvg } }))
  }

  const mergeOrder = (o: Order) => {
    if (o?.id) setOrders((s) => [o, ...s.filter((x) => x.id !== o.id)].sort(byNewest))
  }

  const loadOrdersAndSettings = () => {
    supabase.from('orders').select('*').order('created_at', { ascending: false }).limit(100).then(({ data }) => data && setOrders(data))
    supabase.from('settings').select('*').eq('id', 1).single().then(({ data }) => data && setSettings(data))
  }

  const reload = () => {
    supabase.from('products').select('*').order('sort').then(({ data }) => data && setProducts(data))
    supabase.from('tag_presence').select('*').then(({ data }) => {
      if (!data) return
      // 초기값은 서버 시각 기준, 이후는 조회에서 바뀐 걸 본 시각(기기 시계 오차 무시)
      setPresence(Object.fromEntries(data.map((p: Presence) => [p.key, { ...p, seenAt: Date.parse(p.last_seen), rssiAvg: p.rssi ?? -100 }])))
    })
    loadOrdersAndSettings()
  }

  const pollPresence = () =>
    supabase.from('tag_presence').select('*').then(({ data }) => {
      if (!data) return
      for (const p of data as Presence[]) {
        const prev = presenceRef.current[p.key]
        // 마지막 수신 시각이 바뀐 행만 "방금 받음"으로 본다
        if (!prev) upsertPresence(p, Date.parse(p.last_seen))
        else if (prev.last_seen !== p.last_seen) upsertPresence(p, Date.now())
      }
    })

  useEffect(() => {
    reload()
    const t = setInterval(() => setNow(Date.now()), 1000)
    let tick = 0
    const poll = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      pollPresence()
      if (++tick % 3 === 0) loadOrdersAndSettings()
    }, 2000)
    // 폰 화면이 꺼졌다 켜지면 그동안 놓친 것까지 다시 받는다
    const onVisible = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onVisible)
    const ch = supabase
      .channel(`device:${deviceId()}`)
      .on('broadcast', { event: 'order' }, ({ payload }) => mergeOrder(payload as Order))
      .subscribe()
    return () => {
      clearInterval(t)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(ch)
    }
  }, [])

  const value = useMemo<Live>(() => {
    const seen = (p: Product) => presence[tagKey(p)]
    const isOnline = (p: Product) => {
      const s = seen(p)
      if (!s) return false
      return now - s.seenAt <= settings.online_seconds * 1000 && s.rssiAvg >= settings.rssi_threshold
    }
    const online = products.filter(isOnline)
    return {
      products,
      orders,
      settings,
      now,
      seen,
      isOnline,
      online,
      anySimulated: online.some((p) => seen(p)?.simulated),
      reload,
      mergeOrder,
      applySettings: setSettings,
    }
  }, [products, presence, orders, settings, now])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLive() {
  const v = useContext(Ctx)
  if (!v) throw new Error('LiveProvider missing')
  return v
}
