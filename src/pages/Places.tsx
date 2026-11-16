import { useNavigate } from 'react-router-dom'
import { isMine, type Order } from '../lib'
import { useLive } from '../live'
import {
  BackBar,
  Button,
  Card,
  FITTING_ROOM,
  FITTING_SPOT,
  icons,
  OrderCard,
  PromoCard,
  Screen,
  SectionHeader,
  StatTile,
} from '../ui'

/** 피팅 예상 대기: 앞 팀당 약 2분 (Order.tsx와 같은 가정) */
const MIN_PER_TEAM = 2

function StateBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1 ${ok ? 'bg-ok-soft' : 'bg-caution-soft'}`}>
      <span className={`pulse-dot size-2 rounded-full ${ok ? 'bg-ok' : 'bg-caution'}`} />
      <span className={`t-meta ${ok ? 'text-ok-text' : 'text-caution-text'}`}>{label}</span>
    </span>
  )
}

function Steps({ items }: { items: string[] }) {
  return (
    <Card className="flex flex-col px-5 py-2">
      {items.map((t, i) => (
        <div key={t} className={`flex items-center gap-3 py-3 ${i < items.length - 1 ? 'border-b border-line' : ''}`}>
          <span className="t-meta flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand">{i + 1}</span>
          <span className="t-body">{t}</span>
        </div>
      ))}
    </Card>
  )
}

function EmptyCard({ text }: { text: string }) {
  return (
    <Card className="flex items-center gap-3 p-5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-bg">
        <img src={icons.iconBagMuted} alt="" className="size-5" />
      </span>
      <span className="t-body text-sub">{text}</span>
    </Card>
  )
}

/** 장소 화면 공통 데이터: 내 진행 중 주문과 행거 바로가기 */
function usePlace(type: Order['type']) {
  const { orders, products, online } = useLive()
  const myOrders = orders
    .filter((o) => o.type === type && o.status !== 'done' && isMine(o))
    .map((o) => ({ o, p: products.find((p) => p.id === o.product_id) }))
    .filter((x) => x.p)
  const count = (s: Order['status']) => orders.filter((o) => o.type === type && o.status === s).length
  const hanger = products[0]?.hanger ?? 'HG-01'
  return { myOrders, count, hanger, online }
}

export function FittingPage() {
  const nav = useNavigate()
  const { myOrders, count, hanger, online } = usePlace('fitting')
  const queue = count('preparing')
  const wait = queue === 0 ? '바로 입장' : `약 ${queue * MIN_PER_TEAM}분`

  return (
    <Screen className="md:gap-6 md:pt-6">
      <BackBar title="피팅룸" />
      <div className="grid w-full gap-4 md:grid-cols-2 md:gap-6">
        <div className="flex flex-col gap-4 md:gap-6">
          <PromoCard
            big
            kind="fitting"
            caption="배정 피팅룸"
            title={`피팅룸 ${FITTING_ROOM}`}
            sub={`${FITTING_SPOT} · 요청하면 바로 배정돼요`}
            badge={<StateBadge ok={queue === 0} label={queue === 0 ? '사용 가능' : `대기 ${queue}팀`} />}
          />
          <div className="flex w-full gap-3">
            <StatTile icon="door" value={`${queue}팀`} label="준비 중인 요청" />
            <StatTile icon="clock" value={wait} label="예상 대기" />
            <StatTile icon="hanger" value={`${online.length}벌`} label="앞에 걸린 옷" to={`/hanger/${hanger}`} />
          </div>
        </div>

        <div className="flex flex-col gap-4 md:gap-6">
          <section className="flex flex-col gap-3">
            <SectionHeader title="내 피팅 요청" meta={myOrders.length ? `${myOrders.length}건` : undefined} />
            {myOrders.length ? (
              myOrders.map(({ o, p }) => <OrderCard key={o.id} order={o} product={p!} />)
            ) : (
              <EmptyCard text="아직 피팅 요청이 없어요" />
            )}
          </section>
          <section className="flex flex-col gap-3">
            <SectionHeader title="이용 방법" />
            <Steps
              items={[
                '행거 앞에서 마음에 드는 옷을 골라요',
                "사이즈를 고르고 '피팅하기'를 눌러요",
                `직원이 ${FITTING_ROOM}에 옷을 가져다 둬요`,
                "'입장 가능' 알림이 오면 들어가요",
              ]}
            />
          </section>
          <Button className="w-full" onClick={() => nav(`/hanger/${hanger}`)}>
            옷 고르러 가기
          </Button>
        </div>
      </div>
    </Screen>
  )
}

export function PickupPage() {
  const nav = useNavigate()
  const { myOrders, count, hanger } = usePlace('purchase')
  const preparing = count('preparing')
  const ready = count('ready')

  return (
    <Screen className="md:gap-6 md:pt-6">
      <BackBar title="픽업 데스크" />
      <div className="grid w-full gap-4 md:grid-cols-2 md:gap-6">
        <div className="flex flex-col gap-4 md:gap-6">
          <PromoCard
            big
            kind="pickup"
            caption="픽업 데스크"
            title="1F 입구 좌측"
            sub="결제한 옷은 번호로 받아가세요"
            badge={<StateBadge ok label="운영 중" />}
          />
          <div className="flex w-full gap-3">
            <StatTile icon="bag" value={`${preparing}건`} label="포장 준비 중" />
            <StatTile icon="clock" value={`${ready}건`} label="픽업 대기" />
            <StatTile icon="door" value={FITTING_ROOM} label="피팅룸" to="/fitting" />
          </div>
        </div>

        <div className="flex flex-col gap-4 md:gap-6">
          <section className="flex flex-col gap-3">
            <SectionHeader title="내 픽업 번호" meta={myOrders.length ? `${myOrders.length}건` : undefined} />
            {myOrders.length ? (
              myOrders.map(({ o, p }) => <OrderCard key={o.id} order={o} product={p!} />)
            ) : (
              <EmptyCard text="진행 중인 주문이 없어요" />
            )}
          </section>
          <section className="flex flex-col gap-3">
            <SectionHeader title="받는 방법" />
            <Steps
              items={[
                "상품 화면에서 '구매하기'로 결제해요",
                '픽업 번호를 받아요',
                "'픽업 대기' 알림이 오면 1F로 와요",
                '번호나 바코드를 보여주고 받아가요',
              ]}
            />
          </section>
          <Button className="w-full" onClick={() => nav(`/hanger/${hanger}`)}>
            옷 고르러 가기
          </Button>
        </div>
      </div>
    </Screen>
  )
}
