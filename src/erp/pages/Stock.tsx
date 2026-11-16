import { useState, type FormEvent } from 'react'
import { erp } from '../client'
import { check, receiveStock } from '../api'
import { formatDelta, reasonLabel, roleAtLeast, seoulStamp } from '../model'
import { Badge, BTN_PRIMARY, BTN_QUIET, BTN_TEXT, Empty, ErrorBox, INPUT, Loading, MONO, PageHeader, Panel, TABLE, TableBox, Tabs, TD, TH, useAction, useLoad, useMe } from '../ui'

type Row = { sku_id: string; product_name: string; size: string; on_hand: number; reorder_point: number; low: boolean; active: boolean }
type Move = { id: number; delta: number; reason: string; note: string | null; created_at: string; sku_id: string; product_name: string; who: string }

async function loadStock() {
  const [s, m, staff] = await Promise.all([
    erp.from('erp_stock_view').select('sku_id, product_name, size, on_hand, reorder_point, low, active, sort').order('product_name').order('sort'),
    erp.from('inventory_movements').select('id, delta, reason, note, created_at, sku_id, actor, skus(products(name))').order('created_at', { ascending: false }).limit(30),
    erp.from('staff_members').select('user_id, display_name'),
  ])
  const names = new Map((check(staff) ?? []).map((x) => [x.user_id, x.display_name]))
  return {
    rows: (check(s) ?? []) as Row[],
    moves: (check(m) ?? []).map((x) => ({
      id: x.id,
      delta: x.delta,
      reason: x.reason,
      note: x.note,
      created_at: x.created_at,
      sku_id: x.sku_id,
      product_name: x.skus?.products?.name ?? '',
      who: x.actor ? names.get(x.actor) || '직원' : x.reason === 'sale' || x.reason === 'return' ? '주문' : '시스템',
    })) as Move[],
  }
}

/** 입고(staff) 또는 실사로 맞추기(manager) */
function RowForm({ row, mode, busy, onDone, onCancel }: { row: Row; mode: 'receive' | 'count'; busy: boolean; onDone: (n: number, reason: 'adjust' | 'loss', note: string) => void; onCancel: () => void }) {
  const [n, setN] = useState(mode === 'receive' ? '1' : String(row.on_hand))
  const [reason, setReason] = useState<'adjust' | 'loss'>('adjust')
  const [note, setNote] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = Number(n)
    if (!Number.isInteger(v) || v < (mode === 'receive' ? 1 : 0)) return
    onDone(v, reason, note)
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 py-2">
      <label htmlFor={`n-${row.sku_id}`} className="text-xs text-erp-muted">
        {mode === 'receive' ? '입고 수량' : '실사 수량'}
      </label>
      <input id={`n-${row.sku_id}`} type="number" min={mode === 'receive' ? 1 : 0} value={n} onChange={(e) => setN(e.target.value)} className={`${INPUT} w-20 ${MONO} text-sm`} />
      {mode === 'count' && (
        <select aria-label="사유" value={reason} onChange={(e) => setReason(e.target.value as 'adjust' | 'loss')} className={`${INPUT} text-sm`}>
          <option value="adjust">재고 조정</option>
          <option value="loss">분실</option>
        </select>
      )}
      <input aria-label="메모" placeholder="메모 (선택)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={`${INPUT} w-40 text-sm`} />
      <button type="submit" disabled={busy} className={BTN_PRIMARY}>
        {busy ? '저장 중…' : '확인'}
      </button>
      <button type="button" onClick={onCancel} className={BTN_TEXT}>
        닫기
      </button>
    </form>
  )
}

