import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  forgetStaffPin,
  IBEACON_UUID,
  INGEST_URL,
  staffLogin,
  staffPin,
  staffSetStatus,
  staffUpdateSettings,
  supabase,
  type Order,
} from '../lib'
import { useLive } from '../live'
import { Button, Card, InfoRow, LivePill, SimBadge } from '../ui'
import { CardHeader, Checkbox, Img, KpiCard, SliderRow, Toggle, ago, dbm } from '../components/admin/parts'
import { OrderCard, OrderTable, TagCard, TagTable, type OrderView, type TagView } from '../components/admin/tables'

import dotOk from '../assets/figma/dot-ok-a4afb.svg'
import iconBell from '../assets/figma/icon-bell-55887.svg'
import iconBag20 from '../assets/figma/icon-bag-20-1aff5.svg'
import iconRadio20 from '../assets/figma/icon-radio-20-02153.svg'
import iconTag from '../assets/figma/icon-tag-bc8ce.svg'
import iconBag from '../assets/figma/icon-bag-b6817.svg'
import iconRadio from '../assets/figma/icon-radio-bbdcb.svg'
import iconCopy from '../assets/figma/icon-copy-f24aa.svg'
import iconRefresh from '../assets/figma/icon-refresh-11258.svg'

type Raw = { received_at: string | null; body: string | null; count: number }
const NEXT: Record<Order['status'], Order['status'] | null> = { preparing: 'ready', ready: 'done', done: null }
/** 직원 화면용 짧은 상태 이름 (Figma 기준) */
const SHORT: Record<Order['type'], Record<Order['status'], string>> = {
  purchase: { preparing: '준비 중', ready: '픽업 대기', done: '완료' },
  fitting: { preparing: '준비 중', ready: '준비 완료', done: '완료' },
}
const GATEWAY = 'G1-6F84'

