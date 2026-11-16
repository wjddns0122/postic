import { useRef, useState, type PointerEvent } from 'react'
import type { Product } from '../lib'
import { STUDIO_BG, Thumb } from '../ui'

/**
 * 상품 히어로
 * - 3D 스캔(model_url)이 있으면 "3D로 돌려보기": 누를 때만 모델을 받는다(동시 접속 때 전원이 수 MB를 자동으로 받지 않게).
 *   3D가 뜨면 "내 공간에 놓아보기"로 아이폰 AR Quick Look(USDZ)·안드로이드 Scene Viewer.
 * - 뒷면 사진(back_image_url)만 있으면 앞↔뒤를 3D로 뒤집어 보는 "돌려보기" 카드.
 */
export function ProductHero({ p: product, className }: { p: Product; className: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'ready'>('idle')
  // 로컬 개발에서만: /p/<id>?model3d=/products/<id>.glb 로 DB에 넣기 전에 스캔을 미리 본다
  const preview = import.meta.env.DEV ? new URLSearchParams(location.search).get('model3d') : null
  const p = preview ? { ...product, model_url: preview } : product

  const open3D = async () => {
    setState('loading')
    await import('@google/model-viewer') // three.js 포함, 이 버튼을 눌렀을 때만 받는다
    setState('ready')
  }

  if (!p.model_url && p.image_url && p.back_image_url) {
    return <TurnCard front={p.image_url} back={p.back_image_url} name={p.name} className={className} />
  }

  if (!p.model_url || state !== 'ready') {
    return (
      <div className="relative">
        <Thumb p={p} fit="hero" className={className} />
        {p.model_url && (
          <button
            onClick={open3D}
            disabled={state === 'loading'}
            className="t-meta absolute right-4 bottom-4 flex items-center gap-2 rounded-full bg-surface/95 px-3 py-2 text-ink shadow-md active:opacity-80"
          >
            {state === 'loading' ? (
              <span className="spin size-3.5 rounded-full border-2 border-ink border-t-transparent" />
            ) : (
              <Cube />
            )}
            {state === 'loading' ? '3D 불러오는 중…' : '3D로 돌려보기'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl ${STUDIO_BG} ${className}`}>
      <model-viewer
        src={p.model_url}
        ios-src={p.model_usdz_url ?? undefined}
        poster={p.image_url ?? undefined}
        alt={`${p.name} 3D 모델`}
        camera-controls=""
        auto-rotate=""
        auto-rotate-delay="0"
        rotation-per-second="20deg"
        touch-action="pan-y"
        interaction-prompt="none"
        shadow-intensity="0.8"
        exposure="1"
        ar=""
        ar-modes="webxr scene-viewer quick-look"
        style={{ width: '100%', height: '100%', background: 'transparent' }}
      >
        <button
          slot="ar-button"
          className="t-meta absolute right-4 bottom-4 flex items-center gap-2 rounded-full bg-ink px-3 py-2 text-white shadow-md active:opacity-80"
        >
          <Cube light />내 공간에 놓아보기
        </button>
      </model-viewer>
    </div>
  )
}

/** 앞·뒤 스튜디오 컷을 카드처럼 Y축으로 뒤집는다. 좌우로 끌어 돌리고, 놓으면 가까운 면에 멈춘다 */
function TurnCard({ front, back, name, className }: { front: string; back: string; name: string; className: string }) {
  const [angle, setAngle] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; angle: number; moved: boolean } | null>(null)
  const snap = (a: number) => Math.round(a / 180) * 180
  const showingBack = Math.abs(snap(angle) / 180) % 2 === 1

  const down = (e: PointerEvent) => {
    start.current = { x: e.clientX, angle, moved: false }
    setDragging(true)
  }
  const move = (e: PointerEvent) => {
    const s = start.current
    if (!s) return
    const dx = e.clientX - s.x
    if (Math.abs(dx) > 4) s.moved = true
    setAngle(s.angle + dx * 0.6)
  }
  const up = () => {
    const s = start.current
    start.current = null
    setDragging(false)
    // 그냥 탭하면 반 바퀴, 끌었으면 가까운 면으로
    setAngle((a) => (s && !s.moved ? snap(a) + 180 : snap(a)))
  }

  return (
    <div
      className={`relative cursor-grab touch-pan-y overflow-hidden rounded-2xl select-none ${STUDIO_BG} ${className}`}
      style={{ perspective: 1400 }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerLeave={() => start.current && up()}
      role="img"
      aria-label={`${name} ${showingBack ? '뒷면' : '앞면'}`}
    >
      <div
        className="relative size-full"
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateY(${angle}deg)`,
          transition: dragging ? 'none' : 'transform .7s cubic-bezier(.2,.7,.2,1)',
        }}
      >
        <img src={front} alt="" draggable={false} className="absolute inset-0 size-full object-contain [backface-visibility:hidden]" />
        <img
          src={back}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-contain [backface-visibility:hidden]"
          style={{ transform: 'rotateY(180deg)' }}
        />
      </div>
      <span className="t-meta pointer-events-none absolute right-4 bottom-4 flex items-center gap-2 rounded-full bg-surface/95 px-3 py-2 text-ink shadow-md">
        <Turn />
        {showingBack ? '뒷면 · 눌러서 앞면' : '돌려보기'}
      </span>
    </div>
  )
}

function Turn() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}

function Cube({ light }: { light?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={light ? '#fff' : '#111'} strokeWidth="2" strokeLinejoin="round" aria-hidden>
      <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" />
      <path d="m3 7 9 5 9-5M12 12v10" />
    </svg>
  )
}
