import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL as string
export const supabase = createClient(URL, import.meta.env.VITE_SUPABASE_ANON_KEY as string)
export const INGEST_URL = `${URL}/functions/v1/g1-ingest?key=${import.meta.env.VITE_INGEST_KEY}`
export const IBEACON_UUID = '504F5354494300000000000000000001'

export type Product = {
  id: string
  name: string
  brand: string
  price: number
  color: string | null
  material: string | null
  emoji: string
  image_url: string | null
  /** 뒷면 스튜디오 컷 (상품 화면 "돌려보기") */
  back_image_url: string | null
  /** 3D 스캔 GLB (웹 3D·안드로이드 AR), USDZ (아이폰 AR Quick Look) */
  model_url: string | null
  model_usdz_url: string | null
  sizes: Record<string, number>
  major: number
  minor: number
  mac: string | null
  hanger: string
  zone: string
  sort: number
}

export type Presence = {
  key: string
  major: number
  minor: number
  rssi: number | null
  last_seen: string
  gateway: string | null
  simulated: boolean
}

export type Order = {
  id: string
  product_id: string
  size: string | null
  type: 'purchase' | 'fitting'
  status: 'preparing' | 'ready' | 'done'
  pickup_code: string
  amount: number
  pay_method: string | null
  device_id: string | null
  created_at: string
}

export type Settings = { id: number; rssi_threshold: number; online_seconds: number }

export const tagKey = (p: { major: number; minor: number }) => `${p.major}-${p.minor}`

// jsonb는 키 순서를 보장하지 않아서 사이즈 순서를 고정한다
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL']
export const sizeList = (p: Product) =>
  Object.entries(p.sizes).sort(([a], [b]) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b))
export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

export const STATUS_LABEL: Record<Order['type'], Record<Order['status'], string>> = {
  purchase: { preparing: '포장 준비 중', ready: '픽업 대기', done: '수령 완료' },
  fitting: { preparing: '직원 준비 중', ready: '피팅룸 준비 완료', done: '피팅 종료' },
}

// 기기 토큰: 이 브라우저를 구분하는 랜덤 ID. 로그인 없이 "내 주문"을 가려내고,
// 서버(place_order)가 기기당 주문 수를 제한하는 데 쓴다
const DEVICE_KEY = 'postic_device'
let memDevice = ''
function randomId() {
  // randomUUID는 https/localhost에서만 있어서, 같은 Wi-Fi의 http 주소용 대체 경로를 둔다
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = randomId()
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return (memDevice ||= randomId())
  }
}
/** 화면 표시용 짧은 토큰 (예: 7F3A-91C2) */
export const deviceLabel = () => {
  const h = deviceId().replace(/-/g, '').toUpperCase()
  return `${h.slice(0, 4)}-${h.slice(4, 8)}`
}

// 이 기기에서 만든 주문 id (기기 토큰이 생기기 전 주문 호환용)
const MY_KEY = 'postic_my_orders'
export function myOrderIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem(MY_KEY) || '[]')
  } catch {
    return []
  }
}
export function rememberOrder(id: string) {
  try {
    localStorage.setItem(MY_KEY, JSON.stringify([id, ...myOrderIds()].slice(0, 20)))
  } catch {
    /* private mode */
  }
}
export const isMine = (o: Order) => o.device_id === deviceId() || myOrderIds().includes(o.id)

const ORDER_ERROR: Record<string, string> = {
  rate_limited: '이 기기에서 주문이 너무 많아요. 10분 뒤에 다시 시도해 주세요.',
  invalid_size: '선택한 사이즈를 찾을 수 없어요.',
}

/** 주문 생성은 서버 함수로만: 금액은 서버가 상품가로 정하고 기기당 10분 5건까지 */
export async function createOrder(o: { product_id: string; size: string; type: Order['type']; pay_method?: string }) {
  const { data, error } = await supabase.rpc('place_order', {
    p_device: deviceId(),
    p_product: o.product_id,
    p_size: o.size,
    p_type: o.type,
    p_pay_method: o.pay_method ?? null,
  })
  if (error) throw new Error(ORDER_ERROR[error.message] ?? '주문을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.')
  const order = data as Order
  rememberOrder(order.id)
  return order
}

// 직원 PIN: 주문 상태·인식 기준 변경은 PIN을 확인하는 서버 함수로만 가능
const PIN_KEY = 'postic_staff_pin'
export function staffPin(): string {
  try {
    return localStorage.getItem(PIN_KEY) ?? ''
  } catch {
    return ''
  }
}
export function forgetStaffPin() {
  try {
    localStorage.removeItem(PIN_KEY)
  } catch {
    /* private mode */
  }
}
export async function staffLogin(pin: string) {
  const { data } = await supabase.rpc('staff_check', { p_pin: pin })
  if (data === true) {
    try {
      localStorage.setItem(PIN_KEY, pin)
    } catch {
      /* private mode: 이번 탭에서만 유지 */
    }
  }
  return data === true
}
export const staffSetStatus = (id: string, status: Order['status']) =>
  supabase.rpc('staff_set_order_status', { p_pin: staffPin(), p_order: id, p_status: status })
export const staffUpdateSettings = (patch: { rssi_threshold?: number; online_seconds?: number }) =>
  supabase.rpc('staff_update_settings', {
    p_pin: staffPin(),
    p_rssi: patch.rssi_threshold ?? null,
    p_online: patch.online_seconds ?? null,
  })