export default function Stock() {
  const me = useMe()
  const manager = roleAtLeast(me.role, 'manager')
  const [filter, setFilter] = useState<'all' | 'low'>('all')
  const [open, setOpen] = useState<{ sku: string; mode: 'receive' | 'count' } | null>(null)
  const { data, error, setError, reload } = useLoad(loadStock, [], 15_000)
  const { busy, run } = useAction(reload, setError)

  const rows = (data?.rows ?? []).filter((r) => r.active && (filter === 'all' || r.low))
  const total = (data?.rows ?? []).filter((r) => r.active).reduce((s, r) => s + Math.max(r.on_hand, 0), 0)

  const submit = async (row: Row, mode: 'receive' | 'count', n: number, reason: 'adjust' | 'loss', note: string) => {
    const ok = await run(`stock:${row.sku_id}`, async () =>
      mode === 'receive'
        ? note
          ? check(await erp.rpc('erp_receive_stock', { p_sku: row.sku_id, p_qty: n, p_note: note }))
          : receiveStock(row.sku_id, n)
        : check(await erp.rpc('erp_adjust_stock', { p_sku: row.sku_id, p_counted: n, p_reason: reason, p_note: note || undefined })),
    )
    if (ok) setOpen(null)
  }

  return (
    <>
      <PageHeader title="재고" sub={`판매 중 SKU 기준 ${total}벌 · 재고 수량은 입출고 기록을 더한 값이에요.`} />
      <ErrorBox message={error} />
      <Tabs
        label="재고 보기"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: '전체' },
          { value: 'low', label: `부족 ${(data?.rows ?? []).filter((r) => r.active && r.low).length}` },
        ]}
      />
      {!data && !error && <Loading />}
      {data && (
        <div className="flex flex-wrap items-start gap-6">
          <Panel className="min-w-0 flex-[3_1_520px]">
            {rows.length === 0 && <Empty>{filter === 'low' ? '부족한 재고가 없어요.' : '사이즈별 재고가 없어요.'}</Empty>}
            {rows.length > 0 && (
              <TableBox>
                <table className={`${TABLE} min-w-[620px]`}>
                  <thead>
                    <tr>
                      <th scope="col" className={TH}>상품</th>
                      <th scope="col" className={TH}>SKU</th>
                      <th scope="col" className={`${TH} text-right`}>재고</th>
                      <th scope="col" className={`${TH} text-right`}>발주점</th>
                      <th scope="col" className={TH}>상태</th>
                      <th scope="col" className={`${TH} text-right`}>처리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.sku_id}>
                        <td className={TD}>
                          <div className="flex flex-col">
                            <span>{r.product_name}</span>
                            {open?.sku === r.sku_id && (
                              <RowForm
                                row={r}
                                mode={open.mode}
                                busy={busy === `stock:${r.sku_id}`}
                                onCancel={() => setOpen(null)}
                                onDone={(n, reason, note) => submit(r, open.mode, n, reason, note)}
                              />
                            )}
                          </div>
                        </td>
                        <td className={`${TD} ${MONO} text-[13px]`}>{r.sku_id}</td>
                        <td className={`${TD} ${MONO} text-right font-semibold ${r.on_hand <= 0 ? 'text-erp-critical' : ''}`}>{r.on_hand}</td>
                        <td className={`${TD} ${MONO} text-right text-erp-muted`}>{r.reorder_point}</td>
                        <td className={TD}>
                          {r.on_hand <= 0 ? <Badge tone="critical">품절</Badge> : r.low ? <Badge tone="caution">부족</Badge> : <Badge tone="ok">정상</Badge>}
                        </td>
                        <td className={`${TD} text-right`}>
                          {open?.sku !== r.sku_id && (
                            <div className="flex justify-end gap-2">
                              <button type="button" onClick={() => setOpen({ sku: r.sku_id, mode: 'receive' })} className={BTN_QUIET} aria-label={`${r.sku_id} 입고`}>
                                입고
                              </button>
                              {manager && (
                                <button type="button" onClick={() => setOpen({ sku: r.sku_id, mode: 'count' })} className={BTN_QUIET} aria-label={`${r.sku_id} 실사`}>
                                  실사
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableBox>
            )}
          </Panel>

          <Panel title="입출고 기록" meta="최근 30건" className="min-w-0 flex-[2_1_320px]">
            {data.moves.length === 0 && <Empty>기록이 없어요.</Empty>}
            <ul className="m-0 list-none p-0">
              {data.moves.map((m) => (
                <li key={m.id} className="flex min-h-[52px] items-center gap-3 border-t border-erp-line px-6 py-1.5">
                  <span className={`w-12 text-xl font-extrabold tracking-[-0.02em] ${m.delta < 0 ? 'text-erp-critical' : ''}`}>{formatDelta(m.delta)}</span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm">
                      {reasonLabel(m.reason)} · {m.product_name}
                      {m.note ? ` · ${m.note}` : ''}
                    </span>
                    <span className={`${MONO} text-xs text-erp-muted`}>
                      {m.sku_id} · {seoulStamp(m.created_at)} · {m.who}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      )}
      {!manager && <p className="m-0 text-xs text-erp-muted">실사로 맞추기(재고 조정·분실)는 매니저 이상만 할 수 있어요.</p>}
    </>
  )
}
