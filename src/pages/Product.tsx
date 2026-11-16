import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createOrder, sizeList, won, type Product } from '../lib'
import { useLive } from '../live'
import { ProductHero } from '../components/Model3D'
import { BackBar, Button, Card, distanceLabel, InfoRow, Screen, SectionHeader, Thumb } from '../ui'

import iconTag from '../assets/figma/icon-tag-99d18.svg'
import colorDotBlack from '../assets/figma/color-dot-bd8bf.svg'
import iconCheck from '../assets/figma/icon-check-0317c.svg'
import iconBell from '../assets/figma/icon-bell-868f2.svg'
import iconSpinner from '../assets/figma/icon-spinner-06709.svg'

const METHODS = ['POSTIC Pay · 카드', '카카오페이', '토스페이']
const GLYPH: Record<string, string> = { 'POSTIC Pay · 카드': 'P', 카카오페이: '카', 토스페이: '토' }

/** 모바일 하단 고정 CTA: Figma pb 32, 홈 인디케이터가 있으면 safe-area만큼 더 띄움 */
const CTA_PB = 'pb-[max(32px,calc(env(safe-area-inset-bottom)_+_16px))]'
const CTA_SPACER = 'h-[max(100px,calc(env(safe-area-inset-bottom)_+_84px))]'

