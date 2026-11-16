import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { STATUS_LABEL, won, type Order, type Product } from './lib'
import { useLive } from './live'

import thumbBlack from './assets/figma/thumb-black-8eff0.svg'
import thumbBeige from './assets/figma/thumb-beige-5d39f.svg'
import thumbWhite from './assets/figma/thumb-white-e0931.svg'
import iconHanger from './assets/figma/icon-hanger-e3d3b.svg'
import iconHanger22 from './assets/figma/icon-hanger-22-c1628.svg'
import iconHanger18 from './assets/figma/icon-hanger-18-0168d.svg'
import iconChevR16 from './assets/figma/icon-chev-r-16-f18f0.svg'
import iconChevR20 from './assets/figma/icon-chev-r-20-852a3.svg'
import iconChevL from './assets/figma/icon-chev-l-ac034.svg'
import iconDoor from './assets/figma/icon-door-0aba9.svg'
import iconDoorWhite from './assets/figma/icon-door-white-cf153.svg'
import iconDoorCaution from './assets/figma/icon-door-caution-4f715.svg'
import iconBag from './assets/figma/icon-bag-b6817.svg'
import iconBag22 from './assets/figma/icon-bag-22-dd2d6.svg'
import iconBagCaution from './assets/figma/icon-bag-caution-07d75.svg'
import iconBagOk from './assets/figma/icon-bag-ok-22c8f.svg'
import iconBagMuted from './assets/figma/icon-bag-muted-a378e.svg'
import iconBagDone from './assets/figma/icon-bag-done-0ed2f.svg'
import iconDoorOk from './assets/figma/icon-door-ok-9a6ae.svg'
import iconDoorDone from './assets/figma/icon-door-done-c0e66.svg'
import iconClock from './assets/figma/icon-clock-e69e7.svg'
import iconPin from './assets/figma/icon-pin-77cef.svg'
import pulseOk from './assets/figma/pulse-ok-90435.svg'
import pulseLive from './assets/figma/pulse-live-93efb.svg'
import dotCaution from './assets/figma/dot-caution-608f7.svg'
import decoA from './assets/figma/deco-a-08f88.svg'
import decoB from './assets/figma/deco-b-8f711.svg'
import decoDarkA from './assets/figma/deco-dark-a-494b5.svg'
import decoDarkB from './assets/figma/deco-dark-b-2bb69.svg'

export const icons = { iconChevR16, iconChevR20, iconBagMuted, iconHanger }

export const STORE_LABEL = 'POSTIC 홍대점 3F · 디스플레이 존 A-01'
export const FITTING_ROOM = 'FR-03'
export const FITTING_SPOT = '3F · 디스플레이 존 A-01'
export const PICKUP_DESK = '1F 픽업 데스크 · 입구 좌측'

function Img({ src, size, className = '' }: { src: string; size: number; className?: string }) {
  return <img src={src} alt="" width={size} height={size} className={`block shrink-0 ${className}`} style={{ width: size, height: size }} />
}

/** 손님 화면 공통 래퍼: 모바일 20px 패딩, 데스크톱 1200px 캡 */
export function Screen({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className="min-h-dvh bg-bg">
      <div className={`mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-5 pt-8 pb-10 md:px-8 md:pt-6 lg:px-10 ${className}`}>{children}</div>
    </div>
  )
}

function Wordmark() {
  return (
    <div className="flex flex-col gap-1">
      <span className="t-heading">POSTIC</span>
      <span className="h-[3px] w-full rounded-full bg-gradient-to-r from-brand to-violet" />
    </div>
  )
}

export function TopBar() {
  const { anySimulated } = useLive()
  return (
    <header className="flex w-full flex-col gap-2 pt-2 pb-3">
      <div className="flex w-full items-center gap-2">
        <Wordmark />
        <div className="flex-1" />
        {anySimulated && <SimBadge />}
        <LivePill />
      </div>
      <div className="flex items-center gap-1">
        <Img src={iconPin} size={14} />
        <span className="t-meta text-sub">{STORE_LABEL}</span>
      </div>
    </header>
  )
}

