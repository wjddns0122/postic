import type { ReactNode } from 'react'
import { won, type Order, type Product } from '../../lib'
import { Button, SimBadge, StatusBadge, Thumb } from '../../ui'
import { Img, RssiBars, dbm } from './parts'

import dotOk from '../../assets/figma/dot-ok-a4afb.svg'
import dotCritical from '../../assets/figma/dot-critical-a8115.svg'

/* ───────── 태그 상태 ───────── */

export type TagView = {
  p: Product
  on: boolean
  rssi?: number
  last?: string
  simulated?: boolean
}

const TAG_COLS = ['상태', '태그 ID', '상품', '행거', 'Major/Minor', 'MAC', 'RSSI', '마지막 수신', 'SIM']
const TAG_MIN = ['min-w-[100px]', 'min-w-[88px]', 'min-w-[232px]', 'min-w-16', 'min-w-24', 'min-w-32', 'min-w-[104px]', 'min-w-[88px]', 'min-w-24']
const CRITICAL_TEXT = 'text-[color:var(--color-critical-text,#b91c1c)]'

function TagState({ on }: { on: boolean }) {
  return (
    <>
      <Img src={on ? dotOk : dotCritical} w={8} className={on ? 'pulse-dot' : ''} />
      <span className={`t-body-strong whitespace-nowrap ${on ? 'text-ok-text' : CRITICAL_TEXT}`}>{on ? '온라인' : '오프라인'}</span>
    </>
  )
}

function Cell({ i, h = 'h-14', children }: { i: number; h?: string; children?: ReactNode }) {
  return <div className={`flex flex-[1_0_0] items-center gap-2 ${h} ${TAG_MIN[i]}`}>{children}</div>
}

