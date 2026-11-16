import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { sizeList, won, type Product } from '../../lib'
import { distanceLabel, Thumb } from '../../ui'

import iconHanger18 from '../../assets/figma/icon-hanger-18-0168d.svg'
import iconRadio from '../../assets/figma/icon-radio-bbdcb.svg'
import iconClock from '../../assets/figma/icon-clock-e69e7.svg'
import iconTag from '../../assets/figma/icon-tag-99d18.svg'
import iconTagMuted from '../../assets/figma/icon-tag-muted-ef0e9.svg'
import iconChevR16 from '../../assets/figma/icon-chev-r-16-f18f0.svg'
import decoA from '../../assets/figma/deco-hanger-a-524dc.svg'
import decoB from '../../assets/figma/deco-hanger-b-b4322.svg'

function Img({ src, size, className = '' }: { src: string; size: number; className?: string }) {
  return <img src={src} alt="" width={size} height={size} className={`block shrink-0 ${className}`} style={{ width: size, height: size }} />
}

/** Figma SignalBars: 4px 막대 3개, 활성 막대는 brand */
export function SignalBars({ rssi }: { rssi?: number }) {
  const level = rssi === undefined ? 0 : rssi >= -65 ? 3 : rssi >= -78 ? 2 : 1
  return (
    <span className="flex shrink-0 items-end gap-1" aria-label={`신호 ${level}/3`}>
      {[8, 12, 16].map((h, i) => (
        <span key={h} className={`w-1 rounded-lg ${i < level ? 'bg-brand' : 'bg-line'}`} style={{ height: h }} />
      ))}
    </span>
  )
}

/** 태그 ID 칩 (online: brand-soft, offline: bg) */
export function TagChip({ id, online }: { id: string; online: boolean }) {
  return (
    <span className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 ${online ? 'bg-brand-soft' : 'bg-bg'}`}>
      <Img src={online ? iconTag : iconTagMuted} size={12} />
      <span className={`t-meta whitespace-nowrap ${online ? 'text-brand' : 'text-faint'}`}>{id}</span>
    </span>
  )
}

/** 옷 한 벌: 배경을 뺀 컷아웃(/products/<id>-cut.png)이 봉에 걸린 모습. 컷아웃이 없으면 썸네일로 대신한다 */
function RackGarment({ p, on }: { p: Product; on: boolean }) {
  const [noCut, setNoCut] = useState(false)
  const hookId = `hook-${useId().replace(/:/g, '')}`
  return (
    <Link
      to={`/p/${p.id}`}
      aria-label={`${p.name} 보기`}
      className={`relative -mx-1 flex h-full min-w-0 flex-1 flex-col items-center transition-[opacity,filter] duration-300 active:scale-[.98] ${
        on ? '' : 'opacity-35 grayscale'
      }`}
    >
      {/* 옷걸이 고리: 세 벌 모두 같은 크롬 고리로 봉을 감싼다 (사진의 고리는 잘라냄) */}
      <svg width="18" height="26" viewBox="0 0 18 26" fill="none" className="shrink-0" aria-hidden>
        <defs>
          <linearGradient id={hookId} x1="0" y1="0" x2="18" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#8a919c" />
            <stop offset="0.45" stopColor="#e9ecf0" />
            <stop offset="1" stopColor="#7d8490" />
          </linearGradient>
        </defs>
        <path
          d="M9 26V17C9 14.5 14 14 14 9.5C14 5.5 11.5 3 9 3C6.5 3 4.5 5 4.5 7.5"
          stroke={`url(#${hookId})`}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      {noCut ? (
        <Thumb p={p} className="size-24" />
      ) : (
        <img
          src={`/products/${p.id}-cut.png`}
          alt={p.name}
          onError={() => setNoCut(true)}
          className="-mt-px min-h-0 w-auto max-w-[125%] flex-1 object-contain object-top drop-shadow-[0_12px_14px_rgba(17,17,17,0.22)]"
        />
      )}
    </Link>
  )
}

// 크롬 질감: 가로 파이프(위 하이라이트), 세로 기둥(가운데 하이라이트)
const CHROME_H = 'bg-[linear-gradient(180deg,#ffffff_0%,#eef0f3_30%,#c2c7cf_62%,#8b929d_100%)]'
const CHROME_V = 'bg-[linear-gradient(90deg,#8f96a1_0%,#f3f4f6_42%,#c6cbd2_68%,#868d98_100%)]'

const stock = (p: Product) => Object.values(p.sizes).reduce((a, b) => a + b, 0)