export function BackBar({ title, to }: { title: string; to?: string }) {
  const nav = useNavigate()
  const { anySimulated } = useLive()
  return (
    <header className="flex w-full items-center gap-3 pt-2 pb-3">
      <button
        onClick={() => (to ? nav(to) : nav(-1))}
        aria-label="뒤로"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface shadow-sm"
      >
        <Img src={iconChevL} size={20} />
      </button>
      <h1 className="t-section min-w-0 flex-1 truncate">{title}</h1>
      {anySimulated && <SimBadge />}
      <LivePill />
    </header>
  )
}

export function LivePill() {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-2 py-1">
      <Img src={pulseLive} size={12} className="pulse-dot" />
      <span className="t-meta text-sub">실시간</span>
    </span>
  )
}

export function SimBadge() {
  return (
    <span className="flex shrink-0 items-center gap-2 rounded-full bg-caution-soft px-3 py-1">
      <Img src={dotCaution} size={8} />
      <span className="t-meta text-caution-text">시뮬레이션</span>
    </span>
  )
}

export function OnlinePill({ count, label = '인식됨' }: { count: number; label?: string }) {
  const on = count > 0
  return (
    <span className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 ${on ? 'bg-ok-soft' : 'bg-line'}`}>
      {on ? <Img src={pulseOk} size={16} className="pulse-dot" /> : <span className="m-1 size-2 rounded-full bg-faint" />}
      <span className={`t-body-strong ${on ? 'text-ok-text' : 'text-sub'}`}>{on ? `${label} · ${count}벌` : '감지 안 됨'}</span>
    </span>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost'
  loading?: boolean
}

export function Button({ variant = 'primary', loading, disabled, className = '', children, ...rest }: ButtonProps) {
  const off = disabled || loading
  const tone = disabled
    ? 'bg-line text-faint'
    : variant === 'primary'
      ? 'bg-gradient-to-r from-brand to-violet text-white'
      : variant === 'secondary'
        ? 'bg-brand-soft text-brand'
        : 'bg-transparent text-sub'
  return (
    <button
      {...rest}
      disabled={off}
      className={`flex h-[52px] items-center justify-center gap-2 rounded-2xl px-4 t-body-strong transition-opacity active:opacity-80 ${tone} ${className}`}
    >
      {loading && <span className="spin size-4 rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  )
}

export function SectionHeader({ title, meta }: { title: string; meta?: ReactNode }) {
  return (
    <div className="flex w-full items-center">
      <h2 className="t-section">{title}</h2>
      <div className="flex-1" />
      {meta && <span className="t-meta text-faint">{meta}</span>}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl bg-surface shadow-card ${className}`}>{children}</div>
}

const TONE: Record<string, string> = { 블랙: thumbBlack, 베이지: thumbBeige, 화이트: thumbWhite }
/** 상품 스튜디오 컷(scripts/compose.swift) 배경과 같은 세로 그라데이션: 사진 좌우 여백이 이어져 보이게 */
export const STUDIO_BG = 'bg-[linear-gradient(#f6f6f4,#eae9e6)]'
// 위 SVG들의 그라데이션·glow 값 (넓은 히어로에서 배경을 박스 전체로 늘릴 때 사용)
const TONE_BG: Record<string, { from: string; to: string; glow: number }> = {
  블랙: { from: '#2A2C31', to: '#5A5E68', glow: 0.084 },
  베이지: { from: '#EADFCB', to: '#CDB899', glow: 0.21 },
  화이트: { from: '#FAFAF8', to: '#DEDDD7', glow: 0.03 },
}
const DISC_MASK = 'radial-gradient(circle 38px at center, #000 37.5px, transparent 38px)'

/**
 * ProductThumb: 사진이 있으면 사진, 없으면 Figma 색상 톤 플레이스홀더.
 * Figma 컴포넌트는 배경만 박스에 맞춰 늘고 glow·원판·아이콘은 원본 크기 그대로라,
 * 기본은 object-none(가운데 원본 크기). 120px보다 큰 히어로는 fit="hero"로
 * 배경을 그라데이션으로 채우고 원판·아이콘만 SVG에서 잘라 쓴다.
 */
