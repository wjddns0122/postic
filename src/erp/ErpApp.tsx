import { lazy, Suspense, useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { erp } from './client'
import { loadMe, type Me } from './api'
import { ErpLogin } from './ErpLogin'
import { ErpPanel, ErpShell } from './ErpShell'
import { Today } from './Today'

// 개발 서버에서만: /erp/preview 로 로그인 없이 시연일(11/13) 데이터로 화면을 본다. 배포 빌드에는 들어가지 않는다
const Preview = import.meta.env.DEV ? lazy(() => import('./Preview')) : null

const MONO_FONT = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap'

function useMonoFont() {
  useEffect(() => {
    if (document.querySelector(`link[href="${MONO_FONT}"]`)) return
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: MONO_FONT })
    document.head.appendChild(link)
  }, [])
}

const Loading = () => <p className="p-10 font-sans text-sm text-erp-muted">불러오는 중…</p>

/** 로그인 → 직원 확인 → ERP. 손님 화면과 별도 세션 */
function Gate() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const uid = session?.user.id

  useEffect(() => {
    erp.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = erp.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!uid) return setMe(undefined)
    loadMe()
      .then(setMe)
      .catch(() => setMe(null))
  }, [uid])

  const signOut = () => erp.auth.signOut()

  if (session === undefined) return <Loading />
  if (!session) return <ErpLogin />
  if (me === undefined) return <Loading />
  if (me === null)
    return (
      <ErpPanel title="직원으로 등록되지 않은 계정이에요">
        <p className="m-0 text-erp-muted">
          <span className="font-erp-mono text-ink">{session.user.email}</span> 계정은 아직 직원이 아니에요. 매장 owner에게 등록을 요청하세요.
        </p>
        <button type="button" onClick={signOut} className="h-11 rounded-[2px] border border-ink bg-white text-ink">
          다른 계정으로 로그인
        </button>
      </ErpPanel>
    )
  return (
    <ErpShell me={me} onSignOut={signOut}>
      <Today me={me} />
    </ErpShell>
  )
}

export default function ErpApp() {
  useMonoFont()
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        {Preview && <Route path="preview" element={<Preview />} />}
        <Route path="*" element={<Gate />} />
      </Routes>
    </Suspense>
  )
}
