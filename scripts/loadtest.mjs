// 트래픽 테스트: 가상 기기 N대가 실제 앱(src/live.tsx)과 똑같이 접속한다
//   - 첫 화면 데이터 4종 조회 → 내 기기 채널(Broadcast device:<토큰>) 구독
//   - 태그 상태 2초, 주문·설정 6초마다 조회
//   - 일부 기기는 주문(place_order). 60% 지점에서 직원이 그 주문들을 "준비 완료"로 바꾸고,
//     각 기기에 자기 주문 변경이 몇 ms 만에 도착하는지 잰다 (직원 화면 2대는 staff:orders 구독)
//   - 한 기기가 연속 6건 주문 → 6번째가 막히는지(기기당 10분 5건) 확인
// 사용: node scripts/loadtest.mjs [기기 수=120] [시간(초)=60] [주문 기기 비율=0.3]
// 끝나면 device_id가 'loadtest-'로 시작하는 주문을 지울 것 (README 참고)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const URL_ = env.VITE_SUPABASE_URL
const KEY = env.VITE_SUPABASE_ANON_KEY
const PIN = env.STAFF_PIN
const N = Number(process.argv[2] ?? 120)
const SEC = Number(process.argv[3] ?? 60)
const ORDER_RATIO = Number(process.argv[4] ?? 0.3)
const RUN = `loadtest-${Date.now().toString(36)}`

const pct = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((a.length * p) / 100))] : NaN)
const ms = (n) => (Number.isFinite(n) ? `${Math.round(n)}ms` : '-')
const sleep = (t) => new Promise((r) => setTimeout(r, t))
const client = () => createClient(URL_, KEY, { auth: { persistSession: false } })

const s = { subOk: 0, subFail: 0, initLat: [], initErr: 0, pollLat: [], pollErr: 0, listLat: [], listErr: 0, orderLat: [], orderOk: 0, orderErr: {} }
const placed = [] // { id, dev }
const sentAt = new Map() // order id → 직원 변경 시각
const own = [] // 자기 주문 "준비 완료" 도착 지연
const staffGot = [0, 0]
const clients = []
let stopping = false

async function device(i) {
  const sb = client()
  clients.push(sb)
  const dev = `${RUN}-${i}`

  const t = performance.now()
  const res = await Promise.all([
    sb.from('products').select('*').order('sort'),
    sb.from('tag_presence').select('*'),
    sb.from('orders').select('*').order('created_at', { ascending: false }).limit(100),
    sb.from('settings').select('*').eq('id', 1).single(),
  ])
  if (res.some((r) => r.error)) s.initErr++
  else s.initLat.push(performance.now() - t)
  const products = res[0].data ?? []

  sb.channel(`device:${dev}`)
    .on('broadcast', { event: 'order' }, ({ payload }) => {
      if (payload?.status === 'ready' && sentAt.has(payload.id)) own.push(performance.now() - sentAt.get(payload.id))
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') s.subOk++
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') s.subFail++
    })

  if (Math.random() < ORDER_RATIO && products.length) {
    setTimeout(async () => {
      if (stopping) return
      const p = products[i % products.length]
      const t1 = performance.now()
      const { data, error } = await sb.rpc('place_order', {
        p_device: dev,
        p_product: p.id,
        p_size: Object.keys(p.sizes)[0],
        p_type: i % 2 ? 'purchase' : 'fitting',
        p_pay_method: 'POSTIC Pay · 카드',
      })
      if (error) s.orderErr[error.message] = (s.orderErr[error.message] ?? 0) + 1
      else {
        s.orderOk++
        s.orderLat.push(performance.now() - t1)
        placed.push({ id: data.id, dev })
      }
    }, Math.random() * SEC * 500)
  }

  let tick = 0
  while (!stopping) {
    await sleep(2000)
    if (stopping) break
    const t2 = performance.now()
    const { error } = await sb.from('tag_presence').select('*')
    if (error) s.pollErr++
    else s.pollLat.push(performance.now() - t2)
    if (++tick % 3 === 0) {
      const t3 = performance.now()
      const r = await Promise.all([
        sb.from('orders').select('*').order('created_at', { ascending: false }).limit(100),
        sb.from('settings').select('*').eq('id', 1).single(),
      ])
      if (r.some((x) => x.error)) s.listErr++
      else s.listLat.push(performance.now() - t3)
    }
  }
}

