import { useState, type FormEvent, type ReactNode } from 'react'
import type { LowStock, RecentOrder, TodayData } from './api'
import {
  dayLabel,
  formatDelta,
  formatWon,
  headline,
  nextOrderAction,
  reasonLabel,
  seoulStamp,
  seoulTime,
  shiftDay,
  type OrderAction,
} from './model'

type Props = {
  data: TodayData
  today: string
  onDay: (day: string) => void
  onReceive: (sku: string, qty: number) => Promise<void>
  onOrderAction: (id: string, action: OrderAction) => Promise<void>
  /** 처리 중인 작업 키 (`order:<id>`, `receive:<sku>`) */
  busy: string | null
  error: string | null
}

const BTN = 'h-11 rounded-[2px] px-3 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-erp-signal disabled:opacity-50'
const BTN_LINE = `${BTN} border border-ink bg-white text-ink`
const PANEL = 'border border-erp-line bg-white'
const H2 = 'm-0 text-xl font-extrabold tracking-[-0.02em]'

function Dot({ tone }: { tone: 'ok' | 'caution' | 'critical' | 'ink' | 'muted' | 'signal' }) {
  const bg = { ok: 'bg-erp-ok', caution: 'bg-erp-caution', critical: 'bg-erp-critical', ink: 'bg-ink', muted: 'bg-erp-line', signal: 'bg-erp-signal' }[tone]
  return <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${bg}`} />
}

function Stat({ label, value, unit, note, tone, wide }: { label: string; value: ReactNode; unit?: string; note: string; tone?: 'critical'; wide?: boolean }) {
  return (
    <div className={`flex flex-col gap-1.5 bg-white p-5 ${wide ? 'col-span-2' : ''}`}>
      <span className="text-[13px] text-erp-muted">{label}</span>
      <span className={`leading-[1.1] font-extrabold ${wide ? 'text-[40px] tracking-[-0.03em]' : 'text-[32px] tracking-[-0.02em]'} ${tone === 'critical' ? 'text-erp-critical' : ''}`}>
        {value}
        {unit && <span className={`font-bold ${wide ? 'text-xl' : 'text-[17px]'}`}>{unit}</span>}
      </span>
      <span className="text-[13px] text-erp-muted">{note}</span>
    </div>
  )
}

function orderStatus(o: RecentOrder): { label: string; tone: 'ok' | 'caution' | 'ink' | 'muted' } {
  if (o.outcome === 'cancelled') return { label: '취소', tone: 'muted' }
  if (o.outcome === 'refunded') return { label: '환불', tone: 'muted' }
  if (o.status === 'done') return { label: '완료', tone: 'ok' }
  if (o.status === 'ready') return { label: o.type === 'purchase' ? '픽업 대기' : '피팅룸 준비', tone: 'ink' }
  return { label: '준비 중', tone: 'caution' }
}

function ReceiveRow({ item, busy, onReceive }: { item: LowStock; busy: boolean; onReceive: Props['onReceive'] }) {
  const [open, setOpen] = useState(false)
  const [qty, setQty] = useState('1')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const n = Number(qty)
    if (!Number.isInteger(n) || n < 1) return
    await onReceive(item.sku_id, n)
    setOpen(false)
    setQty('1')
  }
  return (
    <li className="flex flex-col gap-2 border-t border-erp-line px-6 py-2">
      <div className="flex min-h-11 items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{item.product_name}</span>
          <span className="font-erp-mono text-xs text-erp-muted">{item.sku_id}</span>
        </div>
        <span className={`text-[13px] font-semibold whitespace-nowrap ${item.on_hand <= 0 ? 'text-erp-critical' : ''}`}>
          {item.on_hand <= 0 ? '품절' : `${item.on_hand}개`}
        </span>
        {!open && (
          <button type="button" className={BTN_LINE} onClick={() => setOpen(true)} aria-label={`${item.sku_id} 입고`}>
            입고
          </button>
        )}
      </div>
      {open && (
        <form onSubmit={submit} className="flex items-center gap-2 pb-2">
          <label htmlFor={`qty-${item.sku_id}`} className="text-xs text-erp-muted">
            입고 수량
          </label>
          <input
            id={`qty-${item.sku_id}`}
            type="number"
            min={1}
            max={10000}
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className="h-11 w-20 rounded-[2px] border border-erp-line px-2 font-erp-mono text-sm"
          />
          <button type="submit" disabled={busy} className={`${BTN} bg-ink font-semibold text-white`}>
            {busy ? '저장 중…' : '확인'}
          </button>
          <button type="button" className={`${BTN} text-erp-muted underline`} onClick={() => setOpen(false)}>
            취소
          </button>
        </form>
      )}
    </li>
  )
}

/** C안 "오늘 매장 요약" — 데이터만 받아 그린다 (불러오기는 Today.tsx) */
export function TodayView({ data, today, onDay, onReceive, onOrderAction, busy, error }: Props) {
  const isToday = data.day === today
  const manager = data.role !== 'staff'

  return (
    <>
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-1 text-[13px] text-erp-muted">
          <button type="button" aria-label="이전 날" onClick={() => onDay(shiftDay(data.day, -1))} className="grid size-11 place-items-center text-ink">
            <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <span>{dayLabel(data.day, today)}</span>
          <button type="button" aria-label="다음 날" disabled={isToday} onClick={() => onDay(shiftDay(data.day, 1))} className="grid size-11 place-items-center text-ink disabled:text-erp-line">
            <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
          </button>
          {!isToday && (
            <button type="button" onClick={() => onDay(today)} className="h-11 px-2 text-ink underline">
              오늘로
            </button>
          )}
        </div>
        <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.02em]">{headline({ orders: data.counts.orders, pending: data.pending, isToday })}</h1>
      </header>

      {error && (
        <p role="alert" className="m-0 border border-erp-critical bg-white px-4 py-3 text-sm text-erp-critical">
          {error}
        </p>
      )}

      <section aria-label="오늘 숫자" className="grid grid-cols-2 gap-px border border-erp-line bg-erp-line md:grid-cols-5">
        <Stat
          wide
          label="매출"
          value={data.revenue ? formatWon(data.revenue.revenue) : '—'}
          unit={data.revenue ? '원' : undefined}
          note={data.revenue ? `구매 ${data.counts.purchases}건 · 환불 ${formatWon(data.revenue.refunds)}원` : '매출은 매니저 이상만 볼 수 있어요'}
        />
        <Stat label="피팅 요청" value={data.counts.fittings} unit="건" note="FR-03" />
        <Stat label="처리 대기" value={data.pending} unit="건" note="지금 기준" />
        <Stat label="재고 부족" value={data.lowStock.length} unit="개" note="사이즈 기준" tone={data.lowStock.length ? 'critical' : undefined} />
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[3_1_480px] flex-col gap-6">
          <section aria-labelledby="rank-h" className={`${PANEL} flex flex-col gap-4 px-6 py-5`}>
            <div className="flex items-baseline justify-between">
              <h2 id="rank-h" className={H2}>
                상품별 매출
              </h2>
              <span className="text-xs text-erp-muted">피팅 → 구매</span>
            </div>
            {!manager && <p className="m-0 text-sm text-erp-muted">매출은 매니저 이상만 볼 수 있어요.</p>}
            {manager && data.ranking?.length === 0 && <p className="m-0 text-sm text-erp-muted">이날은 판매나 피팅 요청이 없었어요.</p>}
            {data.ranking?.map((r) => (
              <div key={r.product_id} className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                  <span className="text-[13px] whitespace-nowrap text-erp-muted">
                    피팅 {r.fittings} → 구매 {r.units}
                  </span>
                  <span className="w-[120px] text-right text-[17px] font-extrabold whitespace-nowrap">{formatWon(r.revenue)}원</span>
                </div>
                <div role="img" aria-label={`매출의 ${r.sharePct}%`} className="h-2 bg-erp-ground">
                  <div className="h-2 bg-ink" style={{ width: `${r.barPct}%` }} />
                </div>
              </div>
            ))}
          </section>

          <section aria-labelledby="orders-h" className={`${PANEL} flex flex-col`}>
            <div className="flex items-baseline justify-between px-6 pt-5 pb-3">
              <h2 id="orders-h" className={H2}>
                {isToday ? '최근 주문' : '이날 주문'}
              </h2>
              <span className="text-xs text-erp-muted">{data.counts.orders}건</span>
            </div>
            {data.recent.length === 0 && <p className="m-0 border-t border-erp-line px-6 py-4 text-sm text-erp-muted">주문이 없어요.</p>}
            <ul className="m-0 list-none p-0">
              {data.recent.map((o) => {
                const s = orderStatus(o)
                const next = o.outcome ? null : nextOrderAction(o)
                return (
                  <li key={o.id} className="flex min-h-[52px] flex-wrap items-center gap-x-4 gap-y-1 border-t border-erp-line px-6 py-1.5">
                    <span className="w-14 font-erp-mono font-semibold">{o.pickup_code}</span>
                    <span className="w-10 text-[13px] text-erp-muted">{o.type === 'purchase' ? '구매' : '피팅'}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {o.product_name}
                      {o.size ? ` · ${o.size}` : ''}
                    </span>
                    <span className="font-erp-mono text-[13px] text-erp-muted">{seoulTime(o.created_at)}</span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                      <Dot tone={s.tone} />
                      {s.label}
                    </span>
                    {next && (
                      <button type="button" disabled={busy === `order:${o.id}`} onClick={() => onOrderAction(o.id, next.action)} className={BTN_LINE}>
                        {busy === `order:${o.id}` ? '처리 중…' : next.label}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        </div>

        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-6">
          <section aria-labelledby="low-h" className={`${PANEL} flex flex-col`}>
            <div className="px-6 pt-5 pb-3">
              <h2 id="low-h" className={H2}>
                채워야 할 재고
              </h2>
            </div>
            {data.lowStock.length === 0 && <p className="m-0 border-t border-erp-line px-6 py-4 text-sm text-erp-muted">부족한 재고가 없어요.</p>}
            <ul className="m-0 list-none p-0">
              {data.lowStock.map((l) => (
                <ReceiveRow key={l.sku_id} item={l} busy={busy === `receive:${l.sku_id}`} onReceive={onReceive} />
              ))}
            </ul>
          </section>

          <section aria-labelledby="moves-h" className={`${PANEL} flex flex-col`}>
            <div className="px-6 pt-5 pb-3">
              <h2 id="moves-h" className={H2}>
                입출고
              </h2>
            </div>
            {data.movements.length === 0 && <p className="m-0 border-t border-erp-line px-6 py-4 text-sm text-erp-muted">기록이 없어요.</p>}
            <ul className="m-0 list-none p-0">
              {data.movements.map((m) => (
                <li key={m.id} className="flex min-h-[52px] items-center gap-3 border-t border-erp-line px-6 py-1.5">
                  <span className={`w-11 text-xl font-extrabold tracking-[-0.02em] ${m.delta < 0 ? 'text-erp-critical' : ''}`}>{formatDelta(m.delta)}</span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">
                      {reasonLabel(m.reason)} · {m.product_name}
                    </span>
                    <span className="font-erp-mono text-xs text-erp-muted">
                      {m.sku_id} · {seoulStamp(m.created_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="게이트" className={`${PANEL} flex items-center gap-3 px-6 py-4`}>
            <Dot tone={data.tags.online > 0 ? 'signal' : 'muted'} />
            <span className="flex-1">
              태그{' '}
              <b className="font-erp-mono">
                {data.tags.online}/{data.tags.total}
              </b>{' '}
              {data.tags.online > 0 ? '감지 중' : '감지 안 됨'}
            </span>
            <span className="font-erp-mono text-xs text-erp-muted">
              {data.tags.gateway ?? '게이트 없음'}
              {data.tags.online === 0 && data.tags.lastSeen ? ` · 마지막 ${seoulStamp(data.tags.lastSeen)}` : ''}
            </span>
          </section>
        </div>
      </div>
    </>
  )
}
