import { useState, type FormEvent } from 'react'
import { erp } from '../client'
import { check, orderAction } from '../api'
import {
  canCancel,
  canRefund,
  dayLabel,
  dayRange,
  formatWon,
  nextOrderAction,
  orderTab,
  seoulDay,
  seoulTime,
  shiftDay,
  type OrderAction,
  type OrderStatus,
  type OrderType,
} from '../model'
import { Badge, BTN_LINE, BTN_PRIMARY, BTN_QUIET, BTN_TEXT, Empty, ErrorBox, INPUT, Loading, MONO, PageHeader, Panel, TABLE, TableBox, Tabs, TD, TH, useAction, useLoad, useMe, type Tone } from '../ui'

type Tab = 'open' | 'done' | 'closed' | 'all'
type Row = {
  id: string
  pickup_code: string
  type: OrderType
  size: string | null
  status: OrderStatus
  outcome: 'completed' | 'cancelled' | 'refunded' | null
  amount: number
  pay_method: string | null
  created_at: string
  product_name: string
  notes: { action: string; note: string }[]
}

const TABS: { value: Tab; label: string }[] = [
  { value: 'open', label: '진행 중' },
  { value: 'done', label: '완료' },
  { value: 'closed', label: '취소·환불' },
  { value: 'all', label: '전체' },
]

function status(o: Row): { label: string; tone: Tone } {
  if (o.outcome === 'cancelled') return { label: '취소', tone: 'muted' }
  if (o.outcome === 'refunded') return { label: '환불', tone: 'muted' }
  if (o.status === 'done') return { label: '완료', tone: 'ok' }
  if (o.status === 'ready') return { label: o.type === 'purchase' ? '픽업 대기' : '피팅룸 준비', tone: 'ink' }
  return { label: '준비 중', tone: 'caution' }
}

async function loadOrders(tab: Tab, day: string): Promise<Row[]> {
  let q = erp
    .from('orders')
    .select('id, pickup_code, type, size, status, outcome, amount, pay_method, created_at, products(name)')
    .order('created_at', { ascending: false })
    .limit(300)
  if (tab === 'open') q = q.neq('status', 'done')
  else {
    const { from, to } = dayRange(day)
    q = q.gte('created_at', from).lt('created_at', to)
  }
  const rows = (check(await q) ?? [])
    .map((o) => ({ ...o, type: o.type as OrderType, status: o.status as OrderStatus, outcome: o.outcome as Row['outcome'], product_name: o.products?.name ?? '', notes: [] as Row['notes'] }))
    .filter((o) => tab === 'all' || orderTab(o) === tab)
  if (rows.length) {
    const notes = check(await erp.from('order_notes').select('order_id, action, note').in('order_id', rows.map((r) => r.id))) ?? []
    for (const n of notes) rows.find((r) => r.id === n.order_id)?.notes.push(n)
  }
  return rows
}

/** 취소·환불 확인 + 사유 (사유는 직원만 보는 order_notes에 저장) */
function CloseForm({ action, busy, onSubmit, onCancel }: { action: 'cancel' | 'refund'; busy: boolean; onSubmit: (note: string) => void; onCancel: () => void }) {
  const [note, setNote] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit(note)
  }
  const label = action === 'cancel' ? '취소' : '환불'
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 py-2">
      <label className="text-xs text-erp-muted" htmlFor="close-note">
        {label} 사유 (선택, 직원만 봄)
      </label>
      <input id="close-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={`${INPUT} min-w-0 flex-1`} />
      <button type="submit" disabled={busy} className={BTN_PRIMARY}>
        {busy ? '처리 중…' : `${label}하기`}
      </button>
      <button type="button" onClick={onCancel} className={BTN_TEXT}>
        닫기
      </button>
    </form>
  )
}