async function rateLimitCheck() {
  const sb = client()
  const { data: products } = await sb.from('products').select('*').limit(1)
  const p = products[0]
  const results = []
  for (let k = 0; k < 6; k++) {
    const { error } = await sb.rpc('place_order', { p_device: `${RUN}-burst`, p_product: p.id, p_size: Object.keys(p.sizes)[0], p_type: 'fitting' })
    results.push(error ? error.message : 'ok')
  }
  return results
}

async function writeLockCheck() {
  const sb = client()
  // 실제 값을 바꾸지 않도록 지금 값 그대로 써 본다
  const { data: cur } = await sb.from('settings').select('*').eq('id', 1).single()
  const u = await sb.from('settings').update({ online_seconds: cur.online_seconds }).eq('id', 1).select()
  const badPin = await sb.rpc('staff_update_settings', { p_pin: '000000', p_online: cur.online_seconds })
  return {
    direct: u.error ? `막힘 (${u.error.message})` : u.data?.length ? '열려 있음 (2단계 적용 전)' : '막힘 (0행)',
    wrongPin: badPin.error ? `막힘 (${badPin.error.message})` : '통과됨!',
  }
}

console.log(`트래픽 테스트 시작: 가상 기기 ${N}대 + 직원 화면 2대, ${SEC}초, 주문 비율 ${ORDER_RATIO} (run ${RUN})`)
const started = performance.now()
for (const k of [0, 1]) {
  const sb = client()
  clients.push(sb)
  sb.channel('staff:orders')
    .on('broadcast', { event: 'order' }, ({ payload }) => payload?.device_id?.startsWith(RUN) && staffGot[k]++)
    .subscribe()
}
// 채널 접속은 초당 100회 한도라서 5초에 걸쳐 나눠 붙는다
for (let i = 0; i < N; i++) {
  device(i)
  await sleep(5000 / N)
}

// 60% 지점: 직원이 테스트 주문을 전부 "준비 완료"로 (동시 4건씩)
await sleep(Math.max(0, SEC * 600 - (performance.now() - started)))
const staff = client()
let staffErr = 0
const queue = [...placed]
await Promise.all(
  [0, 1, 2, 3].map(async () => {
    for (let o; (o = queue.shift()); ) {
      sentAt.set(o.id, performance.now())
      const { error } = await staff.rpc('staff_set_order_status', { p_pin: PIN, p_order: o.id, p_status: 'ready' })
      if (error) staffErr++
    }
  }),
)
const changed = sentAt.size

const burst = await rateLimitCheck()
const lock = await writeLockCheck()
await sleep(Math.max(0, SEC * 1000 - (performance.now() - started)))
stopping = true
await sleep(500)
await Promise.all(clients.map((c) => c.removeAllChannels()))

console.log('\n=== 결과 ===')
console.log(`실시간 채널      성공 ${s.subOk}/${N}  실패 ${s.subFail}`)
console.log(`첫 화면 조회     p50 ${ms(pct(s.initLat, 50))}  p95 ${ms(pct(s.initLat, 95))}  실패 ${s.initErr}`)
console.log(`태그 2초 조회    ${s.pollLat.length}회  p50 ${ms(pct(s.pollLat, 50))}  p95 ${ms(pct(s.pollLat, 95))}  최대 ${ms(Math.max(...s.pollLat))}  실패 ${s.pollErr}`)
console.log(`주문·설정 6초    ${s.listLat.length}회  p50 ${ms(pct(s.listLat, 50))}  p95 ${ms(pct(s.listLat, 95))}  실패 ${s.listErr}`)
console.log(`주문 생성        성공 ${s.orderOk}  p50 ${ms(pct(s.orderLat, 50))}  p95 ${ms(pct(s.orderLat, 95))}  실패 ${JSON.stringify(s.orderErr)}`)
console.log(`직원 → 손님 전파 ${own.length}/${changed}건 도착  p50 ${ms(pct(own, 50))}  p95 ${ms(pct(own, 95))}  최대 ${ms(Math.max(...own))}  직원 RPC 실패 ${staffErr}`)
console.log(`직원 화면 수신   ${staffGot.join(' / ')}건 (테스트 주문 생성+변경, 기대 ${s.orderOk + changed + 6 - burst.filter((b) => b !== 'ok').length}건)`)
console.log(`기기당 주문 제한 연속 6건 → ${burst.join(', ')}`)
console.log(`직접 쓰기 차단   설정 직접 수정: ${lock.direct} / 틀린 PIN: ${lock.wrongPin}`)
console.log(`정리용 run id    ${RUN}`)
process.exit(0)
