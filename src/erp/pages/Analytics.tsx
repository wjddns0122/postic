import { useState } from 'react'
import { erp } from '../client'
import { check } from '../api'
import { formatWon, rangeDays, seoulDay } from '../model'
import { Empty, ErrorBox, Loading, MONO, PageHeader, Panel, RequireRole, TABLE, TableBox, Tabs, TD, TH, useLoad } from '../ui'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const short = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))} ${WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]}`

async function loadRange(from: string, to: string) {
  const [daily, byProduct, funnel] = await Promise.all([
    erp.rpc('erp_sales_daily', { p_from: from, p_to: to }),
    erp.rpc('erp_sales_by_product', { p_from: from, p_to: to }),
    erp.rpc('erp_product_funnel', { p_from: from, p_to: to }),
  ])
  const sales = new Map((check(byProduct) ?? []).map((r) => [r.product_id, r]))
  const products = (check(funnel) ?? []).map((f) => ({ ...f, revenue: sales.get(f.product_id)?.revenue ?? 0, refunds: sales.get(f.product_id)?.refunds ?? 0 }))
  products.sort((a, b) => b.revenue - a.revenue || b.fitting_requests - a.fitting_requests)
  return { daily: check(daily) ?? [], products }
}

function Body() {
  const [n, setN] = useState<'7' | '30'>('7')
  const { from, to } = rangeDays(Number(n), seoulDay())
  const { data, error } = useLoad(() => loadRange(from, to), [from, to])
  const totals = (data?.daily ?? []).reduce((t, d) => ({ revenue: t.revenue + d.revenue, refunds: t.refunds + d.refunds, net: t.net + d.net, orders: t.orders + d.orders }), { revenue: 0, refunds: 0, net: 0, orders: 0 })
  const top = Math.max(1, ...(data?.daily ?? []).map((d) => d.revenue))

  return (
    <>
      <Tabs label="기간" value={n} onChange={setN} options={[{ value: '7', label: '최근 7일' }, { value: '30', label: '최근 30일' }]} />
      <ErrorBox message={error} />
      {!data && !error && <Loading />}
      {data && (
        <>
          <section aria-label="기간 합계" className="grid grid-cols-2 gap-px border border-erp-line bg-erp-line md:grid-cols-4">
            {[
              ['매출', `${formatWon(totals.revenue)}원`],
              ['환불', `${formatWon(totals.refunds)}원`],
              ['순매출', `${formatWon(totals.net)}원`],
              ['구매', `${totals.orders}건`],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1.5 bg-white p-5">
                <span className="text-[13px] text-erp-muted">{label}</span>
                <span className="text-[28px] leading-[1.1] font-extrabold tracking-[-0.02em]">{value}</span>
              </div>
            ))}
          </section>

          <div className="flex flex-wrap items-start gap-6">
            <Panel title="일별 매출" meta={`${from} ~ ${to}`} className="min-w-0 flex-[2_1_360px]">
              <ul className="m-0 flex list-none flex-col gap-3 px-6 pb-5">
                {[...data.daily].reverse().map((d) => (
                  <li key={d.day} className="flex flex-col gap-1">
                    <div className="flex items-baseline gap-3 text-sm">
                      <span className={`w-16 ${MONO} text-erp-muted`}>{short(d.day)}</span>
                      <span className="flex-1 text-erp-muted">{d.orders ? `구매 ${d.orders}건` : ''}</span>
                      <span className={`${MONO} font-semibold`}>{formatWon(d.revenue)}원</span>
                    </div>
                    <div role="img" aria-label={`${short(d.day)} 매출 ${formatWon(d.revenue)}원`} className="h-2 bg-erp-ground">
                      <div className="h-2 bg-ink" style={{ width: `${(d.revenue / top) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="상품별" meta="조회 → 피팅 → 구매" className="min-w-0 flex-[3_1_520px]">
              {data.products.length === 0 && <Empty>판매 중인 상품이 없어요.</Empty>}
              {data.products.length > 0 && (
                <TableBox>
                  <table className={`${TABLE} min-w-[640px]`}>
                    <thead>
                      <tr>
                        <th scope="col" className={TH}>상품</th>
                        <th scope="col" className={`${TH} text-right`}>조회</th>
                        <th scope="col" className={`${TH} text-right`}>피팅</th>
                        <th scope="col" className={`${TH} text-right`}>구매</th>
                        <th scope="col" className={`${TH} text-right`}>매출</th>
                        <th scope="col" className={`${TH} text-right`}>조회→구매</th>
                        <th scope="col" className={`${TH} text-right`}>피팅→구매</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.products.map((p) => (
                        <tr key={p.product_id}>
                          <td className={TD}>{p.name}</td>
                          <td className={`${TD} ${MONO} text-right`}>{p.views}</td>
                          <td className={`${TD} ${MONO} text-right`}>{p.fitting_requests}</td>
                          <td className={`${TD} ${MONO} text-right`}>{p.purchases}</td>
                          <td className={`${TD} ${MONO} text-right font-semibold`}>{formatWon(p.revenue)}</td>
                          <td className={`${TD} ${MONO} text-right text-erp-muted`}>{p.view_to_purchase == null ? '—' : `${p.view_to_purchase}%`}</td>
                          <td className={`${TD} ${MONO} text-right text-erp-muted`}>{p.fitting_to_purchase == null ? '—' : `${p.fitting_to_purchase}%`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableBox>
              )}
              <p className="m-0 border-t border-erp-line px-6 py-3 text-xs text-erp-muted">조회 수는 손님 화면에 조회 기록(track_event)을 붙인 뒤부터 쌓여요.</p>
            </Panel>
          </div>
        </>
      )}
    </>
  )
}

export default function Analytics() {
  return (
    <>
      <PageHeader title="분석" sub="매출과 상품별 관심(조회·피팅·구매)을 기간으로 봅니다." />
      <RequireRole min="manager">
        <Body />
      </RequireRole>
    </>
  )
}