export default function Admin() {
  const { products, orders, settings, seen, isOnline, online, now, mergeOrder, applySettings } = useLive()
  const [raw, setRaw] = useState<Raw | null>(null)
  const [sim, setSim] = useState(false)
  const [simOff, setSimOff] = useState<Set<string>>(new Set())
  const simOffRef = useRef(simOff)
  simOffRef.current = simOff
  const [staff, setStaff] = useState<'checking' | 'in' | 'out'>(staffPin() ? 'checking' : 'out')

  // 저장된 직원 PIN이 아직 유효한지 확인
  useEffect(() => {
    if (staff === 'checking') staffLogin(staffPin()).then((ok) => setStaff(ok ? 'in' : 'out'))
  }, [staff])

  // 게이트웨이 원본(2초 조회)과 모든 주문 변경(Broadcast staff:orders)
  useEffect(() => {
    const loadRaw = () =>
      supabase.from('gateway_raw').select('*').eq('id', 1).single().then(({ data }) => data && setRaw(data))
    loadRaw()
    const t = setInterval(() => document.visibilityState === 'visible' && loadRaw(), 2000)
    const ch = supabase
      .channel('staff:orders')
      .on('broadcast', { event: 'order' }, ({ payload }) => mergeOrder(payload as Order))
      .subscribe()
    return () => {
      clearInterval(t)
      supabase.removeChannel(ch)
    }
  }, [])

  // 시뮬레이터: G1과 같은 JSON-LONG 형식으로 1초마다 수신 함수에 POST
  useEffect(() => {
    if (!sim) return
    const t = setInterval(() => {
      const body = [
        { type: 'Gateway', mac: 'SIMULATOR' },
        ...products
          .filter((p) => !simOffRef.current.has(p.id))
          .map((p) => ({
            type: 'iBeacon',
            mac: `SIM${p.major}${p.minor}`,
            ibeaconUuid: IBEACON_UUID,
            ibeaconMajor: p.major,
            ibeaconMinor: p.minor,
            rssi: Math.round(-52 - Math.random() * 18),
            gateway: 'SIM-GW',
            simulated: true,
          })),
      ]
      fetch(INGEST_URL, { method: 'POST', body: JSON.stringify(body) })
    }, 1000)
    return () => clearInterval(t)
  }, [sim, products])

  // 쓰기는 직원 PIN을 확인하는 서버 함수로만. PIN이 바뀌었으면 다시 PIN 화면으로
  const onStaffError = (error: { message: string } | null) => {
    if (error?.message === 'invalid_pin') {
      forgetStaffPin()
      setStaff('out')
    } else if (error) alert('저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
    return !error
  }
  const setThreshold = (v: number) =>
    staffUpdateSettings({ rssi_threshold: v }).then(({ data, error }) => onStaffError(error) && applySettings(data))
  const setOnlineSec = (v: number) =>
    staffUpdateSettings({ online_seconds: v }).then(({ data, error }) => onStaffError(error) && applySettings(data))
  const advance = (o: Order) => {
    const next = NEXT[o.status]
    if (next) staffSetStatus(o.id, next).then(({ data, error }) => onStaffError(error) && mergeOrder(data))
  }
  const toggleSimTag = (id: string) => {
    const n = new Set(simOff)
    n.has(id) ? n.delete(id) : n.add(id)
    setSimOff(n)
  }

  // KPI
  const offline = products.filter((p) => !isOnline(p))
  const all = products.length > 0 && online.length === products.length
  const pending = orders.filter((o) => o.status !== 'done').length
  const preparing = orders.filter((o) => o.status === 'preparing').length
  const ready = orders.filter((o) => o.status === 'ready').length
  const purchases = orders.filter((o) => o.type === 'purchase').length
  const rawCount = (raw?.count ?? 0).toLocaleString('ko-KR')
  const rawAgo = raw?.received_at ? ago(now, raw.received_at) : null
  const gwLive = !!raw?.received_at && now - Date.parse(raw.received_at) <= settings.online_seconds * 1000

  const tagSub =
    products.length === 0
      ? '등록된 태그 없음'
      : all
        ? `게이트 ${GATEWAY}`
        : `오프라인 ${offline.length} · ${offline
            .slice(0, 2)
            .map((p) => p.id)
            .join(', ')}${offline.length > 2 ? ` 외 ${offline.length - 2}` : ''}`
  const pendingSub = pending ? [preparing && `준비 중 ${preparing}`, ready && `픽업 대기 ${ready}`].filter(Boolean).join(' · ') : '대기 없음'

  const tagRows: TagView[] = products.map((p) => {
    const s = seen(p)
    return { p, on: isOnline(p), rssi: s?.rssiAvg, last: s ? ago(now, s.seenAt) : undefined, simulated: s?.simulated }
  })
  const orderRows: OrderView[] = orders.map((o) => {
    const next = NEXT[o.status]
    return {
      o,
      p: products.find((x) => x.id === o.product_id),
      label: SHORT[o.type][o.status],
      nextLabel: next ? SHORT[o.type][next] : null,
      onNext: () => advance(o),
    }
  })

  let rawPretty = raw?.body ?? ''
  try {
    rawPretty = JSON.stringify(JSON.parse(rawPretty), null, 2)
  } catch {
    /* binary or not json */
  }

  if (staff !== 'in') return <StaffGate checking={staff === 'checking'} onIn={() => setStaff('in')} />

  return (
    <div className="min-h-dvh bg-bg">
      <header className="bg-surface shadow-sm">
        <div className="mx-auto flex w-full max-w-[1440px] items-center gap-3 px-4 py-4 md:px-8 xl:px-10">
          <div className="flex shrink-0 flex-col gap-1">
            <span className="t-heading">POSTIC</span>
            <span className="h-[3px] w-full rounded-full bg-gradient-to-r from-brand to-violet" />
          </div>
          <p className="t-body hidden min-w-0 truncate text-sub md:block">직원 대시보드 · POSTIC 홍대점 3F</p>
          <div className="flex-1" />
          {sim && <SimBadge />}
          <LivePill />
          {gwLive ? (
            <span className="hidden shrink-0 items-center gap-2 rounded-full bg-ok-soft px-3 py-1 md:flex">
              <Img src={dotOk} w={8} />
              <span className="t-meta whitespace-nowrap text-ok-text">게이트 {GATEWAY} 수신 중</span>
            </span>
          ) : (
            <span className="hidden shrink-0 items-center gap-2 rounded-full bg-line px-3 py-1 md:flex">
              <span className="size-2 rounded-full bg-faint" />
              <span className="t-meta whitespace-nowrap text-sub">게이트 수신 없음</span>
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 pt-6 pb-10 md:px-8 xl:px-10">
        {sim && (
          <div className="flex w-full items-center gap-3 rounded-2xl bg-caution-soft p-4">
            <SimBadge />
            <p className="t-body min-w-0 flex-1 text-caution-text">시뮬레이터가 켜져 있어요. “SIM” 표시가 있는 태그는 실제 비콘 신호가 아닙니다.</p>
          </div>
        )}

        {/* KPI: 모바일은 가로 스크롤, 태블릿부터 4열 */}
        <div className="no-scrollbar -mx-4 -mt-1 -mb-6 flex items-start gap-3 overflow-x-auto px-4 pt-1 pb-6 md:mx-0 md:mt-0 md:mb-0 md:grid md:grid-cols-4 md:gap-6 md:overflow-visible md:px-0 md:pt-0 md:pb-0">
          <KpiCard label="태그 온라인" value={`${online.length}/${products.length}`} sub={tagSub} ratio={products.length ? online.length / products.length : 0} />
          <KpiCard label="처리 대기 주문" value={pending} sub={pendingSub} icon={iconBell} />
          <KpiCard label="오늘 주문" value={orders.length} sub={`구매 ${purchases} · 피팅 ${orders.length - purchases}`} icon={iconBag20} />
          <KpiCard label="게이트 수신 횟수" value={rawCount} sub={rawAgo ? `${rawAgo} 수신` : '수신 없음'} icon={iconRadio20} />
        </div>

        <Card className="flex w-full flex-col gap-4 overflow-clip p-4 md:p-6">
          <CardHeader icon={iconTag} title="태그 상태" meta={`온라인 ${online.length}/${products.length} · 1초 주기`} />
          <div className="hidden md:block">
            <TagTable rows={tagRows} />
          </div>
          <div className="flex flex-col gap-3 md:hidden">
            {tagRows.map((r) => (
              <TagCard key={r.p.id} {...r} />
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[880fr_456fr]">
          <div className="flex min-w-0 flex-col gap-6">
            <Card className="flex w-full flex-col gap-4 overflow-clip p-4 md:p-6">
              <CardHeader icon={iconBag} title="주문 · 피팅 요청" meta={`오늘 ${orders.length}건`} />
              {orders.length === 0 ? (
                <p className="t-body py-6 text-center text-faint">아직 요청이 없습니다</p>
              ) : (
                <>
                  <div className="hidden md:block">
                    <OrderTable rows={orderRows} />
                  </div>
                  <div className="flex flex-col gap-3 md:hidden">
                    {orderRows.map((r) => (
                      <OrderCard key={r.o.id} {...r} />
                    ))}
                  </div>
                </>
              )}
            </Card>

            <Card className="flex w-full flex-col gap-4 overflow-clip p-4 md:p-6">
              <CardHeader icon={iconRadio} title="G1 설정값" meta="Minew G1 · Wi-Fi → 핫스팟" />
              <div className="flex w-full flex-col gap-3 rounded-2xl bg-bg px-4 py-3 md:flex-row md:items-center">
                <p className="t-body min-w-0 flex-1 break-all">{INGEST_URL}</p>
                <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(INGEST_URL)} className="w-full shrink-0 md:h-9! md:w-24">
                  URL 복사
                </Button>
              </div>
              <div className="flex w-full flex-col">
                <InfoRow label="G1 웹 설정" value="192.168.99.1 → Service → HTTP URL" />
                <InfoRow label="전송 방식" value="HTTPS POST · JSON-PREPARSED" />
                <InfoRow label="전송 주기" value="1초" />
                <InfoRow label="게이트" value={`g1-e-grapes · ${GATEWAY}`} />
                <InfoRow label="비콘 UUID" value={<span className="text-xs md:text-[15px]">{IBEACON_UUID}</span>} divider={false} />
              </div>
            </Card>

            <Card className="flex w-full flex-col gap-4 overflow-clip p-4 md:p-6">
              <CardHeader icon={iconCopy} title="마지막 게이트 원본 데이터" meta={rawAgo ? `수신 ${rawCount}회 · ${rawAgo}` : '수신 없음'} />
              <pre className="t-meta max-h-64 w-full overflow-auto rounded-2xl bg-ink p-4 font-sans whitespace-pre text-brand-soft">{rawPretty || '아직 수신 없음'}</pre>
            </Card>
          </div>

          <div className="grid min-w-0 grid-cols-1 items-start gap-6 md:grid-cols-2 xl:grid-cols-1">
            <Card className="flex w-full flex-col gap-4 overflow-clip p-4 md:p-6">
              <CardHeader icon={iconRadio} title="인식 기준" />
              <SliderRow
                label="RSSI 임계값"
                valueLabel={dbm(settings.rssi_threshold)}
                min={-100}
                max={-40}
                value={settings.rssi_threshold}
                onChange={setThreshold}
              />
              <SliderRow
                label="온라인 유지 시간"
                valueLabel={`${settings.online_seconds}초`}
                min={2}
                max={60}
                value={settings.online_seconds}
                onChange={setOnlineSec}
              />
              <p className="t-meta text-faint">마지막 수신이 유지 시간 이내이고, RSSI 이동평균이 임계값 이상이면 “인식됨”으로 판정해요.</p>
            </Card>

            <Card className="flex w-full flex-col gap-4 overflow-clip p-4 md:p-6">
              <CardHeader icon={iconRefresh} title="시뮬레이터" />
              <button
                type="button"
                role="switch"
                aria-checked={sim}
                onClick={() => setSim(!sim)}
                className="flex w-full items-center rounded-2xl bg-bg px-4 py-3 text-left"
              >
                <span className="t-body-strong">{sim ? '시뮬레이터 켜짐' : '시뮬레이터 꺼짐'}</span>
                <div className="flex-1" />
                <Toggle on={sim} />
              </button>
              <p className="t-meta text-sub">장비 장애 시 사용해요. 켜면 손님·직원 화면 모두에 “시뮬레이션” 배지가 표시돼요.</p>
              {products.map((p) => (
                <Checkbox key={p.id} checked={!simOff.has(p.id)} onChange={() => toggleSimTag(p.id)} label={`${p.id} · ${p.name}`} />
              ))}
            </Card>
          </div>
        </div>

        <Link to="/" className="t-meta self-center text-faint underline">
          손님 화면 →
        </Link>
      </main>
    </div>
  )
}

/** 직원 PIN 입력: 맞으면 이 브라우저에 저장해서 다음부터는 바로 들어온다 */
function StaffGate({ checking, onIn }: { checking: boolean; onIn: () => void }) {
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [wrong, setWrong] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const ok = await staffLogin(pin.trim())
    setBusy(false)
    if (ok) onIn()
    else setWrong(true)
  }
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-5">
      <Card className="flex w-full max-w-[400px] flex-col gap-5 p-6">
        <div className="flex flex-col gap-1">
          <span className="t-heading">직원 대시보드</span>
          <span className="t-body text-sub">{checking ? '직원 PIN 확인 중…' : '직원 PIN을 입력해 주세요'}</span>
        </div>
        {!checking && (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <input
              value={pin}
              onChange={(e) => {
                setPin(e.target.value)
                setWrong(false)
              }}
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              placeholder="PIN"
              aria-label="직원 PIN"
              className={`t-heading h-[52px] rounded-2xl border bg-surface px-4 tracking-[0.3em] outline-none focus:border-brand ${
                wrong ? 'border-critical' : 'border-line'
              }`}
            />
            {wrong && <span className="t-meta text-critical">PIN이 맞지 않아요</span>}
            <Button type="submit" loading={busy} disabled={!pin.trim()}>
              확인
            </Button>
          </form>
        )}
        <Link to="/" className="t-meta text-center text-faint underline">
          손님 화면으로
        </Link>
      </Card>
    </div>
  )
}
