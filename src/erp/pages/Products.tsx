import { useEffect, useState, type FormEvent } from 'react'
import { erp } from '../client'
import { check } from '../api'
import { formatMac, formatWon, roleAtLeast } from '../model'
import { Badge, BTN_LINE, BTN_PRIMARY, BTN_QUIET, BTN_TEXT, Empty, ErrorBox, INPUT, Loading, MONO, PageHeader, Panel, TABLE, TableBox, Tabs, TD, TH, useAction, useLoad, useMe, type Tone } from '../ui'

type Status = 'active' | 'hidden' | 'archived'
type Product = {
  id: string
  name: string
  brand: string
  price: number
  color: string | null
  material: string | null
  category: string | null
  status: Status
  image_url: string | null
  hanger: string
  mac: string | null
  major: number | null
  minor: number | null
}
type Sku = { sku_id: string; product_id: string; size: string; on_hand: number; reorder_point: number; active: boolean; sort: number; low: boolean; cost: number | null }

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  active: { label: '판매 중', tone: 'ok' },
  hidden: { label: '숨김', tone: 'caution' },
  archived: { label: '보관', tone: 'muted' },
}

async function loadAll() {
  const [p, s, c] = await Promise.all([
    erp.from('products').select('id, name, brand, price, color, material, category, status, image_url, hanger, mac, major, minor').order('sort'),
    erp.from('erp_stock_view').select('sku_id, product_id, size, on_hand, reorder_point, active, sort, low').order('sort'),
    erp.from('sku_costs').select('sku_id, cost'), // manager 이상만 행이 온다
  ])
  const costs = new Map((check(c) ?? []).map((r) => [r.sku_id, r.cost]))
  const skus = (check(s) ?? []).map((r) => ({ ...r, cost: costs.get(r.sku_id!) ?? null }) as Sku)
  return { products: (check(p) ?? []) as Product[], skus }
}

function SkuRow({ s, canEdit, busy, onSave }: { s: Sku; canEdit: boolean; busy: boolean; onSave: (v: { reorder: number; active: boolean; cost: number | null }) => void }) {
  const [reorder, setReorder] = useState(String(s.reorder_point))
  const [active, setActive] = useState(s.active)
  const [cost, setCost] = useState(s.cost == null ? '' : String(s.cost))
  const changed = reorder !== String(s.reorder_point) || active !== s.active || cost !== (s.cost == null ? '' : String(s.cost))
  return (
    <tr>
      <td className={`${TD} ${MONO} font-semibold`}>{s.size}</td>
      <td className={`${TD} ${MONO} text-right ${s.on_hand <= 0 ? 'text-erp-critical' : ''}`}>{s.on_hand}</td>
      <td className={TD}>
        <input aria-label={`${s.size} 발주점`} type="number" min={0} value={reorder} disabled={!canEdit} onChange={(e) => setReorder(e.target.value)} className={`${INPUT} w-20 ${MONO} text-sm`} />
      </td>
      <td className={TD}>
        <input aria-label={`${s.size} 원가`} type="number" min={0} placeholder="원가" value={cost} disabled={!canEdit} onChange={(e) => setCost(e.target.value)} className={`${INPUT} w-28 ${MONO} text-sm`} />
      </td>
      <td className={TD}>
        <label className="inline-flex h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={active} disabled={!canEdit} onChange={(e) => setActive(e.target.checked)} />
          판매
        </label>
      </td>
      <td className={`${TD} text-right`}>
        {canEdit && (
          <button type="button" disabled={!changed || busy} onClick={() => onSave({ reorder: Number(reorder), active, cost: cost === '' ? null : Number(cost) })} className={BTN_LINE}>
            {busy ? '저장 중…' : '저장'}
          </button>
        )}
      </td>
    </tr>
  )
}

