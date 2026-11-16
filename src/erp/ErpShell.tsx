import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import type { Me } from './api'

const ROLE: Record<Me['role'], string> = { owner: 'owner', manager: '매니저', staff: '직원' }

export const SECTIONS = [
  { path: '', label: '오늘' },
  { path: 'orders', label: '주문' },
  { path: 'products', label: '상품' },
  { path: 'stock', label: '재고' },
  { path: 'tags', label: '태그·게이트' },
  { path: 'analytics', label: '분석' },
  { path: 'staff', label: '직원' },
  { path: 'settings', label: '설정' },
] as const

/** ERP 공통 틀: 왼쪽 메뉴 + 본문. 좁은 화면에서는 메뉴가 위로 올라간다 */
export function ErpShell({ me, onSignOut, base = '/erp', children }: { me: Me; onSignOut: () => void; base?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-wrap bg-erp-ground font-sans text-[15px] leading-normal text-ink">
      <nav aria-label="ERP 메뉴" className="flex flex-[1_1_220px] flex-col gap-6 border-r border-erp-line bg-white px-4 py-6">
        <div className="flex flex-col gap-0.5 px-2">
          <span className="text-xl font-extrabold tracking-[-0.02em]">POSTIC</span>
          <span className="text-xs text-erp-muted">
            매장 관리 · {me.display_name || me.email} ({ROLE[me.role]})
          </span>
        </div>
        <ul className="m-0 flex list-none flex-wrap gap-0.5 p-0 md:flex-col">
          {SECTIONS.map((s) => (
            <li key={s.path}>
              <NavLink
                to={s.path ? `${base}/${s.path}` : base}
                end={!s.path}
                className={({ isActive }) =>
                  `block px-2 py-2.5 no-underline ${isActive ? 'bg-erp-ground font-bold text-ink' : 'text-erp-muted hover:text-ink'}`
                }
              >
                {s.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-col gap-1 border-t border-erp-line px-2 pt-3 text-xs text-erp-muted">
          <span className="truncate">{me.email}</span>
          <button type="button" onClick={onSignOut} className="h-11 self-start text-left text-ink underline">
            로그아웃
          </button>
        </div>
      </nav>
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-8 px-5 pt-8 pb-12 md:px-10">{children}</main>
    </div>
  )
}

/** 로그인 전·권한 없음 같은 단일 패널 화면 */
export function ErpPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-erp-ground px-4 font-sans text-[15px] text-ink">
      <section className="flex w-full max-w-[400px] flex-col gap-6 border border-erp-line bg-white p-8">
        <div className="flex flex-col gap-1">
          <span className="text-xl font-extrabold tracking-[-0.02em]">POSTIC</span>
          <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.02em]">{title}</h1>
        </div>
        {children}
      </section>
    </div>
  )
}
