import type { ChangeEvent, CSSProperties, ReactNode } from 'react'

import ringTrack from '../../assets/figma/ring-track-1527a.svg'
import ringArc from '../../assets/figma/ring-arc-71973.svg'
import sliderKnob from '../../assets/figma/slider-knob-9f134.svg'
import toggleOn from '../../assets/figma/toggle-on-04028.svg'
import toggleOff from '../../assets/figma/toggle-off-0f250.svg'
import iconCheck from '../../assets/figma/icon-check-0317c.svg'

/** Figma SVG를 원래 크기 그대로 배치 */
export function Img({ src, w, h = w, className = '', style }: { src: string; w: number; h?: number; className?: string; style?: CSSProperties }) {
  return <img src={src} alt="" width={w} height={h} className={`block max-w-none shrink-0 ${className}`} style={{ ...style, width: w, height: h }} />
}

export function ago(now: number, t: string | number) {
  const s = Math.max(0, Math.round((now - (typeof t === 'number' ? t : Date.parse(t))) / 1000))
  return s <= 1 ? '방금' : s < 60 ? `${s}초 전` : `${Math.round(s / 60)}분 전`
}

/** −70 dBm (Figma와 같은 마이너스 기호) */
export const dbm = (v: number) => `${String(v).replace('-', '−')} dBm`

/** CardHeader: 아이콘 칩 + 제목 + 메타(모바일에서는 숨김) */
export function CardHeader({ icon, title, meta }: { icon: string; title: string; meta?: ReactNode }) {
  return (
    <div className="flex w-full items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft">
        <Img src={icon} w={18} />
      </span>
      <h2 className="t-section min-w-0 truncate">{title}</h2>
      <div className="flex-1" />
      {meta != null && <span className="t-meta hidden shrink-0 text-faint md:block">{meta}</span>}
    </div>
  )
}

function RingGauge({ ratio }: { ratio: number }) {
  const deg = Math.round(ratio * 360)
  // 100% 호 SVG를 비율만큼 원뿔 마스크로 잘라 보여준다 (12시 방향부터 시계방향)
  const mask = `conic-gradient(#000 ${deg}deg, transparent 0)`
  return (
    <div className="relative flex size-16 shrink-0 items-center justify-center">
      <Img src={ringTrack} w={64} className="absolute top-0 left-0" />
      <Img src={ringArc} w={64} className="absolute top-0 left-0" style={{ maskImage: mask, WebkitMaskImage: mask }} />
      <span className="t-meta relative">{Math.round(ratio * 100)}%</span>
    </div>
  )
}

const SPARK = [12, 20, 16, 28, 22, 32, 26]

/** 장식용 막대 (Figma KPI Card sparkline) */
function Sparkline() {
  return (
    <div aria-hidden className="flex shrink-0 items-end gap-1">
      {SPARK.map((h, i) => (
        <span key={i} className={`w-1.5 rounded-lg ${i === SPARK.length - 1 ? 'bg-brand' : 'bg-brand-soft'}`} style={{ height: h }} />
      ))}
    </div>
  )
}

/** KPI Card: ratio가 있으면 그라데이션 + 링 게이지, 없으면 흰 카드 + 아이콘 칩 + 스파크라인 */
export function KpiCard({ label, value, sub, icon, ratio }: { label: string; value: ReactNode; sub: ReactNode; icon?: string; ratio?: number }) {
  const hero = ratio !== undefined
  return (
    <div
      className={`flex w-60 shrink-0 flex-col gap-4 overflow-clip rounded-3xl p-5 shadow-card md:w-auto ${
        hero ? 'bg-gradient-to-r from-brand to-violet text-white' : 'bg-surface'
      }`}
    >
      <div className="flex w-full items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={`t-body truncate ${hero ? '' : 'text-sub'}`}>{label}</span>
          <span className="t-title truncate">{value}</span>
        </div>
        {hero ? (
          <RingGauge ratio={ratio} />
        ) : (
          icon && (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft">
              <Img src={icon} w={20} />
            </span>
          )
        )}
      </div>
      <div className="flex w-full items-end gap-3">
        <span className={`t-meta min-w-0 flex-1 ${hero ? '' : 'text-faint'}`}>{sub}</span>
        {!hero && <Sparkline />}
      </div>
    </div>
  )
}

/** RSSI 막대 3단 (Figma SignalBars: brand, 4px, 8/12/16) */
export function RssiBars({ rssi, off }: { rssi?: number; off?: boolean }) {
  const level = off || rssi === undefined ? 0 : rssi >= -65 ? 3 : rssi >= -78 ? 2 : 1
  return (
    <span aria-hidden className="flex shrink-0 items-end gap-1">
      {[8, 12, 16].map((h, i) => (
        <span key={h} className={`w-1 rounded-lg ${i < level ? 'bg-brand' : 'bg-line'}`} style={{ height: h }} />
      ))}
    </span>
  )
}

export function SliderRow({
  label,
  valueLabel,
  min,
  max,
  value,
  onChange,
}: {
  label: string
  valueLabel: string
  min: number
  max: number
  value: number
  onChange: (v: number) => void
}) {
  const ratio = Math.min(1, Math.max(0, (value - min) / (max - min)))
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex w-full items-center">
        <span className="t-body text-sub">{label}</span>
        <div className="flex-1" />
        <span className="t-body-strong">{valueLabel}</span>
      </div>
      <div className="relative flex h-5 w-full items-center">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          aria-label={label}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
          className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer opacity-0"
        />
        <span className="h-1 shrink-0 rounded-full bg-brand" style={{ width: `calc((100% - 20px) * ${ratio})` }} />
        <Img src={sliderKnob} w={20} className="rounded-full peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand" />
        <span className="h-1 min-w-0 flex-1 rounded-full bg-line" />
      </div>
    </div>
  )
}

export function Toggle({ on }: { on: boolean }) {
  return <Img src={on ? toggleOn : toggleOff} w={48} h={28} />
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        className={`flex size-6 shrink-0 items-center justify-center rounded-lg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand ${
          checked ? 'bg-brand' : 'border-2 border-line bg-surface'
        }`}
      >
        {checked && <Img src={iconCheck} w={14} />}
      </span>
      <span className="t-body min-w-0">{label}</span>
    </label>
  )
}
