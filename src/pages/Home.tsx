import { Link } from 'react-router-dom'
import { deviceLabel, isMine, type Product } from '../lib'
import { useLive } from '../live'
import {
  AdminLink,
  Button,
  Card,
  HangerCard,
  icons,
  OnlinePill,
  OrderCard,
  PromoCard,
  Screen,
  SectionHeader,
  StatTile,
  TopBar,
} from '../ui'
import decoHeroA from '../assets/figma/deco-hero-a-602c2.svg'
import decoHeroB from '../assets/figma/deco-hero-b-55d92.svg'
import ringBlack from '../assets/figma/thumb-ring-black-93641.svg'
import ringBeige from '../assets/figma/thumb-ring-beige-84158.svg'
import ringWhite from '../assets/figma/thumb-ring-white-53a98.svg'

const RING: Record<string, string> = { 블랙: ringBlack, 베이지: ringBeige, 화이트: ringWhite }

function HeroThumb({ p }: { p: Product }) {
  if (p.image_url) return <img src={p.image_url} alt={p.name} className="size-16 rounded-2xl object-cover ring-2 ring-white" />
  return (
    <div className="relative size-16 shrink-0">
      <img src={RING[p.color ?? ''] ?? ringBlack} alt={p.name} className="absolute inset-[-3.13%] block size-[106.25%] max-w-none" />
    </div>
  )
}

export default function Home() {
  const { products, isOnline, online, orders, seen, now, reload } = useLive()
  const myOrder = orders.find((o) => isMine(o) && o.status !== 'done')
  const myProduct = myOrder && products.find((p) => p.id === myOrder.product_id)

  const hangers = Object.entries(
    products.reduce<Record<string, Product[]>>((acc, p) => ((acc[p.hanger] ??= []).push(p), acc), {}),
  )
  const firstHanger = hangers[0]?.[0] ?? 'HG-01'

  const lastSeenAt = Math.max(0, ...online.map((p) => seen(p)?.seenAt ?? 0))
  const ago = lastSeenAt ? Math.max(0, Math.round((now - lastSeenAt) / 1000)) : null
  const updated = ago === null ? '—' : ago < 3 ? '방금' : `${ago}초 전`

  return (
    <Screen className="md:gap-6 md:pt-6">
      <TopBar />

      {/* check-in hero */}
      <section className="relative flex w-full flex-col gap-3 overflow-hidden rounded-3xl bg-ink p-5 shadow-md md:gap-5 md:p-8">
        <img src={decoHeroA} alt="" className="pointer-events-none absolute top-[-120px] right-[-80px] size-[240px] max-w-none" />
        <img src={decoHeroB} alt="" className="pointer-events-none absolute top-10 right-[120px] size-[160px] max-w-none" />
        <div className="relative flex w-full items-center">
          <OnlinePill count={online.length} />
          <div className="flex-1" />
          <Button variant="secondary" onClick={reload} className="h-11 w-[104px]">
            다시 스캔
          </Button>
        </div>
        <div className="relative flex w-full items-end gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-1 md:pt-2">
            <span className="t-meta text-faint">지금 앞에 걸린 옷</span>
            <span className="t-title text-white">{online.length > 0 ? `${online.length}벌이 인식됐어요` : '옷을 찾고 있어요'}</span>
          </div>
          <div className="hidden gap-2 md:flex">
            {online.slice(0, 3).map((p) => (
              <HeroThumb key={p.id} p={p} />
            ))}
          </div>
        </div>
      </section>

      {/* promo carousel: 모바일 가로 스크롤, 태블릿 이상 3열 */}
      <div className="no-scrollbar flex w-full gap-3 overflow-x-auto md:grid md:grid-cols-3 md:overflow-visible">
        <Link to={`/hanger/${firstHanger}`} className="shrink-0">
          <PromoCard
            kind="hanger"
            title="지금 앞에 걸린 옷"
            sub={`행거 ${firstHanger} · ${online.length}벌 인식됨`}
            className="w-[280px] md:w-full"
          />
        </Link>
        <Link to="/fitting" className="shrink-0">
          <PromoCard kind="fitting" title="피팅룸 FR-03" sub="요청하면 바로 배정돼요" className="w-[280px] md:w-full" />
        </Link>
        <Link to="/pickup" className="shrink-0">
          <PromoCard kind="pickup" title="1F 픽업 데스크" sub="입구 좌측 · 번호로 받아가세요" className="w-[280px] md:w-full" />
        </Link>
      </div>

      <div className="grid w-full gap-4 md:grid-cols-2 md:gap-6">
        <div className="flex flex-col gap-4 md:gap-6">
          <div className="flex w-full gap-3">
            <StatTile icon="door" value="FR-03" label="피팅룸" to="/fitting" />
            <StatTile icon="bag" value="1F" label="픽업 데스크" to="/pickup" />
            <StatTile icon="clock" value={updated} label="갱신" onClick={reload} />
          </div>

          <section className="flex flex-col gap-3">
            <SectionHeader title="내 진행 상황" meta={myOrder ? '1건' : undefined} />
            {myOrder && myProduct ? (
              <OrderCard order={myOrder} product={myProduct} />
            ) : (
              <Card className="flex items-center gap-3 p-5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-bg">
                  <img src={icons.iconBagMuted} alt="" className="size-5" />
                </span>
                <span className="t-body text-sub">진행 중인 주문이 없어요</span>
              </Card>
            )}
          </section>
        </div>

        <section className="flex flex-col gap-3">
          <SectionHeader title="인식 행거" meta={hangers.map(([h]) => h).join(' · ')} />
          {hangers.map(([hanger, items]) => (
            <HangerCard key={hanger} id={hanger} items={items} onCount={items.filter(isOnline).length} />
          ))}
        </section>
      </div>

      <AdminLink />
      <p className="t-meta -mt-2 text-center text-faint">이 기기 토큰 · {deviceLabel()}</p>
    </Screen>
  )
}