export function Thumb({
  p,
  className = 'size-[72px]',
  dim,
  fit = 'none',
}: {
  p: Product
  className?: string
  dim?: boolean
  fit?: 'none' | 'hero'
}) {
  const src = TONE[p.color ?? ''] ?? thumbBlack
  const bg = TONE_BG[p.color ?? ''] ?? TONE_BG['블랙']
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-2xl ${dim ? 'opacity-40 grayscale' : ''} ${className}`}
      style={!p.image_url && fit === 'hero' ? { background: `linear-gradient(135deg, ${bg.from} 0%, ${bg.to} 71.4%)` } : undefined}
    >
      {p.image_url ? (
        // 히어로에선 옷 전체가 보이게: 상품 사진 배경색(#F3F3F1)으로 채우고 contain
        <img
          src={p.image_url}
          alt={p.name}
          className={`size-full ${fit === 'hero' ? `${STUDIO_BG} object-contain` : 'object-cover'}`}
        />
      ) : fit === 'hero' ? (
        <>
          <span className="absolute top-[-60px] left-[-24px] size-[168px] rounded-full bg-white" style={{ opacity: bg.glow }} />
          <img
            src={src}
            alt={p.name}
            className="absolute inset-0 block size-full max-w-none object-none"
            style={{ maskImage: DISC_MASK, WebkitMaskImage: DISC_MASK }}
          />
        </>
      ) : (
        <img src={src} alt={p.name} className="absolute inset-0 block size-full max-w-none object-none" />
      )}
    </div>
  )
}

type StatIcon = 'door' | 'bag' | 'clock' | 'hanger'
const STAT_ICON: Record<StatIcon, string> = { door: iconDoor, bag: iconBag, clock: iconClock, hanger: iconHanger18 }

/** to가 있으면 링크, onClick이 있으면 버튼, 둘 다 없으면 정보 타일 */
export function StatTile({
  icon,
  value,
  label,
  to,
  onClick,
}: {
  icon: StatIcon
  value: string
  label: string
  to?: string
  onClick?: () => void
}) {
  const cls = 'flex min-w-0 flex-1 flex-col items-start gap-3 rounded-2xl bg-surface p-3 text-left shadow-card'
  const body = (
    <>
      <span className="flex size-8 items-center justify-center rounded-xl bg-brand-soft">
        <Img src={STAT_ICON[icon]} size={18} />
      </span>
      <div className="flex w-full min-w-0 flex-col gap-1">
        <span className="t-body-strong truncate">{value}</span>
        <span className="t-meta truncate text-sub">{label}</span>
      </div>
    </>
  )
  if (to) return <Link to={to} className={`${cls} active:opacity-80`}>{body}</Link>
  if (onClick) return <button onClick={onClick} className={`${cls} active:opacity-80`}>{body}</button>
  return <div className={cls}>{body}</div>
}

const PROMO = {
  hanger: { bg: 'bg-brand-soft', chip: 'bg-surface', icon: iconHanger22, deco: [decoA, decoB], title: 'text-ink', sub: 'text-sub' },
  fitting: { bg: 'bg-ink', chip: 'bg-brand', icon: iconDoorWhite, deco: [decoDarkA, decoDarkB], title: 'text-white', sub: 'text-faint' },
  pickup: { bg: 'bg-surface shadow-card', chip: 'bg-surface', icon: iconBag22, deco: [decoA, decoB], title: 'text-ink', sub: 'text-sub' },
}

/** big: 장소 화면 히어로용(타이틀 28px, 높이 자동), badge: 오른쪽 위 상태 */
export function PromoCard({
  kind,
  title,
  sub,
  caption,
  badge,
  big,
  className = '',
}: {
  kind: keyof typeof PROMO
  title: string
  sub: string
  caption?: string
  badge?: ReactNode
  big?: boolean
  className?: string
}) {
  const s = PROMO[kind]
  return (
    <div
      className={`relative flex shrink-0 flex-col items-start justify-between overflow-hidden rounded-3xl p-5 ${big ? 'min-h-[176px] gap-6 md:p-8' : 'h-[144px]'} ${s.bg} ${className}`}
    >
      <img src={s.deco[0]} alt="" className="pointer-events-none absolute top-[-50px] left-[150px] size-[150px] max-w-none" />
      <img src={s.deco[1]} alt="" className="pointer-events-none absolute top-[70px] left-[210px] size-[84px] max-w-none" />
      <div className="relative flex w-full items-center">
        <span className={`flex size-10 items-center justify-center rounded-xl ${s.chip}`}>
          <Img src={s.icon} size={22} />
        </span>
        <div className="flex-1" />
        {badge}
      </div>
      <div className="relative flex flex-col gap-1">
        {caption && <span className={`t-meta ${s.sub}`}>{caption}</span>}
        <span className={`${big ? 't-title' : 't-section'} ${s.title}`}>{title}</span>
        <span className={`t-meta ${s.sub}`}>{sub}</span>
      </div>
    </div>
  )
}

/** 진행 중 주문 카드 (홈·피팅룸·픽업 데스크) */
export function OrderCard({ order, product }: { order: Order; product: Product }) {
  return (
    <Link to={`/order/${order.id}`}>
      <Card className="flex items-center gap-4 p-4">
        <Thumb p={product} className="size-[72px]" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="t-meta text-sub">{order.type === 'purchase' ? '픽업 번호' : '피팅 번호'}</span>
            <StatusBadge type={order.type} status={order.status} label={STATUS_LABEL[order.type][order.status]} />
          </div>
          <span className="t-title">{order.pickup_code}</span>
          <span className="t-meta truncate text-sub">
            {product.name}
            {order.size ? ` · ${order.size}` : ''}
            {order.amount ? ` · ${won(order.amount)}` : ''}
          </span>
        </div>
        <Img src={iconChevR20} size={20} />
      </Card>
    </Link>
  )
}

export function HangerCard({ id, items, onCount }: { id: string; items: Product[]; onCount: number }) {
  return (
    <Link to={`/hanger/${id}`} className="flex w-full items-center gap-3 rounded-3xl bg-surface p-4 shadow-card">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft">
        <Img src={iconHanger} size={28} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="t-section">{id}</span>
        <span className={`t-meta ${onCount > 0 ? 'text-ok-text' : 'text-faint'}`}>{onCount > 0 ? `${onCount}벌 감지` : '감지 안 됨'}</span>
      </div>
      <div className="flex gap-1">
        {items.map((p) => (
          <Thumb key={p.id} p={p} className="size-9" />
        ))}
      </div>
      <Img src={iconChevR16} size={16} />
    </Link>
  )
}

/** StatusBadge: 한 단어 상태, 톤은 의도(준비=caution, 대기/준비완료=ok, 완료=neutral) */
export function StatusBadge({ type, status, label }: { type: Order['type']; status: Order['status']; label: string }) {
  const tone =
    status === 'preparing'
      ? 'bg-caution-soft text-caution-text'
      : status === 'ready'
        ? 'bg-ok-soft text-ok-text'
        : 'bg-bg text-sub'
  const icon =
    type === 'purchase'
      ? status === 'preparing'
        ? iconBagCaution
        : status === 'ready'
          ? iconBagOk
          : iconBagDone
      : status === 'preparing'
        ? iconDoorCaution
        : status === 'ready'
          ? iconDoorOk
          : iconDoorDone
  return (
    <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 ${tone}`}>
      {icon && <Img src={icon} size={14} />}
      <span className="t-meta">{label}</span>
    </span>
  )
}

