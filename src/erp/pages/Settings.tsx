import { useEffect, useState, type FormEvent } from 'react'
import { erp } from '../client'
import { check } from '../api'
import { BTN_PRIMARY, ErrorBox, INPUT, Loading, MONO, PageHeader, Panel, RequireRole, useAction, useLoad } from '../ui'

function Body() {
  const { data, error, setError, reload } = useLoad(async () => check(await erp.from('settings').select('rssi_threshold, online_seconds, block_oversell').eq('id', 1).single()), [])
  const { busy, run } = useAction(reload, setError)
  const [rssi, setRssi] = useState('')
  const [online, setOnline] = useState('')
  const [block, setBlock] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!data) return
    setRssi(String(data.rssi_threshold))
    setOnline(String(data.online_seconds))
    setBlock(data.block_oversell)
  }, [data])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaved(false)
    const ok = await run('save', async () =>
      check(await erp.rpc('erp_update_settings', { p_rssi: Number(rssi), p_online: Number(online), p_block_oversell: block })),
    )
    setSaved(ok)
  }

  if (!data) return error ? <ErrorBox message={error} /> : <Loading />

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <ErrorBox message={error} />
      <Panel title="태그 인식">
        <div className="grid gap-6 px-6 pb-6 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="rssi" className="text-xs font-medium text-erp-muted">
              신호 기준 (dBm, -100 ~ -30)
            </label>
            <input id="rssi" type="number" min={-100} max={-30} required value={rssi} onChange={(e) => setRssi(e.target.value)} className={`${INPUT} ${MONO}`} />
            <p className="m-0 text-xs text-erp-muted">이보다 약한 신호는 "행거에 없음"으로 봐요. 높일수록(-60 등) 게이트 가까이 있어야 인식돼요.</p>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="online" className="text-xs font-medium text-erp-muted">
              인식 유지 시간 (초, 2 ~ 60)
            </label>
            <input id="online" type="number" min={2} max={60} required value={online} onChange={(e) => setOnline(e.target.value)} className={`${INPUT} ${MONO}`} />
            <p className="m-0 text-xs text-erp-muted">마지막 수신 후 이 시간이 지나면 "감지 안 됨"으로 바뀌어요.</p>
          </div>
        </div>
      </Panel>
      <Panel title="판매">
        <label className="flex items-start gap-3 px-6 pb-6">
          <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} className="mt-1.5" />
          <span className="flex flex-col gap-1">
            <span className="font-semibold">재고 0인 사이즈는 구매 막기</span>
            <span className="text-xs text-erp-muted">
              켜면 품절 사이즈의 구매 주문이 막혀요. 지금 손님 화면은 이 안내 문구를 모르니, 손님 화면을 고친 뒤에 켜는 걸 권해요. 꺼져 있으면 재고가 음수가 될 수 있어요.
            </span>
          </span>
        </label>
      </Panel>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy === 'save'} className={BTN_PRIMARY}>
          {busy === 'save' ? '저장 중…' : '저장'}
        </button>
        {saved && <span role="status" className="text-sm text-erp-muted">저장했어요. 손님 화면과 게이트 판단에 바로 반영돼요.</span>}
      </div>
    </form>
  )
}

export default function Settings() {
  return (
    <>
      <PageHeader title="설정" sub="매장 전체에 바로 적용돼요. 변경은 작업 기록에 남아요." />
      <RequireRole min="manager">
        <Body />
      </RequireRole>
    </>
  )
}