function Detail({ p, skus, canEdit, busy, run }: { p: Product; skus: Sku[]; canEdit: boolean; busy: string | null; run: (key: string, fn: () => Promise<unknown>) => Promise<boolean> }) {
  const [form, setForm] = useState(p)
  const [size, setSize] = useState('')
  const [mac, setMac] = useState('')
  useEffect(() => setForm(p), [p])
  const set = (k: keyof Product) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value })

  const save = (e: FormEvent) => {
    e.preventDefault()
    run(`save:${p.id}`, async () =>
      check(
        await erp.rpc('erp_save_product', {
          p: { id: p.id, name: form.name, brand: form.brand, price: Number(form.price), color: form.color, material: form.material, category: form.category, status: form.status },
        }),
      ),
    )
  }

  return (
    <aside aria-label="선택한 상품" className="flex min-w-0 flex-[2_1_380px] flex-col border border-erp-line bg-white">
      <div className="flex gap-4 border-b border-erp-line p-5">
        {p.image_url ? <img src={p.image_url} alt="" className="h-32 w-24 shrink-0 bg-erp-ground object-cover" /> : <div className="h-32 w-24 shrink-0 bg-erp-ground" />}
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-erp-muted">{p.brand}</span>
          <span className="text-xl font-extrabold tracking-[-0.02em]">{p.name}</span>
          <span className={`${MONO} text-xs text-erp-muted`}>
            {p.id} · {p.hanger}
          </span>
          <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
        </div>
      </div>

      <form onSubmit={save} className="grid grid-cols-2 gap-3 border-b border-erp-line p-5">
        <h2 className="col-span-2 m-0 text-[17px] font-extrabold">정보</h2>
        {(
          [
            ['name', '이름'],
            ['brand', '브랜드'],
            ['price', '판매가'],
            ['color', '색'],
            ['material', '소재'],
            ['category', '분류'],
          ] as const
        ).map(([k, label]) => (
          <div key={k} className="flex flex-col gap-1">
            <label htmlFor={`f-${k}`} className="text-xs font-medium text-erp-muted">
              {label}
            </label>
            <input id={`f-${k}`} type={k === 'price' ? 'number' : 'text'} value={form[k] ?? ''} disabled={!canEdit} onChange={set(k)} className={`${INPUT} ${k === 'price' ? MONO : ''}`} />
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <label htmlFor="f-status" className="text-xs font-medium text-erp-muted">
            판매 상태
          </label>
          <select id="f-status" value={form.status} disabled={!canEdit} onChange={set('status')} className={INPUT}>
            <option value="active">판매 중 (손님에게 보임)</option>
            <option value="hidden">숨김</option>
            <option value="archived">보관</option>
          </select>
        </div>
        {canEdit && (
          <div className="col-span-2 flex justify-end">
            <button type="submit" disabled={busy === `save:${p.id}`} className={BTN_PRIMARY}>
              {busy === `save:${p.id}` ? '저장 중…' : '정보 저장'}
            </button>
          </div>
        )}
      </form>

      <div className="flex flex-col gap-3 border-b border-erp-line p-5">
        <h2 className="m-0 text-[17px] font-extrabold">사이즈 · 재고</h2>
        <TableBox>
          <table className={`${TABLE} min-w-[460px]`}>
            <thead>
              <tr>
                <th scope="col" className={TH}>사이즈</th>
                <th scope="col" className={`${TH} text-right`}>재고</th>
                <th scope="col" className={TH}>발주점</th>
                <th scope="col" className={TH}>원가</th>
                <th scope="col" className={TH}>판매</th>
                <th scope="col" className={TH}><span className="sr-only">저장</span></th>
              </tr>
            </thead>
            <tbody>
              {skus.map((s) => (
                <SkuRow
                  key={s.sku_id}
                  s={s}
                  canEdit={canEdit}
                  busy={busy === `sku:${s.sku_id}`}
                  onSave={(v) =>
                    run(`sku:${s.sku_id}`, async () =>
                      check(await erp.rpc('erp_save_sku', { p_product: p.id, p_size: s.size, p_cost: v.cost ?? undefined, p_reorder_point: v.reorder, p_active: v.active })),
                    )
                  }
                />
              ))}
            </tbody>
          </table>
        </TableBox>
        {skus.length === 0 && <p className="m-0 text-sm text-erp-muted">사이즈가 없어요. 사이즈를 추가해야 재고를 관리할 수 있어요.</p>}
        <p className="m-0 text-xs text-erp-muted">재고 수량은 재고 메뉴에서 입고·실사로 바꿔요. 원가는 매니저 이상만 보여요.</p>
        {canEdit && (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (size.trim() && (await run(`addsku:${p.id}`, async () => check(await erp.rpc('erp_save_sku', { p_product: p.id, p_size: size.trim() }))))) setSize('')
            }}
            className="flex items-center gap-2"
          >
            <label htmlFor="new-size" className="text-xs text-erp-muted">
              새 사이즈
            </label>
            <input id="new-size" value={size} maxLength={10} onChange={(e) => setSize(e.target.value)} placeholder="예: XXL" className={`${INPUT} w-24 ${MONO}`} />
            <button type="submit" className={BTN_QUIET} disabled={busy === `addsku:${p.id}`}>
              추가
            </button>
          </form>
        )}
      </div>

      <div className="flex flex-col gap-3 p-5">
        <h2 className="m-0 text-[17px] font-extrabold">태그</h2>
        {p.mac ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className={`${MONO} border border-erp-signal px-2 py-0.5 text-[13px] font-semibold`}>
              {p.major}-{p.minor}
            </span>
            <span className={`${MONO} text-[13px]`}>{formatMac(p.mac)}</span>
            {canEdit && (
              <button type="button" onClick={() => run(`tag:${p.id}`, async () => check(await erp.rpc('erp_link_tag', { p_product: p.id, p_mac: null as unknown as string })))} className={BTN_TEXT}>
                연결 해제
              </button>
            )}
          </div>
        ) : (
          <p className="m-0 text-sm text-erp-muted">연결된 비콘이 없어요.</p>
        )}
        {canEdit && (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              if (mac.trim() && (await run(`tag:${p.id}`, async () => check(await erp.rpc('erp_link_tag', { p_product: p.id, p_mac: mac.trim() }))))) setMac('')
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <label htmlFor="new-mac" className="text-xs text-erp-muted">
              비콘 MAC
            </label>
            <input id="new-mac" value={mac} onChange={(e) => setMac(e.target.value)} placeholder="78:9F:38:0F:F5:AF" className={`${INPUT} w-48 ${MONO} text-sm`} />
            <button type="submit" className={BTN_QUIET} disabled={busy === `tag:${p.id}`}>
              {p.mac ? '바꾸기' : '연결'}
            </button>
          </form>
        )}
      </div>
    </aside>
  )
}

