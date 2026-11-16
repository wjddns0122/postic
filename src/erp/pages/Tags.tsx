import { useState } from 'react'
import { erp } from '../client'
import { check } from '../api'
import { dayLabel, formatMac, gatewayName, isOnline, roleAtLeast, seoulDay, seoulStamp, shiftDay } from '../model'
import { Badge, BTN_QUIET, Empty, ErrorBox, INPUT, Loading, MONO, PageHeader, Panel, TABLE, TableBox, TD, TH, useLoad, useMe } from '../ui'

type TagRow = { key: string; product: string | null; mac: string | null; rssi: number | null; last_seen: string | null; simulated: boolean; online: boolean }

async function loadLive() {
  const [presence, products, settings, raw] = await Promise.all([
    erp.from('tag_presence').select('key, major, minor, rssi, last_seen, simulated'),
    erp.from('products').select('name, major, minor, mac').not('major', 'is', null),
    erp.from('settings').select('rssi_threshold, online_seconds').eq('id', 1).single(),
    erp.from('gateway_raw').select('received_at, body, count').eq('id', 1).single(),
  ])
  const s = check(settings) ?? { rssi_threshold: -100, online_seconds: 10 }
  const now = Date.now()
  const prods = check(products) ?? []
  const seen = check(presence) ?? []
  const rows: TagRow[] = seen.map((t) => {
    const p = prods.find((x) => x.major === t.major && x.minor === t.minor)
    return { key: t.key, product: p?.name ?? null, mac: p?.mac ?? null, rssi: t.rssi, last_seen: t.last_seen, simulated: t.simulated, online: isOnline(t.last_seen, now, s.online_seconds) }
  })
  // 연결은 됐는데 한 번도 수신되지 않은 태그
  for (const p of prods) {
    const key = `${p.major}-${p.minor}`
    if (p.mac && !rows.some((r) => r.key === key)) rows.push({ key, product: p.name, mac: p.mac, rssi: null, last_seen: null, simulated: false, online: false })
  }
  rows.sort((a, b) => Number(b.online) - Number(a.online) || a.key.localeCompare(b.key))
  const r = check(raw) ?? { received_at: null, body: null, count: 0 }
  return { rows, settings: s, gateway: { name: gatewayName(r.body), last: r.received_at, count: r.count, alive: isOnline(r.received_at, now, 30) } }
}

function Away({ threshold }: { threshold: number }) {
  const today = seoulDay()
  const [day, setDay] = useState(today)
  const [th, setTh] = useState(String(threshold))
  const thNum = Math.max(-100, Math.min(-30, Number(th) || threshold))
  const { data, error } = useLoad(async () => check(await erp.rpc('erp_tag_activity', { p_from: day, p_to: day, p_rssi_threshold: thNum })) ?? [], [day, thNum])

  return (
    <Panel title="자리 비움" meta="게이트가 살아 있던 분 중 태그가 안 잡히거나 약했던 시간">
      <div className="flex flex-wrap items-center gap-3 px-6 pb-4 text-[13px] text-erp-muted">
        <button type="button" aria-label="이전 날" onClick={() => setDay(shiftDay(day, -1))} className={BTN_QUIET}>
          ◀
        </button>
        <span>{dayLabel(day, today)}</span>
        <button type="button" aria-label="다음 날" disabled={day >= today} onClick={() => setDay(shiftDay(day, 1))} className={BTN_QUIET}>
          ▶
        </button>
        <label htmlFor="th" className="ml-4">
          신호 기준 (dBm)
        </label>
        <input id="th" type="number" min={-100} max={-30} value={th} onChange={(e) => setTh(e.target.value)} className={`${INPUT} w-24 ${MONO} text-sm`} />
      </div>
      <ErrorBox message={error} />
      {!data && !error && (
        <div className="px-6 pb-5">
          <Loading />
        </div>
      )}
      {data && data.every((r) => r.gateway_minutes === 0) && <Empty>이날은 게이트 기록이 없어요. (분 단위 기록은 11월 16일부터 쌓여요)</Empty>}
      {data && data.some((r) => r.gateway_minutes > 0) && (
        <TableBox>
          <table className={`${TABLE} min-w-[640px]`}>
            <thead>
              <tr>
                <th scope="col" className={TH}>상품</th>
                <th scope="col" className={`${TH} text-right`}>게이트 가동</th>
                <th scope="col" className={`${TH} text-right`}>감지</th>
                <th scope="col" className={`${TH} text-right`}>자리 비움</th>
                <th scope="col" className={`${TH} text-right`}>횟수</th>
                <th scope="col" className={`${TH} text-right`}>평균 신호</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.product_id}>
                  <td className={TD}>{r.name}</td>
                  <td className={`${TD} ${MONO} text-right`}>{r.gateway_minutes}분</td>
                  <td className={`${TD} ${MONO} text-right`}>{r.seen_minutes}분</td>
                  <td className={`${TD} ${MONO} text-right font-semibold`}>{r.away_minutes}분</td>
                  <td className={`${TD} ${MONO} text-right`}>{r.away_count}회</td>
                  <td className={`${TD} ${MONO} text-right text-erp-muted`}>{r.avg_rssi == null ? '—' : `${r.avg_rssi} dBm`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBox>
      )}
    </Panel>
  )
}

