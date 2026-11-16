import { Fragment } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { STATUS_LABEL, won, type Order } from '../lib'
import { useLive } from '../live'
import { BackBar, Button, FITTING_ROOM, FITTING_SPOT, InfoRow, PICKUP_DESK, Screen, StatusBadge } from '../ui'

import iconCheck from '../assets/figma/icon-check-0317c.svg'
import iconBell from '../assets/figma/icon-bell-c3fb2.svg'
import stepCircleActive from '../assets/figma/step-circle-active-327c8.svg'
import perforation from '../assets/figma/perforation-8dac7.svg'
import perforationMd from '../assets/figma/perforation-md-204f1.svg'
import perforationLg from '../assets/figma/perforation-lg-af767.svg'
import notch from '../assets/figma/notch-c00b3.svg'

/** 피팅 예상 대기: 앞 팀당 약 2분 */
const MIN_PER_TEAM = 2

const STEPS: Record<Order['type'], string[]> = {
  purchase: ['접수', '준비 중', '픽업 대기'],
  fitting: ['접수', '준비 중', '입장 가능'],
}
/** 지금 단계(1부터). done이면 세 단계 모두 완료 */
const STEP_NOW: Record<Order['status'], number> = { preparing: 2, ready: 3, done: 4 }

/** Figma Barcode 컴포넌트의 막대·간격 폭(px). 막대부터 번갈아 나온다 */
const BARS = [
  4, 2, 6, 2, 4, 4, 2, 6, 2, 2, 4, 6, 2, 4, 2, 2, 6, 4, 2, 4, 4, 2, 6, 2, 4, 2, 2, 6,
  4, 2, 4, 2, 6, 2, 2, 4, 4, 6, 2, 4, 2, 2, 4, 6, 2, 4, 4, 2, 6, 2, 4, 2, 2, 4, 6, 2,
]
const BAR_W: Record<number, string> = { 2: 'w-0.5', 4: 'w-1', 6: 'w-1.5' }

export default function OrderPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { orders, products } = useLive()
  const o = orders.find((x) => x.id === id)
  const p = o && products.find((x) => x.id === o.product_id)
  if (!o || !p) return <Screen><p className="t-body p-10 text-center text-faint">불러오는 중…</p></Screen>

  const purchase = o.type === 'purchase'
  const ahead = orders.filter((x) => x.status === 'preparing' && x.type === o.type && x.created_at < o.created_at).length
  const close = () => nav('/')

  const queue =
    o.status !== 'preparing'
      ? null
      : purchase
        ? `앞에 ${ahead}팀 대기 중`
        : `앞에 ${ahead}팀 · 예상 대기 약 ${Math.max(1, ahead) * MIN_PER_TEAM}분`

  const notice =
    o.status === 'ready'
      ? {
          title: '준비가 끝났어요',
          body: purchase ? '1F 픽업 데스크에서 번호를 보여주세요.' : `${p.name} ${o.size} 사이즈가 ${FITTING_ROOM}에 준비되었습니다.`,
        }
      : o.status === 'done'
        ? { title: '이용해 주셔서 감사합니다', body: `${p.name} ${o.size} 사이즈가 전달되었습니다.` }
        : null

  return (
    <Screen className="min-h-dvh md:gap-6 md:pt-6">
      <BackBar title={purchase ? '픽업 번호' : '피팅하기'} to="/" />

      {notice && <CompletionNotice {...notice} className="flex md:hidden" />}

      <div className="flex w-full flex-col md:flex-row md:items-start md:gap-6">
        {/* column A: 티켓 */}
        <div className="flex w-full min-w-0 flex-col md:min-w-[300px] md:flex-1">
          <div className="relative flex w-full flex-col overflow-clip rounded-3xl bg-surface shadow-md">
            <div className="flex w-full flex-col items-center gap-2 px-6 pt-6 pb-4">
              <span className="t-meta text-sub">{purchase ? '픽업 번호' : '피팅 번호'}</span>
              <span className="t-display w-full text-center">{o.pickup_code}</span>
              <StatusBadge type={o.type} status={o.status} label={STATUS_LABEL[o.type][o.status]} />
              {queue && <p className="t-body text-center text-sub">{queue}</p>}
              <div className="w-full md:hidden">
                <StepProgress type={o.type} status={o.status} />
              </div>
            </div>

            <Perforation />

            <div className="flex w-full flex-col px-6 pt-2 pb-4">
              <InfoRow label="상품" value={o.size ? `${p.name} · ${o.size}` : p.name} />
              {purchase ? (
                <>
                  <InfoRow label="금액" value={won(o.amount)} />
                  <InfoRow label="결제 수단" value={o.pay_method} />
                  <InfoRow label="픽업 장소" value={<PlaceLink to="/pickup">{PICKUP_DESK}</PlaceLink>} divider={false} />
                  <Barcode code={o.pickup_code} />
                </>
              ) : (
                <>
                  <InfoRow label="피팅룸" value={<PlaceLink to="/fitting">{FITTING_ROOM}</PlaceLink>} />
                  <InfoRow label="위치" value={FITTING_SPOT} divider={false} />
                </>
              )}
            </div>
          </div>
        </div>

        {/* column B: 태블릿·데스크톱 전용 (알림 · 진행 카드 · 닫기) */}
        <div className="hidden min-w-[300px] flex-1 flex-col gap-6 md:flex">
          {notice && <CompletionNotice {...notice} className="flex" />}
          <div className="w-full rounded-3xl bg-surface px-6 pt-5 pb-4 shadow-card">
            <StepProgress type={o.type} status={o.status} />
          </div>
          <Button variant="secondary" className="w-full" onClick={close}>
            닫기
          </Button>
        </div>
      </div>

      {/* 모바일 하단 바 */}
      <div className="mt-auto -mb-2 w-full md:hidden">
        <Button variant="secondary" className="w-full" onClick={close}>
          닫기
        </Button>
      </div>
    </Screen>
  )
}

