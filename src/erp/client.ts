import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

// 직원용 클라이언트. 로그인 세션을 손님 화면 클라이언트와 따로 저장해서,
// 같은 브라우저로 손님 화면을 열어도 직원 권한(숨긴 상품 보기 등)이 섞이지 않게 한다.
export const erp = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  { auth: { storageKey: 'postic-erp-auth', persistSession: true, autoRefreshToken: true } },
)
