import { useState, type FormEvent } from 'react'
import { erp } from './client'
import { ErpPanel } from './ErpShell'

const INPUT = 'h-11 w-full border border-erp-line bg-white px-3 text-[15px] rounded-[2px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-erp-signal'

export function ErpLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await erp.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(error.message === 'Invalid login credentials' ? '이메일 또는 비밀번호가 맞지 않아요.' : '로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
  }

  return (
    <ErpPanel title="직원 로그인">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="erp-email" className="text-xs font-medium text-erp-muted">
            이메일
          </label>
          <input id="erp-email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="erp-password" className="text-xs font-medium text-erp-muted">
            비밀번호
          </label>
          <input
            id="erp-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={INPUT}
          />
        </div>
        {error && (
          <p role="alert" className="m-0 text-sm text-erp-critical">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="h-[52px] rounded-[2px] bg-ink text-[15px] font-semibold text-white hover:bg-black active:bg-[#333] disabled:bg-erp-line disabled:text-erp-muted"
        >
          {busy ? '로그인 중…' : '로그인'}
        </button>
      </form>
      <p className="m-0 text-xs text-erp-muted">계정은 매장 owner가 만들어 드려요. 손님 화면과는 따로 로그인됩니다.</p>
    </ErpPanel>
  )
}
