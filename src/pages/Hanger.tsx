import { useParams } from 'react-router-dom'
import { useLive } from '../live'
import { BackBar, Card, distanceLabel, Screen, SectionHeader } from '../ui'
import { HangerIllustration, ProductRow, StatTile } from '../components/hanger/HangerParts'

export default function Hanger() {
  const { id } = useParams()
  const { products, isOnline, seen, now } = useLive()
  const items = products.filter((p) => p.hanger === id)
  const on = items.filter(isOnline)
  const off = items.filter((p) => !isOnline(p))
  const best = on.map((p) => seen(p)!).sort((a, b) => b.rssiAvg - a.rssiAvg)[0]
  const lastSec = best ? Math.max(0, Math.round((now - best.seenAt) / 1000)) : null

  return (
    <Screen className="md:gap-6">
      <BackBar title="앞에 걸린 옷" />

      <div className="flex w-full flex-col gap-4 md:flex-row md:items-start md:gap-6">
        <div className="flex min-w-0 flex-col gap-4 md:flex-1 md:gap-6">
          <HangerIllustration
            items={items}
            isOnline={isOnline}
            hangerId={id ?? ''}
            gateway={best?.gateway ?? 'GW-01'}
            rssi={best?.rssiAvg}
          />
          <div className="flex w-full items-start gap-3">
            <StatTile icon="hanger" value={`${on.length}/${items.length}벌`} label="인식됨" />
            <StatTile icon="radio" value={distanceLabel(best?.rssiAvg)} label="신호" />
            <StatTile icon="clock" value={lastSec === null ? '-' : lastSec <= 1 ? '방금' : `${lastSec}초 전`} label="갱신" />
          </div>
        </div>

        <section className="flex min-w-0 flex-col gap-4 md:flex-1 md:gap-6">
          <SectionHeader title="앞에 걸린 옷" meta={`${on.length}벌 인식`} />
          <Card className="flex w-full flex-col divide-y divide-line overflow-hidden">
            {on.map((p) => (
              <ProductRow key={p.id} p={p} online rssi={seen(p)?.rssiAvg} />
            ))}
            {on.length === 0 && <p className="t-body px-4 py-8 text-center text-faint">이 행거에서 감지된 상품이 없습니다</p>}
            {off.map((p) => (
              <ProductRow key={p.id} p={p} online={false} />
            ))}
          </Card>
        </section>
      </div>
    </Screen>
  )
}
