// ERP 화면 공통 부품 (DESIGN.md: 흰 종이·검은 잉크·헤어라인, 모서리 0, 컨트롤만 2px, 파랑은 인식·선택에만)
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Me } from './api'
import { roleAtLeast, type Role } from './model'

export const MeContext = createContext<Me | null>(null)
export function useMe(): Me {
  const me = useContext(MeContext)
  if (!me) throw new Error('MeContext missing')
  return me
}

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-erp-signal'
export const BTN = `h-11 rounded-[2px] px-3 text-[13px] whitespace-nowrap disabled:opacity-50 ${FOCUS}`
export const BTN_PRIMARY = `${BTN} bg-ink px-4 font-semibold text-white hover:bg-black`
export const BTN_LINE = `${BTN} border border-ink bg-white text-ink`
export const BTN_QUIET = `${BTN} border border-erp-line bg-white text-ink`
export const BTN_TEXT = `${BTN} text-erp-muted underline`
export const INPUT = `h-11 rounded-[2px] border border-erp-line bg-white px-3 text-[15px] ${FOCUS}`
export const MONO = 'font-erp-mono'

export function PageHeader({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.02em]">{title}</h1>
        {sub && <p className="m-0 text-erp-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

export function Panel({ title, meta, children, className = '' }: { title?: string; meta?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col border border-erp-line bg-white ${className}`}>
      {title && (
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-6 pt-5 pb-3">
          <h2 className="m-0 text-xl font-extrabold tracking-[-0.02em]">{title}</h2>
          {meta && <span className="text-xs text-erp-muted">{meta}</span>}
        </div>
      )}
      {children}
    </section>
  )
}

/** 가로로 넘치면 이 안에서만 스크롤. relative: 화면에 안 보이는 라벨(sr-only, absolute)이 상자 밖으로 빠져 페이지를 넓히지 않게 */
export function TableBox({ children }: { children: ReactNode }) {
  return <div className="relative overflow-x-auto">{children}</div>
}
export const TABLE = 'w-full border-collapse text-[14px]'
export const TH = 'h-10 border-b border-erp-line px-4 text-left text-xs font-medium whitespace-nowrap text-erp-muted'
export const TD = 'border-b border-erp-line px-4 py-2 align-middle'

export type Tone = 'ok' | 'caution' | 'critical' | 'ink' | 'muted' | 'signal'
export function Dot({ tone }: { tone: Tone }) {
  const bg = { ok: 'bg-erp-ok', caution: 'bg-erp-caution', critical: 'bg-erp-critical', ink: 'bg-ink', muted: 'bg-erp-line', signal: 'bg-erp-signal' }[tone]
  return <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${bg}`} />
}
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap">
      <Dot tone={tone} />
      {children}
    </span>
  )
}

/** 탭 (선택은 아래 잉크 선) */
export function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-6 border-b border-erp-line">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-11 border-b-2 text-[15px] ${o.value === value ? 'border-ink font-bold text-ink' : 'border-transparent text-erp-muted'} ${FOCUS}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="m-0 border-t border-erp-line px-6 py-4 text-sm text-erp-muted">{children}</p>
}

export function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="m-0 border border-erp-critical bg-white px-4 py-3 text-sm text-erp-critical">
      {message}
    </p>
  )
}

export function Loading() {
  return <p className="m-0 text-sm text-erp-muted">불러오는 중…</p>
}

/** 등급이 모자라면 내용 대신 안내 */
export function RequireRole({ min, children }: { min: Role; children: ReactNode }) {
  const me = useMe()
  if (roleAtLeast(me.role, min)) return <>{children}</>
  const who = min === 'owner' ? 'owner' : '매니저 이상'
  return <p className="m-0 border border-erp-line bg-white px-6 py-5 text-erp-muted">이 화면은 {who}만 볼 수 있어요.</p>
}

/** 불러오기 + 주기적 새로고침. 늦게 온 옛 응답은 버린다 */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[], pollMs?: number) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(fn, deps)
  const reload = useCallback(async () => {
    const id = ++latest.current
    try {
      const d = await load()
      if (id === latest.current) {
        setData(d)
        setError(null)
      }
    } catch (e) {
      if (id === latest.current) setError((e as Error).message)
    }
  }, [load])
  useEffect(() => {
    setData(null)
    reload()
    if (!pollMs) return
    const t = setInterval(reload, pollMs)
    return () => clearInterval(t)
  }, [reload, pollMs])
  return { data, error, setError, reload }
}

/** 버튼 작업: 처리 중 표시 → 끝나면 다시 불러오기, 실패는 문구로 */
export function useAction(reload: () => Promise<void>, setError: (m: string | null) => void) {
  const [busy, setBusy] = useState<string | null>(null)
  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key)
    try {
      await fn()
      setError(null)
      await reload()
      return true
    } catch (e) {
      setError((e as Error).message)
      return false
    } finally {
      setBusy(null)
    }
  }
  return { busy, run }
}