function StepProgress({ type, status }: { type: Order['type']; status: Order['status'] }) {
  const now = STEP_NOW[status]
  return (
    <ol className="flex w-full items-start">
      {STEPS[type].map((label, i) => {
        const n = i + 1
        return (
          <Fragment key={label}>
            {i > 0 && (
              <li aria-hidden className="flex h-6 min-w-px flex-1 items-center">
                <span className={`h-0.5 flex-1 rounded-full ${n <= now ? 'bg-brand' : 'bg-line'}`} />
              </li>
            )}
            <li aria-current={n === now ? 'step' : undefined} className="flex w-16 shrink-0 flex-col items-center gap-2">
              {n < now ? (
                <span className="flex size-6 items-center justify-center rounded-full bg-brand">
                  <img src={iconCheck} alt="" width={14} height={14} className="block size-3.5" />
                </span>
              ) : n === now ? (
                <img src={stepCircleActive} alt="" width={24} height={24} className="block size-6" />
              ) : (
                <span className="size-6 rounded-full border-2 border-line bg-bg" />
              )}
              <span className={`t-meta whitespace-nowrap ${n <= now ? 'text-ink' : 'text-faint'}`}>{label}</span>
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}

/** 티켓 절취선 + 좌우 홈. 절취선은 Figma가 화면 폭별로 내보낸 SVG를 그대로 쓴다 */
function Perforation() {
  return (
    <div className="relative h-6 w-full shrink-0">
      <img src={perforation} alt="" width={350} height={24} className="absolute inset-0 block size-full max-w-none md:hidden" />
      <img src={perforationMd} alt="" width={340} height={24} className="absolute inset-0 hidden size-full max-w-none md:block lg:hidden" />
      <img src={perforationLg} alt="" width={588} height={24} className="absolute inset-0 hidden size-full max-w-none lg:block" />
      <img src={notch} alt="" width={24} height={24} className="absolute top-0 -left-3 block size-6 max-w-none" />
      <img src={notch} alt="" width={24} height={24} className="absolute top-0 -right-3 block size-6 max-w-none" />
    </div>
  )
}

function Barcode({ code }: { code: string }) {
  return (
    <div className="flex w-full flex-col items-center gap-2 py-2">
      <div aria-hidden className="flex h-12 items-start">
        {BARS.map((w, i) => (
          <span key={i} className={`h-12 shrink-0 ${BAR_W[w]} ${i % 2 === 0 ? 'bg-ink' : ''}`} />
        ))}
      </div>
      <span className="t-meta text-center text-sub">{code}</span>
    </div>
  )
}

function CompletionNotice({ title, body, className = '' }: { title: string; body: string; className?: string }) {
  return (
    <div role="status" className={`w-full items-center gap-3 rounded-2xl bg-ok-soft p-4 ${className}`}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface">
        <img src={iconBell} alt="" width={20} height={20} className="block size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-ok-text">
        <span className="t-body-strong">{title}</span>
        <span className="t-meta">{body}</span>
      </div>
    </div>
  )
}

/** 장소 행 값: 눌러서 피팅룸·픽업 데스크 화면으로 */
function PlaceLink({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className="text-brand underline-offset-2 active:underline">
      {children} ›
    </Link>
  )
}