/** 행거 일러스트: 금속 봉·기둥·바닥 위에 실제 옷 사진이 걸려 있고, 감지 안 된 옷은 흐리게 */
export function HangerIllustration({
  items,
  isOnline,
  hangerId,
  gateway,
  rssi,
}: {
  items: Product[]
  isOnline: (p: Product) => boolean
  hangerId: string
  gateway: string
  rssi?: number
}) {
  const onCount = items.filter(isOnline).length
  return (
    <div className="relative w-full overflow-hidden rounded-3xl bg-surface shadow-card">
      <img src={decoA} alt="" width={220} height={220} className="pointer-events-none absolute top-[-120px] left-[-60px] size-[220px] max-w-none" />
      <img src={decoB} alt="" width={160} height={160} className="pointer-events-none absolute top-[-60px] right-[-40px] size-[160px] max-w-none" />

      <div className="relative z-10 flex items-center gap-2 px-4 pt-4">
        <span className="flex items-center gap-2 rounded-full bg-surface px-3 py-1 shadow-sm">
          <span className={`size-2 rounded-full ${onCount ? 'pulse-dot bg-ok' : 'bg-faint'}`} />
          <span className="t-meta text-ink">{`${hangerId} · ${gateway}`}</span>
        </span>
        <div className="flex-1" />
        <SignalBars rssi={rssi} />
      </div>

      {/* 행거: 바닥 → 기둥·발판 → 봉 → 옷(고리가 봉 앞을 감쌈) 순서로 겹친다 */}
      <div className="relative mx-4 mt-2 h-[250px] md:h-[350px]">
        {/* 바닥: 흰 카드에서 앱 배경색(bg)으로 경계 없이 이어진다 */}
        <div className="absolute inset-x-[-16px] bottom-0 h-[110px] bg-gradient-to-b from-surface/0 to-bg" />
        {[0, 1].map((i) => (
          <div key={i} className={`absolute top-[19px] bottom-[16px] w-[44px] ${i ? 'right-[-12px]' : 'left-[-12px]'}`}>
            {/* 바닥 그림자 → 발판 → 기둥 */}
            <span className="absolute bottom-[-6px] left-1/2 h-[10px] w-[56px] -translate-x-1/2 rounded-[50%] bg-ink/15 blur-[4px]" />
            <span className={`absolute bottom-0 left-1/2 h-[6px] w-[44px] -translate-x-1/2 rounded-full ${CHROME_H} shadow-[0_2px_3px_rgba(17,17,17,0.18)]`} />
            <span className={`absolute top-0 bottom-[3px] left-1/2 w-[7px] -translate-x-1/2 rounded-full ${CHROME_V}`} />
          </div>
        ))}
        {/* 봉: 위쪽 하이라이트가 있는 크롬 파이프 + 양 끝 마개 */}
        <span className={`absolute inset-x-[2px] top-[14px] h-[10px] rounded-full ${CHROME_H} shadow-[0_6px_10px_-4px_rgba(17,17,17,0.3)]`} />
        {[0, 1].map((i) => (
          <span
            key={i}
            className={`absolute top-[12px] size-[14px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffffff,#c3c8d0_55%,#878e99)] shadow-[0_2px_3px_rgba(17,17,17,0.25)] ${
              i ? 'right-[3px]' : 'left-[3px]'
            }`}
          />
        ))}

        <div className="absolute inset-x-6 top-[6px] bottom-[54px] flex items-start justify-center">
          {items.map((p) => (
            <RackGarment key={p.id} p={p} on={isOnline(p)} />
          ))}
        </div>

        <div className="absolute inset-x-5 bottom-[14px] flex justify-center">
          {items.map((p) => {
            const on = isOnline(p)
            return (
              <div key={p.id} className="flex min-w-0 flex-1 justify-center">
                <span
                  className={`t-meta rounded-full px-3 py-1.5 whitespace-nowrap ${
                    on ? 'bg-ok text-white shadow-[0_4px_10px_rgba(34,197,94,0.35)]' : 'bg-line text-faint'
                  }`}
                >
                  {on ? `${stock(p)}벌` : '감지 안 됨'}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex items-center border-t border-line px-4 py-3">
        <span className="t-meta text-sub">옷을 눌러 사이즈를 확인하세요</span>
        <div className="flex-1" />
        <span className="t-meta text-sub">
          <b className="t-body-strong text-ink">{onCount}벌</b> 감지됨
        </span>
      </div>
    </div>
  )
}

const STAT_ICON = { hanger: iconHanger18, radio: iconRadio, clock: iconClock }

/** Figma StatTile (hanger/radio/clock 아이콘 변형) */
export function StatTile({ icon, value, label }: { icon: keyof typeof STAT_ICON; value: string; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-start gap-3 rounded-2xl bg-surface p-3 shadow-card">
      <span className="flex size-8 items-center justify-center rounded-xl bg-brand-soft">
        <Img src={STAT_ICON[icon]} size={18} />
      </span>
      <div className="flex w-full flex-col gap-1">
        <span className="t-body-strong truncate">{value}</span>
        <span className="t-meta truncate text-sub">{label}</span>
      </div>
    </div>
  )
}

function MiniChip({ size, available }: { size: string; available: boolean }) {
  return (
    <span
      className={`t-meta flex shrink-0 items-center justify-center rounded-lg border border-line px-2 py-1 ${available ? 'bg-surface text-sub' : 'bg-bg text-faint'}`}
    >
      {size}
    </span>
  )
}

/** 상품 행: 썸네일 · 이름 · 가격+태그 · 사이즈 칩 · 거리 */
export function ProductRow({ p, online, rssi }: { p: Product; online: boolean; rssi?: number }) {
  const dist = online ? distanceLabel(rssi) : '감지 안 됨'
  const distTone = !online ? 'text-faint' : dist === '바로 앞' ? 'text-brand' : 'text-sub'
  return (
    <Link to={`/p/${p.id}`} className="flex w-full items-center px-4 py-3">
      <div className={`flex min-w-0 flex-1 items-center gap-3 ${online ? '' : 'opacity-45'}`}>
        <Thumb p={p} />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
          <span className="t-body-strong w-full truncate text-ink">{p.name}</span>
          <div className="flex items-center gap-2">
            <span className="t-body shrink-0 text-sub">{won(p.price)}</span>
            <TagChip id={p.id} online={online} />
          </div>
          <div className="flex flex-wrap items-start gap-1">
            {sizeList(p).map(([sz, n]) => (
              <MiniChip key={sz} size={sz} available={n > 0} />
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className={`t-meta whitespace-nowrap ${distTone}`}>{dist}</span>
          <Img src={iconChevR16} size={16} />
        </div>
      </div>
    </Link>
  )
}