export default function Products() {
  const me = useMe()
  const canEdit = roleAtLeast(me.role, 'manager')
  const [tab, setTab] = useState<'all' | Status>('all')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const { data, error, setError, reload } = useLoad(loadAll, [])
  const { busy, run } = useAction(reload, setError)

  const products = data?.products ?? []
  const count = (s: Status) => products.filter((p) => p.status === s).length
  const list = products.filter((p) => (tab === 'all' || p.status === tab) && `${p.name} ${p.brand} ${p.id}`.toLowerCase().includes(q.trim().toLowerCase()))
  const current = products.find((p) => p.id === (selected ?? list[0]?.id))
  const skusOf = (id: string) => (data?.skus ?? []).filter((s) => s.product_id === id)

  const create = async (e: FormEvent) => {
    e.preventDefault()
    let createdId: string | null = null
    const ok = await run('create', async () => {
      const p = check(await erp.rpc('erp_save_product', { p: { name: newName, price: Number(newPrice) } })) as unknown as Product
      createdId = p.id
    })
    if (ok && createdId) {
      setCreating(false)
      setNewName('')
      setNewPrice('')
      setTab('all')
      setSelected(createdId)
    }
  }

  return (
    <>
      <PageHeader
        title="상품"
        sub={`${products.length}개 · 새 상품은 '숨김'으로 만들어지고, 판매 중으로 바꾸면 손님에게 보여요.`}
        actions={
          canEdit && (
            <button type="button" onClick={() => setCreating((v) => !v)} className={BTN_PRIMARY}>
              상품 등록
            </button>
          )
        }
      />
      <ErrorBox message={error} />
      {creating && (
        <form onSubmit={create} className="flex flex-wrap items-end gap-3 border border-erp-line bg-white p-5">
          <div className="flex flex-col gap-1">
            <label htmlFor="c-name" className="text-xs font-medium text-erp-muted">
              이름
            </label>
            <input id="c-name" required value={newName} onChange={(e) => setNewName(e.target.value)} className={`${INPUT} w-64`} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="c-price" className="text-xs font-medium text-erp-muted">
              판매가
            </label>
            <input id="c-price" required type="number" min={0} value={newPrice} onChange={(e) => setNewPrice(e.target.value)} className={`${INPUT} w-36 ${MONO}`} />
          </div>
          <button type="submit" disabled={busy === 'create'} className={BTN_PRIMARY}>
            {busy === 'create' ? '만드는 중…' : '만들기'}
          </button>
          <button type="button" onClick={() => setCreating(false)} className={BTN_TEXT}>
            닫기
          </button>
        </form>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <Tabs
          label="판매 상태"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: `전체 ${products.length}` },
            { value: 'active', label: `판매 중 ${count('active')}` },
            { value: 'hidden', label: `숨김 ${count('hidden')}` },
            { value: 'archived', label: `보관 ${count('archived')}` },
          ]}
        />
        <div className="flex items-center gap-2">
          <label htmlFor="p-q" className="text-xs text-erp-muted">
            검색
          </label>
          <input id="p-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름, 브랜드, ID" className={`${INPUT} w-56`} />
        </div>
      </div>

      {!data && !error && <Loading />}
      {data && (
        <div className="flex flex-wrap items-start gap-6">
          <Panel className="min-w-0 flex-[3_1_520px]">
            {list.length === 0 && <Empty>조건에 맞는 상품이 없어요.</Empty>}
            {list.length > 0 && (
              <TableBox>
                <table className={`${TABLE} min-w-[620px]`}>
                  <thead>
                    <tr>
                      <th scope="col" className={TH}>상품</th>
                      <th scope="col" className={TH}>태그</th>
                      <th scope="col" className={TH}>사이즈별 재고</th>
                      <th scope="col" className={`${TH} text-right`}>판매가</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p) => {
                      const sel = p.id === current?.id
                      const skus = skusOf(p.id)
                      return (
                        <tr key={p.id} className={sel ? 'bg-erp-ground outline-2 -outline-offset-2 outline-erp-signal' : ''}>
                          <td className={TD}>
                            <button type="button" onClick={() => setSelected(p.id)} className="flex items-center gap-3 text-left" aria-pressed={sel}>
                              {p.image_url ? <img src={p.image_url} alt="" className="h-14 w-[42px] shrink-0 bg-erp-ground object-cover" /> : <span className="h-14 w-[42px] shrink-0 bg-erp-ground" />}
                              <span className="flex min-w-0 flex-col">
                                <span className="font-semibold">{p.name}</span>
                                <span className="text-xs text-erp-muted">{p.brand}</span>
                                <Badge tone={STATUS[p.status].tone}>{STATUS[p.status].label}</Badge>
                              </span>
                            </button>
                          </td>
                          <td className={`${TD} ${MONO} text-xs`}>{p.mac ? `${p.major}-${p.minor}` : <span className="text-erp-muted">없음</span>}</td>
                          <td className={TD}>
                            <div className={`flex flex-wrap gap-1 ${MONO} text-[13px]`}>
                              {skus.map((s) => (
                                <span key={s.sku_id} className={`border border-erp-line px-1.5 ${s.on_hand <= 0 ? 'font-semibold text-erp-critical' : ''} ${s.active ? '' : 'line-through opacity-50'}`}>
                                  {s.size} {s.on_hand}
                                </span>
                              ))}
                              {skus.length === 0 && <span className="text-erp-muted">—</span>}
                            </div>
                          </td>
                          <td className={`${TD} ${MONO} text-right`}>{formatWon(p.price)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TableBox>
            )}
          </Panel>
          {current && <Detail key={current.id} p={current} skus={skusOf(current.id)} canEdit={canEdit} busy={busy} run={run} />}
        </div>
      )}
      {!canEdit && <p className="m-0 text-xs text-erp-muted">상품 정보 수정은 매니저 이상만 할 수 있어요.</p>}
    </>
  )
}
