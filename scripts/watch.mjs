// 시연 중 실시간 모니터: 배포 서버(Vercel)·DB를 바꾸지 않고 anon 키로 읽기만 한다.
//   - 게이트웨이(G1) 업로드가 살아 있는지, 지연이 몇 초인지
//   - 태그 3개 온라인/오프라인 전환
//   - 새 주문, 주문 상태 변경(준비 중 → 준비 완료 → 완료)
//   - 30초마다 한 줄 요약
// 사용: node scripts/watch.mjs   (끄기: Ctrl+C)
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })

const C = { dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', mag: '\x1b[35m', cyan: '\x1b[36m', off: '\x1b[0m' }
const now = () => new Date().toTimeString().slice(0, 8)
const log = (color, tag, msg) => console.log(`${C.dim}${now()}${C.off} ${color}${tag.padEnd(6)}${C.off} ${msg}`)
const ago = (iso) => (iso ? (Date.now() - new Date(iso).getTime()) / 1000 : Infinity)
const sec = (s) => (Number.isFinite(s) ? `${s.toFixed(1)}s` : '-')
const dev = (id) => (id ? id.replace(/-/g, '').slice(0, 8).toUpperCase().replace(/(.{4})/, '$1-') : '----')
const STATUS = { preparing: '준비 중', ready: '준비 완료', done: '완료' }
const TYPE = { purchase: '구매', fitting: '피팅' }

let products = new Map()
let onlineSec = 10
const tagState = new Map() // key → online
const orderState = new Map() // id → status
let firstOrders = true
let gwAlive = null
let lastGwLag = NaN
let errStreak = 0

async function loadStatic() {
  const [{ data: ps }, { data: st }] = await Promise.all([
    sb.from('products').select('id,name,major,minor'),
    sb.from('settings').select('*').eq('id', 1).single(),
  ])
  if (ps) products = new Map(ps.map((p) => [p.id, p]))
  if (st?.online_seconds) onlineSec = st.online_seconds
}
const nameOf = (id) => products.get(id)?.name ?? id
const nameByKey = (key) => [...products.values()].find((p) => `${p.major}-${p.minor}` === key)?.name ?? key

function fail(where, error) {
  errStreak++
  if (errStreak === 1 || errStreak % 10 === 0) log(C.red, 'ERROR', `${where}: ${error.message ?? error} (연속 ${errStreak}회)`)
}

async function tickPresence() {
  const [{ data: tags, error: e1 }, { data: raw, error: e2 }] = await Promise.all([
    sb.from('tag_presence').select('key,rssi,last_seen,gateway,simulated'),
    sb.from('gateway_raw').select('received_at').eq('id', 1).maybeSingle(),
  ])
  if (e1 || e2) return fail('태그 조회', e1 ?? e2)
  if (errStreak) log(C.green, 'OK', `조회 복구 (${errStreak}회 실패 후)`)
  errStreak = 0

  const lag = ago(raw?.received_at)
  lastGwLag = lag
  const alive = lag < 10
  if (gwAlive !== alive) {
    if (alive) log(C.green, 'GW', `G1 업로드 수신 중 (마지막 ${sec(lag)} 전)`)
    else log(C.red, 'GW', `G1 업로드 끊김: 마지막 수신 ${sec(lag)} 전. 핫스팟·G1 전원 확인`)
    gwAlive = alive
  }

  for (const t of tags ?? []) {
    if (t.simulated) continue
    const on = ago(t.last_seen) <= onlineSec
    if (tagState.get(t.key) !== on) {
      const label = `${nameByKey(t.key)} [${t.key}]`
      if (on) log(C.green, 'TAG', `${label} 감지됨 · RSSI ${t.rssi} · ${t.gateway ?? '-'}`)
      else if (tagState.has(t.key)) log(C.yellow, 'TAG', `${label} 감지 안 됨 (${sec(ago(t.last_seen))} 동안 신호 없음)`)
      else log(C.dim, 'TAG', `${label} 감지 안 됨`)
      tagState.set(t.key, on)
    }
  }
}

async function tickOrders() {
  const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending: false }).limit(200)
  if (error) return fail('주문 조회', error)
  for (const o of [...data].reverse()) {
    const prev = orderState.get(o.id)
    if (prev === undefined) {
      if (!firstOrders)
        log(C.cyan, 'ORDER', `새 ${TYPE[o.type] ?? o.type} #${o.pickup_code} · ${nameOf(o.product_id)} ${o.size ?? ''} · ${o.amount?.toLocaleString?.() ?? o.amount}원 · 기기 ${dev(o.device_id)}`)
    } else if (prev !== o.status) {
      log(C.mag, 'STATUS', `#${o.pickup_code} ${nameOf(o.product_id)}: ${STATUS[prev] ?? prev} → ${STATUS[o.status] ?? o.status}`)
    }
    orderState.set(o.id, o.status)
  }
  if (firstOrders) {
    log(C.blue, 'INFO', `기존 주문 ${data.length}건 (이후 새 주문·상태 변경만 표시)`)
    firstOrders = false
  }
}

async function summary() {
  const { data, error } = await sb.from('orders').select('status,device_id,created_at').order('created_at', { ascending: false }).limit(1000)
  if (error) return fail('요약', error)
  const by = (s) => data.filter((o) => o.status === s).length
  const tenMin = data.filter((o) => ago(o.created_at) < 600)
  const devices = new Set(data.map((o) => o.device_id).filter(Boolean)).size
  const on = [...tagState.values()].filter(Boolean).length
  log(
    C.dim,
    'SUM',
    `태그 ${on}/${tagState.size} · G1 지연 ${sec(lastGwLag)} · 주문 ${data.length}건 (준비 중 ${by('preparing')} / 준비 완료 ${by('ready')} / 완료 ${by('done')}) · 최근 10분 ${tenMin.length}건 · 주문한 기기 ${devices}대`,
  )
}

const every = (ms, fn) => {
  let busy = false
  const run = async () => {
    if (busy) return
    busy = true
    try {
      await fn()
    } catch (e) {
      fail(fn.name, e)
    } finally {
      busy = false
    }
  }
  run()
  return setInterval(run, ms)
}

log(C.blue, 'INFO', '실시간 모니터 시작 (읽기 전용, Ctrl+C로 종료)')
await loadStatic()
every(2000, tickPresence)
every(3000, tickOrders)
every(60_000, loadStatic)
setTimeout(() => every(30_000, summary), 4000)
