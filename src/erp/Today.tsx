import { useCallback, useEffect, useRef, useState } from 'react'
import { erp } from './client'
import { loadToday, orderAction, receiveStock, type Me, type TodayData } from './api'
import { seoulDay, type OrderAction } from './model'
import { TodayView } from './TodayView'

/** "오늘" 화면: 데이터 불러오기·새로고침·작업 실행. 그리기는 TodayView */
export function Today({ me }: { me: Me }) {
  const today = seoulDay()
  const [day, setDay] = useState(today)
  const [data, setData] = useState<TodayData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const latest = useRef(0)

  const load = useCallback(async () => {
    const id = ++latest.current
    try {
      const d = await loadToday(day, me.role)
      if (id === latest.current) {
        setData(d)
        setError(null)
      }
    } catch (e) {
      if (id === latest.current) setError((e as Error).message)
    }
  }, [day, me.role])

  // 오늘을 보고 있을 때만 10초마다 새로고침 + 주문이 바뀌면 바로 (Broadcast staff:orders)
  useEffect(() => {
    load()
    if (day !== seoulDay()) return
    const timer = setInterval(load, 10_000)
    const channel = erp
      .channel('staff:orders')
      .on('broadcast', { event: 'order' }, () => load())
      .subscribe()
    return () => {
      clearInterval(timer)
      erp.removeChannel(channel)
    }
  }, [load, day])

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try {
      await fn()
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (!data) {
    return error ? (
      <p role="alert" className="m-0 text-sm text-erp-critical">
        {error}
      </p>
    ) : (
      <p className="m-0 text-sm text-erp-muted">불러오는 중…</p>
    )
  }

  return (
    <TodayView
      data={data}
      today={today}
      busy={busy}
      error={error}
      onDay={(d) => {
        setData(null)
        setDay(d)
      }}
      onReceive={(sku, qty) => run(`receive:${sku}`, () => receiveStock(sku, qty))}
      onOrderAction={(id, action: OrderAction) => run(`order:${id}`, () => orderAction(id, action))}
    />
  )
}