export default function ProductPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { products, seen, isOnline, mergeOrder } = useLive()
  const p = products.find((x) => x.id === id)
  const firstInStock = p ? sizeList(p).find(([, n]) => n > 0)?.[0] : undefined
  const [size, setSize] = useState<string | undefined>()
  const [sheet, setSheet] = useState(false)
  const [method, setMethod] = useState(METHODS[0])
  const [paying, setPaying] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!p)
    return (
      <Screen>
        <BackBar title="상품 상세" />
      </Screen>
    )
  const sz = size ?? firstInStock
  const s = seen(p)
  const on = isOnline(p)

  const fitting = async () => {
    setBusy(true)
    try {
      const o = await createOrder({ product_id: p.id, size: sz!, type: 'fitting' })
      mergeOrder(o)
      nav(`/order/${o.id}`)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const pay = async () => {
    if (paying) return
    setPaying(true)
    await new Promise((r) => setTimeout(r, 1500)) // 목 결제 승인 대기
    try {
      const o = await createOrder({ product_id: p.id, size: sz!, type: 'purchase', pay_method: method })
      mergeOrder(o)
      nav(`/order/${o.id}`)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setPaying(false)
    }
  }

  return (
    <Screen className="md:gap-6 md:pt-6 md:pb-8">
      <BackBar title="상품 상세" />

      <div className="flex w-full flex-col gap-4 md:flex-row md:items-start md:gap-6">
        {/* column A: hero */}
        <div className="relative w-full overflow-hidden rounded-3xl md:min-w-[300px] md:flex-1">
          <ProductHero p={p} className="h-[280px] w-full md:h-[360px] lg:h-[440px]" />
          <span className="pointer-events-none absolute top-4 left-4 flex items-center gap-1 rounded-lg bg-brand-soft px-2 py-1">
            <img src={iconTag} alt="" width={12} height={12} className="block shrink-0" style={{ width: 12, height: 12 }} />
            <span className="t-meta whitespace-nowrap text-brand">
              {p.id} · {on ? '인식됨' : '감지 안 됨'}
            </span>
          </span>
          <span className="t-body-strong pointer-events-none absolute bottom-4 left-4 rounded-full bg-ink px-4 py-2 whitespace-nowrap text-white">{won(p.price)}</span>
        </div>

        {/* column B: 정보 + CTA */}
        <div className="flex w-full min-w-0 flex-col gap-4 md:min-w-[300px] md:flex-1 md:gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="t-title break-keep">{p.name}</h2>
            <div className="flex items-center gap-2">
              <ColorDot color={p.color} />
              <span className="t-meta text-sub">{[p.color, p.brand].filter(Boolean).join(' · ')}</span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <SectionHeader title="사이즈" meta="재고 실시간" />
            <div className="flex w-full gap-2">
              {sizeList(p).map(([k, n]) => (
                <SizeChip key={k} size={k} stock={n} selected={sz === k} onSelect={() => setSize(k)} />
              ))}
            </div>
          </div>

          <Card className="px-4 py-2">
            <InfoRow label="태그 ID" value={p.id} />
            <InfoRow label="소재" value={p.material ?? "—"} />
            <InfoRow label="추정 위치" value={`디스플레이 존 ${p.zone} · ${on ? distanceLabel(s?.rssiAvg) : '감지 안 됨'}`} />
            <InfoRow label="수신 게이트" value={s?.gateway ?? '-'} />
            <InfoRow
              label="피팅룸"
              value={
                <Link to="/fitting" className="text-brand">
                  FR-03 배정 예정 ›
                </Link>
              }
              divider={false}
            />
          </Card>

          {/* 모바일: 하단 고정 바 / md 이상: 정보 칼럼 안의 CTA 행 */}
          <div
            className={`fixed inset-x-0 bottom-0 z-10 flex items-center gap-3 bg-surface px-5 pt-4 shadow-md ${CTA_PB} md:static md:z-auto md:bg-transparent md:p-0 md:shadow-none`}
          >
            <Button variant="secondary" onClick={fitting} loading={busy} disabled={!sz} className="w-[128px] shrink-0 md:w-auto md:min-w-0 md:flex-1">
              피팅하기
            </Button>
            <Button onClick={() => setSheet(true)} disabled={!sz} className="min-w-0 flex-1">
              구매하기
            </Button>
          </div>

          <p className="t-meta text-center text-faint">피팅은 직원이 FR-03에 준비해 드리고, 구매하시면 픽업 데스크에서 전달해 드립니다.</p>
        </div>
      </div>

      {/* 고정 CTA 바에 가려지지 않도록 모바일에서만 자리 확보 */}
      <div aria-hidden className={`${CTA_SPACER} shrink-0 md:hidden`} />

      {sheet && (
        <BottomSheet onClose={() => !paying && setSheet(false)}>
          <h2 className="t-heading">결제하기</h2>

          <div className="flex w-full items-center gap-3 rounded-2xl bg-bg p-4">
            <Thumb p={p} className="size-12" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="t-body truncate text-sub">
                {p.name} · {sz}
              </span>
              <span className="t-meta truncate text-faint">{p.brand}</span>
            </div>
            <span className="t-title shrink-0 whitespace-nowrap">{won(p.price)}</span>
          </div>

          <div role="radiogroup" aria-label="결제 수단" className={`flex w-full flex-col gap-2 ${paying ? 'pointer-events-none opacity-50' : ''}`}>
            {METHODS.map((m) => (
              <PayMethodOption key={m} name={m} glyph={GLYPH[m]} selected={method === m} disabled={paying} onSelect={() => setMethod(m)} />
            ))}
          </div>

          <InfoRow label="수령 방법" value="1F 픽업 데스크" divider={false} />

          <div className="flex w-full items-center justify-center gap-1">
            <img src={iconBell} alt="" width={14} height={14} className="block shrink-0" style={{ width: 14, height: 14 }} />
            <span className="t-meta text-center text-faint">시연용 가상 결제입니다. 실제 결제는 일어나지 않습니다.</span>
          </div>

          <Button onClick={pay} aria-busy={paying} className={`w-full ${paying ? 'pointer-events-none' : ''}`}>
            {paying && <img src={iconSpinner} alt="" width={20} height={20} className="spin block shrink-0" style={{ width: 20, height: 20 }} />}
            {paying ? '결제 승인 중…' : '결제하기'}
          </Button>
        </BottomSheet>
      )}
    </Screen>
  )
}

/** 제품 색상 점: 블랙은 Figma 에셋, 나머지는 같은 톤 플레이스홀더 색 */
function ColorDot({ color }: { color: Product['color'] }) {
  if (color === '블랙') return <img src={colorDotBlack} alt="" width={12} height={12} className="block shrink-0" style={{ width: 12, height: 12 }} />
  if (color === '베이지') return <span className="size-3 shrink-0 rounded-full bg-[#cdb899]" />
  if (color === '브라운') return <span className="size-3 shrink-0 rounded-full bg-[#9a7d4f]" />
  if (color === '화이트') return <span className="size-3 shrink-0 rounded-full border border-line bg-surface" />
  return null
}

function SizeChip({ size, stock, selected, onSelect }: { size: string; stock: number; selected: boolean; onSelect: () => void }) {
  const soldOut = !stock
  const tone = soldOut
    ? 'bg-bg text-faint'
    : selected
      ? 'border-2 border-brand bg-brand-soft text-brand'
      : 'border border-line bg-surface text-ink'
  return (
    <button
      type="button"
      disabled={soldOut}
      aria-pressed={selected && !soldOut}
      onClick={onSelect}
      className={`flex h-14 min-w-0 flex-1 flex-col items-center justify-center rounded-xl ${tone}`}
    >
      <span className="t-body-strong">{size}</span>
      <span className={`t-meta ${soldOut || selected ? '' : 'text-faint'}`}>{soldOut ? '품절' : `${stock}개`}</span>
    </button>
  )
}

function PayMethodOption({
  name,
  glyph,
  selected,
  disabled,
  onSelect,
}: {
  name: string
  glyph: string
  selected: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={`flex h-16 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ${
        selected ? 'border-2 border-brand bg-brand-soft' : 'border border-line bg-surface'
      }`}
    >
      <span className={`t-section flex size-10 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-surface text-brand' : 'bg-bg text-sub'}`}>
        {glyph}
      </span>
      <span className="t-body-strong min-w-0 truncate">{name}</span>
      <span className="flex-1" />
      {selected ? (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand">
          <img src={iconCheck} alt="" width={14} height={14} className="block shrink-0" style={{ width: 14, height: 14 }} />
        </span>
      ) : (
        <span className="size-6 shrink-0 rounded-full border-2 border-line" />
      )}
    </button>
  )
}

/** 모바일: 하단 시트 / md 이상: 가운데 480px 모달 (Figma 03b 태블릿·데스크톱) */
function BottomSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/40 md:items-center md:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="결제하기"
        onClick={(e) => e.stopPropagation()}
        className={`sheet-up flex max-h-dvh w-full flex-col items-start gap-4 overflow-y-auto rounded-t-3xl bg-surface px-5 pt-3 shadow-md ${CTA_PB} md:max-h-full md:w-[480px] md:rounded-3xl md:pb-8`}
      >
        <div className="flex h-1 w-full shrink-0 items-center justify-center">
          <span className="h-1 w-10 rounded-full bg-line" />
        </div>
        {children}
      </div>
    </div>
  )
}
