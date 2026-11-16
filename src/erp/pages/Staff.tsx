import { useState, type FormEvent } from 'react'
import { erp } from '../client'
import { check } from '../api'
import { roleAtLeast, seoulStamp, type Role } from '../model'
import { Badge, BTN_PRIMARY, BTN_QUIET, ErrorBox, INPUT, Loading, MONO, PageHeader, Panel, RequireRole, TABLE, TableBox, TD, TH, useAction, useLoad, useMe } from '../ui'

const ROLES: { value: Role; label: string }[] = [
  { value: 'owner', label: 'owner' },
  { value: 'manager', label: '매니저' },
  { value: 'staff', label: '직원' },
]

function Body() {
  const me = useMe()
  const owner = roleAtLeast(me.role, 'owner')
  const { data, error, setError, reload } = useLoad(async () => check(await erp.rpc('erp_staff_list')) ?? [], [])
  const { busy, run } = useAction(reload, setError)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('staff')

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const ok = await run('add', async () => check(await erp.rpc('erp_add_staff', { p_email: email.trim(), p_role: role, p_name: name.trim() || undefined })))
    if (ok) {
      setEmail('')
      setName('')
      setRole('staff')
    }
  }

  return (
    <>
      <ErrorBox message={error} />
      {owner && (
        <Panel title="직원 등록">
          <form onSubmit={add} className="flex flex-wrap items-end gap-3 px-6 pb-5">
            <div className="flex flex-col gap-1">
              <label htmlFor="s-email" className="text-xs font-medium text-erp-muted">
                이메일
              </label>
              <input id="s-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${INPUT} w-64`} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="s-name" className="text-xs font-medium text-erp-muted">
                이름
              </label>
              <input id="s-name" value={name} onChange={(e) => setName(e.target.value)} className={`${INPUT} w-40`} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="s-role" className="text-xs font-medium text-erp-muted">
                역할
              </label>
              <select id="s-role" value={role} onChange={(e) => setRole(e.target.value as Role)} className={INPUT}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" disabled={busy === 'add'} className={BTN_PRIMARY}>
              {busy === 'add' ? '등록 중…' : '등록'}
            </button>
          </form>
          <p className="m-0 border-t border-erp-line px-6 py-3 text-xs text-erp-muted">
            먼저 Supabase 대시보드 → Authentication → Add user에서 계정을 만든 뒤(Auto Confirm 켜기), 그 이메일로 등록하세요. 비밀번호는 본인이 정합니다.
          </p>
        </Panel>
      )}

      <Panel title="직원" meta={data ? `${data.length}명` : undefined}>
        {!data && !error && (
          <div className="px-6 pb-5">
            <Loading />
          </div>
        )}
        {data && (
          <TableBox>
            <table className={`${TABLE} min-w-[640px]`}>
              <thead>
                <tr>
                  <th scope="col" className={TH}>이름</th>
                  <th scope="col" className={TH}>이메일</th>
                  <th scope="col" className={TH}>역할</th>
                  <th scope="col" className={TH}>상태</th>
                  <th scope="col" className={TH}>등록</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s) => (
                  <tr key={s.user_id}>
                    <td className={TD}>
                      {s.display_name || '—'}
                      {s.user_id === me.user_id && <span className="ml-2 text-xs text-erp-muted">나</span>}
                    </td>
                    <td className={`${TD} ${MONO} text-[13px]`}>{s.email}</td>
                    <td className={TD}>
                      {owner ? (
                        <select
                          aria-label={`${s.email} 역할`}
                          value={s.role}
                          disabled={busy === `role:${s.user_id}`}
                          onChange={(e) => run(`role:${s.user_id}`, async () => check(await erp.rpc('erp_update_staff', { p_user: s.user_id, p_role: e.target.value })))}
                          className={`${INPUT} text-sm`}
                        >
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        ROLES.find((r) => r.value === s.role)?.label
                      )}
                    </td>
                    <td className={TD}>
                      <div className="flex items-center gap-3">
                        {s.active ? <Badge tone="ok">활성</Badge> : <Badge tone="muted">비활성</Badge>}
                        {owner && (
                          <button
                            type="button"
                            disabled={busy === `active:${s.user_id}`}
                            onClick={() => run(`active:${s.user_id}`, async () => check(await erp.rpc('erp_update_staff', { p_user: s.user_id, p_active: !s.active })))}
                            className={BTN_QUIET}
                          >
                            {s.active ? '비활성화' : '다시 활성화'}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className={`${TD} ${MONO} text-[13px] text-erp-muted`}>{seoulStamp(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableBox>
        )}
      </Panel>
      {!owner && <p className="m-0 text-xs text-erp-muted">직원 등록과 역할 변경은 owner만 할 수 있어요.</p>}
    </>
  )
}

export default function Staff() {
  return (
    <>
      <PageHeader title="직원" sub="직원마다 개인 계정으로 로그인하고, 모든 변경은 작업 기록에 남아요." />
      <RequireRole min="manager">
        <Body />
      </RequireRole>
    </>
  )
}