export function TagTable({ rows }: { rows: TagView[] }) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[996px]">
        <div className="flex h-10 items-center border-b border-line">
          {TAG_COLS.map((c, i) => (
            <Cell key={c} i={i} h="h-10">
              <span className="t-meta whitespace-nowrap text-faint">{c}</span>
            </Cell>
          ))}
        </div>
        {rows.map(({ p, on, rssi, last, simulated }) => {
          const dim = on ? '' : 'text-faint'
          return (
            <div key={p.id} className="flex h-14 items-center border-b border-line">
              <Cell i={0}>
                <TagState on={on} />
              </Cell>
              <Cell i={1}>
                <span className="t-body-strong truncate">{p.id}</span>
              </Cell>
              <Cell i={2}>
                <Thumb p={p} className="size-8" />
                <span className="t-body-strong truncate">{p.name}</span>
              </Cell>
              <Cell i={3}>
                <span className="t-body truncate">{p.hanger}</span>
              </Cell>
              <Cell i={4}>
                <span className="t-body truncate">
                  {p.major}/{p.minor}
                </span>
              </Cell>
              <Cell i={5}>
                <span className="t-body truncate">{p.mac ?? '—'}</span>
              </Cell>
              <Cell i={6}>
                <RssiBars rssi={rssi} off={!on} />
                <span className={`t-body whitespace-nowrap ${dim}`}>{rssi !== undefined ? dbm(rssi) : '—'}</span>
              </Cell>
              <Cell i={7}>
                <span className={`t-body whitespace-nowrap ${dim}`}>{last ?? '—'}</span>
              </Cell>
              <Cell i={8}>{simulated && <SimBadge />}</Cell>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-24 flex-[1_0_0] flex-col gap-1">
      <span className="t-meta text-faint">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

/** 모바일: 태그 한 줄을 카드 블록으로 */
export function TagCard({ p, on, rssi, last, simulated }: TagView) {
  const dim = on ? '' : 'text-faint'
  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex w-full items-center gap-2">
        <TagState on={on} />
        <div className="flex-1" />
        {simulated && <SimBadge />}
      </div>
      <div className="flex w-full items-center gap-3">
        <Thumb p={p} className="size-11" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="t-body-strong truncate">{p.name}</span>
          <span className="t-meta truncate text-sub">{p.id}</span>
        </div>
      </div>
      <div className="flex w-full flex-wrap items-start gap-3">
        <Field label="행거">
          <span className="t-body">{p.hanger}</span>
        </Field>
        <Field label="Major/Minor">
          <span className="t-body">
            {p.major}/{p.minor}
          </span>
        </Field>
        <Field label="MAC">
          <span className="t-body break-all">{p.mac ?? '—'}</span>
        </Field>
        <Field label="RSSI">
          <RssiBars rssi={rssi} off={!on} />
          <span className={`t-body whitespace-nowrap ${dim}`}>{rssi !== undefined ? dbm(rssi) : '—'}</span>
        </Field>
        <Field label="마지막 수신">
          <span className={`t-body ${dim}`}>{last ?? '—'}</span>
        </Field>
      </div>
    </div>
  )
}

/* ───────── 주문 · 피팅 요청 ───────── */

export type OrderView = {
  o: Order
  p?: Product
  label: string
  nextLabel: string | null
  onNext: () => void
}

const ORDER_COLS = ['번호', '구분', '상품', '금액', '상태', '다음 단계']
const ORDER_MIN = ['min-w-[72px]', 'min-w-14', 'min-w-[232px]', 'min-w-[104px]', 'min-w-28', 'min-w-[136px]']

const kindLabel = (o: Order) => (o.type === 'purchase' ? '구매' : '피팅')
const productLabel = (o: Order, p?: Product) => [p?.name, o.size].filter(Boolean).join(' · ')
const amountLabel = (o: Order) => (o.amount ? won(o.amount) : '—')

function OrderThumb({ p, className }: { p?: Product; className: string }) {
  return p ? <Thumb p={p} className={`${className}`} /> : <span className={`shrink-0 rounded-2xl bg-line ${className}`} />
}

function NextButton({ nextLabel, onNext, className }: { nextLabel: string | null; onNext: () => void; className: string }) {
  return (
    <Button variant="secondary" onClick={onNext} disabled={!nextLabel} className={`shrink-0 whitespace-nowrap ${className}`}>
      {nextLabel ? `→ ${nextLabel}` : '완료'}
    </Button>
  )
}

function OCell({ i, children }: { i: number; children?: ReactNode }) {
  return <div className={`flex h-16 flex-[1_0_0] items-center gap-2 ${ORDER_MIN[i]}`}>{children}</div>
}

export function OrderTable({ rows }: { rows: OrderView[] }) {
  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[712px]">
        <div className="flex h-10 items-center border-b border-line">
          {ORDER_COLS.map((c, i) => (
            <div key={c} className={`flex h-10 flex-[1_0_0] items-center ${ORDER_MIN[i]}`}>
              <span className="t-meta whitespace-nowrap text-faint">{c}</span>
            </div>
          ))}
        </div>
        {rows.map(({ o, p, label, nextLabel, onNext }) => (
          <div key={o.id} className="flex h-16 items-center border-b border-line">
            <OCell i={0}>
              <span className="t-body-strong truncate">{o.pickup_code}</span>
            </OCell>
            <OCell i={1}>
              <span className="t-body text-sub">{kindLabel(o)}</span>
            </OCell>
            <OCell i={2}>
              <OrderThumb p={p} className="size-10" />
              <span className="t-body truncate">{productLabel(o, p)}</span>
            </OCell>
            <OCell i={3}>
              <span className="t-body-strong whitespace-nowrap">{amountLabel(o)}</span>
            </OCell>
            <OCell i={4}>
              <StatusBadge type={o.type} status={o.status} label={label} />
            </OCell>
            <OCell i={5}>
              <NextButton nextLabel={nextLabel} onNext={onNext} className="h-9! w-[120px]" />
            </OCell>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 모바일: 주문 한 줄을 카드 블록으로 */
export function OrderCard({ o, p, label, nextLabel, onNext }: OrderView) {
  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex w-full items-center gap-2">
        <span className="t-section">{o.pickup_code}</span>
        <span className="t-meta text-sub">{kindLabel(o)}</span>
        <div className="flex-1" />
        <StatusBadge type={o.type} status={o.status} label={label} />
      </div>
      <div className="flex w-full items-center gap-3">
        <OrderThumb p={p} className="size-11" />
        <span className="t-body min-w-0 flex-1">{productLabel(o, p)}</span>
        <span className="t-body-strong shrink-0">{amountLabel(o)}</span>
      </div>
      <NextButton nextLabel={nextLabel} onNext={onNext} className="w-full" />
    </div>
  )
}