export function InfoRow({ label, value, divider = true }: { label: string; value: ReactNode; divider?: boolean }) {
  return (
    <div className={`flex h-10 w-full items-center gap-3 ${divider ? 'border-b border-line' : ''}`}>
      <span className="t-body shrink-0 text-sub">{label}</span>
      <div className="flex-1" />
      <span className="t-body-strong min-w-0 truncate text-right">{value}</span>
    </div>
  )
}

/** 기존 호출부 호환용 */
export const Row = ({ k, v }: { k: string; v: ReactNode }) => <InfoRow label={k} value={v} />

export function SignalBars({ rssi }: { rssi?: number }) {
  const level = rssi === undefined ? 0 : rssi >= -65 ? 3 : rssi >= -78 ? 2 : 1
  return (
    <span className="inline-flex items-end gap-[2px]">
      {[1, 2, 3].map((i) => (
        <span key={i} className={`w-[3px] rounded-sm ${i <= level ? 'bg-ok' : 'bg-line'}`} style={{ height: 4 + i * 3 }} />
      ))}
    </span>
  )
}

export function distanceLabel(rssi?: number) {
  if (rssi === undefined) return '감지 안 됨'
  return rssi >= -65 ? '바로 앞' : '근처'
}

export function AdminLink() {
  return (
    <div className="mt-6 text-center">
      <Link to="/admin" className="t-meta text-faint underline">
        직원용 대시보드
      </Link>
    </div>
  )
}
