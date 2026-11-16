import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Me } from './api'

const ROLE: Record<Me['role'], string> = { owner: 'owner', manager: '매니저', staff: '직원' }

// 아직 화면이 없는 메뉴는 링크 대신 "준비 중"으로 둔다 (눌러도 갈 곳이 없는 링크를 만들지 않음)
const SOON = ['주문', '상품', '재고', '태그·게이트', '분석', '직원', '설정']

/** ERP 공통 틀: 왼쪽 메뉴 + 본문. 좁은 화면에서는 메뉴가 위로 올라간다 */
export function ErpShell({ me, onSignOut, children }: { me: Me; onSignOut: () => void; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-wrap bg-erp-ground font-sans text-[15px] leading-normal text-ink">
      <nav aria-label="ERP 메뉴" className="flex flex-[1_1_220px] flex-col gap-6 border-r border-erp-line bg-white px-4 py-6">
        <div className="flex flex-col gap-0.5 px-2">
          <span className="text-xl font-extrabold tracking-[-0.02em]">POSTIC</span>
          <span className="text-xs text-erp-muted">
            매장 관리 · {me.display_name || me.email} ({ROLE[me.role]})
          </span>
        </div>
        <ul className="flex flex-col gap-0.5">
          <li>
            <Link to="/erp" aria-current="page" className="block bg-erp-ground px-2 py-2.5 font-bold text-ink no-underline">
              오늘
            </Link>
          </li>
          {SOON.map((label) => (
            <li key={label} className="flex items-center justify-between px-2 py-2.5 text-erp-muted">
              {label}
              <span className="text-xs">준비 중</span>
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