export default function Orders() {
  const me = useMe()
  const today = seoulDay()
  const [tab, setTab] = useState<Tab>('open')
  const [day, setDay] = useState(today)
  const [closing, setClosing] = useState<{ id: string; action: 'cancel' | 'refund' } | null>(null)
  const { data, error, setError, reload } = useLoad(() => loadOrders(tab, day), [tab, day], 10_000)
  const { busy, run } = useAction(reload, setError)

  const act = (id: string, action: OrderAction, note?: string) =>
    run(`order:${id}`, async () =>
      note !== undefined ? check(await erp.rpc('erp_order_action', { p_order: id, p_action: action, p_note: note || undefined })) : orderAction(id, action),
    )

  return (
    <>
      <PageHeader title="주문" sub="구매·피팅 요청을 처리합니다. 손님 화면에 바로 반영돼요." />
      <ErrorBox message={error} />
      <Tabs label="주문 상태" value={tab} options={TABS} onChange={setTab} />
      {tab !== 'open' && (
        <div className="flex items-center gap-1 text-[13px] text-erp-muted">
          <button type="button" aria-label="이전 날" onClick={() => setDay(shiftDay(day, -1))} className={BTN_QUIET}>
            ◀
          </button>
          <span className="px-2">{dayLabel(day, today)}</span>
          <button type="button" aria-label="다음 날" disabled={day >= today} onClick={() => setDay(shiftDay(day, 1))} className={BTN_QUIET}>
            ▶
          </button>
        </div>
      )}

      <Panel title={TABS.find((t) => t.value === tab)!.label} meta={data ? `${data.length}건` : undefined}>
        {!data && !error && (
          <div className="px-6 pb-5">
            <Loading />
          </div>
        )}
        {data?.length === 0 && <Empty>{tab === 'open' ? '처리할 주문이 없어요.' : '주문이 없어요.'}</Empty>}
        {data && data.length > 0 && (
          <TableBox>
            <table className={`${TABLE} min-w-[760px]`}>
              <thead>
                <tr>
                  <th scope="col" className={TH}>번호</th>
                  <th scope="col" className={TH}>구분</th>
                  <th scope="col" className={TH}>상품</th>
                  <th scope="col" className={`${TH} text-right`}>금액</th>
                  <th scope="col" className={TH}>시각</th>
                  <th scope="col" className={TH}>상태</th>
                  <th scope="col" className={`${TH} text-right`}>처리</th>
                </tr>
              </thead>
              <tbody>
                {data.map((o) => {
                  const s = status(o)
                  const next = o.outcome ? null : nextOrderAction(o)
                  const key = `order:${o.id}`
                  return (
                    <tr key={o.id}>
                      <td className={`${TD} ${MONO} font-semibold`}>{o.pickup_code}</td>
                      <td className={`${TD} text-erp-muted`}>{o.type === 'purchase' ? '구매' : '피팅'}</td>
                      <td className={TD}>
                        <div className="flex flex-col">
                          <span>
                            {o.product_name}
                            {o.size ? ` · ${o.size}` : ''}
                          </span>
                          {o.notes.map((n, i) => (
                            <span key={i} className="text-xs text-erp-muted">
                              {n.action === 'cancel' ? '취소' : n.action === 'refund' ? '환불' : '메모'} 사유: {n.note}
                            </span>
                          ))}
                          {closing?.id === o.id && (
                            <CloseForm
                              action={closing.action}
                              busy={busy === key}
                              onCancel={() => setClosing(null)}
                              onSubmit={async (note) => (await act(o.id, closing.action, note)) && setClosing(null)}
                            />
                          )}
                        </div>
                      </td>
                      <td className={`${TD} ${MONO} text-right`}>{o.type === 'purchase' ? `${formatWon(o.amount)}원` : '—'}</td>
                      <td className={`${TD} ${MONO} text-erp-muted`}>{seoulTime(o.created_at)}</td>
                      <td className={TD}>
                        <Badge tone={s.tone}>{s.label}</Badge>
                      </td>
                      <td className={`${TD} text-right`}>
                        <div className="flex justify-end gap-2">
                          {next && (
                            <button type="button" disabled={busy === key} onClick={() => act(o.id, next.action)} className={BTN_LINE}>
                              {busy === key ? '처리 중…' : next.label}
                            </button>
                          )}
                          {canCancel(o, me.role) && closing?.id !== o.id && (
                            <button type="button" onClick={() => setClosing({ id: o.id, action: 'cancel' })} className={BTN_TEXT}>
                              취소
                            </button>
                          )}
                          {canRefund(o, me.role) && closing?.id !== o.id && (
                            <button type="button" onClick={() => setClosing({ id: o.id, action: 'refund' })} className={BTN_TEXT}>
                              환불
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableBox>
        )}
      </Panel>
    </>
  )
}