export default function Tags() {
  const me = useMe()
  const { data, error } = useLoad(loadLive, [], 5_000)
  const online = data?.rows.filter((r) => r.online && !r.simulated).length ?? 0
  const tagged = data?.rows.filter((r) => r.mac).length ?? 0

  return (
    <>
      <PageHeader title="태그·게이트" sub="게이트가 1초마다 올리는 신호로 옷이 행거에 있는지 봅니다. 5초마다 갱신돼요." />
      <ErrorBox message={error} />
      {!data && !error && <Loading />}
      {data && (
        <>
          <section aria-label="게이트" className="grid grid-cols-2 gap-px border border-erp-line bg-erp-line md:grid-cols-4">
            {[
              { label: '게이트', value: data.gateway.name ?? '—', note: data.gateway.alive ? '수신 중' : '끊김', tone: data.gateway.alive ? 'signal' : 'critical' },
              { label: '마지막 수신', value: data.gateway.last ? seoulStamp(data.gateway.last) : '—', note: `누적 ${data.gateway.count.toLocaleString('ko-KR')}회` },
              { label: '태그 감지', value: `${online}/${tagged}`, note: `유지 ${data.settings.online_seconds}초 기준` },
              { label: '신호 기준', value: `${data.settings.rssi_threshold} dBm`, note: '설정에서 바꿔요' },
            ].map((c) => (
              <div key={c.label} className="flex flex-col gap-1.5 bg-white p-5">
                <span className="text-[13px] text-erp-muted">{c.label}</span>
                <span className={`${MONO} text-xl font-semibold`}>{c.value}</span>
                {c.tone ? <Badge tone={c.tone as 'signal' | 'critical'}>{c.note}</Badge> : <span className="text-[13px] text-erp-muted">{c.note}</span>}
              </div>
            ))}
          </section>

          <Panel title="태그" meta={`${data.rows.length}개`}>
            {data.rows.length === 0 && <Empty>수신된 태그가 없어요.</Empty>}
            {data.rows.length > 0 && (
              <TableBox>
                <table className={`${TABLE} min-w-[680px]`}>
                  <thead>
                    <tr>
                      <th scope="col" className={TH}>옷</th>
                      <th scope="col" className={TH}>태그</th>
                      <th scope="col" className={TH}>MAC</th>
                      <th scope="col" className={`${TH} text-right`}>신호</th>
                      <th scope="col" className={TH}>마지막 감지</th>
                      <th scope="col" className={TH}>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.key} className={r.online ? '' : 'opacity-60'}>
                        <td className={TD}>{r.product ?? <span className="text-erp-muted">연결 안 됨</span>}</td>
                        <td className={TD}>
                          <span className={`${MONO} border px-2 py-0.5 text-xs font-semibold ${r.online ? 'border-erp-signal' : 'border-dashed border-erp-line'}`}>{r.key}</span>
                        </td>
                        <td className={`${TD} ${MONO} text-[13px]`}>{formatMac(r.mac)}</td>
                        <td className={`${TD} ${MONO} text-right text-[13px]`}>{r.rssi == null ? '—' : `${r.rssi} dBm`}</td>
                        <td className={`${TD} ${MONO} text-[13px] text-erp-muted`}>{r.last_seen ? seoulStamp(r.last_seen) : '수신 기록 없음'}</td>
                        <td className={TD}>
                          {r.simulated ? <Badge tone="caution">시뮬레이션</Badge> : r.online ? <Badge tone="signal">감지됨</Badge> : <Badge tone="muted">감지 안 됨</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableBox>
            )}
          </Panel>

          {roleAtLeast(me.role, 'manager') ? <Away threshold={data.settings.rssi_threshold} /> : <p className="m-0 text-xs text-erp-muted">자리 비움 분석은 매니저 이상만 볼 수 있어요.</p>}
        </>
      )}
    </>
  )
}
