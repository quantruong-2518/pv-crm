import { GlassCard, cn, percent } from '@pv/ui'
import type { KpiBdOriginsResponse } from '@pv/contracts'
import { message, useI18n, type Message } from '@/app/i18n'
import { num } from './home-model'
import { NEUTRAL_MARK, NOTE, TILE } from './home-tiles'
import { printShort } from './kpi-model'
import { monthPace, share } from './kpi-me-sale-model'

/** BD's lead origins and the pipeline it opened (ADR 0160 §9): where each lead came
 *  from, how far it got, and the value of the deals opened against the unit's
 *  missing signed value. The bar of an origin is as long as its leads are many. */

const ORIGIN: Record<KpiBdOriginsResponse['origins'][number]['origin'], Message> = {
  marketing: message('MQL từ Marketing', 'MQL from Marketing', '마케팅 MQL'),
  'self-sourced': message('Tự tìm', 'Self-sourced', '직접 발굴'),
}

function Legend() {
  const { t } = useI18n()
  const swatch = (tone: string, label: Message) => (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden className={cn('rounded-xs size-2', tone)} />
      {t(label)}
    </span>
  )
  return (
    <span className={cn(NOTE, 'flex flex-wrap gap-x-3 gap-y-1')}>
      {swatch('bg-primary', message('Thành cơ hội', 'Became an opportunity', '기회 전환'))}
      {swatch(
        NEUTRAL_MARK,
        message('SQL, chưa thành cơ hội', 'SQL, no opportunity yet', 'SQL, 기회 미전환'),
      )}
    </span>
  )
}

function Pipeline({ period, data }: { period: string; data: KpiBdOriginsResponse }) {
  const { t } = useI18n()
  const { created, target } = data.pipeline
  const deals = data.origins.reduce((sum, o) => sum + o.opportunities, 0)
  const pace = monthPace(period)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] font-semibold">
          {t(message('Giá trị pipeline đã tạo', 'Pipeline value opened', '생성한 파이프라인 금액'))}
        </span>
        <span className="tnum font-num text-[13px]">
          <b>{printShort('money', created)}</b>
          {target !== null && (
            <span className="text-muted-foreground">{` / ${printShort('money', target)}`}</span>
          )}
        </span>
      </div>
      {target !== null && (
        <div aria-hidden className="bg-surface-ink/10 relative h-3 rounded-sm">
          <span
            className="bg-primary absolute inset-y-0 left-0 rounded-sm"
            style={{ width: `${Math.min(target > 0 ? created / target : 1, 1) * 100}%` }}
          />
          {pace !== null && (
            <span
              className="bg-foreground absolute -inset-y-1 w-0.5 rounded-sm"
              style={{ left: `${pace * 100}%` }}
            />
          )}
        </div>
      )}
      <span className={NOTE}>
        {t(
          message(
            `Tổng giá trị dự kiến của ${num(deals)} cơ hội.`,
            `Expected value of ${num(deals)} opportunities.`,
            `기회 ${num(deals)}건의 예상 금액 합계입니다.`,
          ),
        )}
        {target !== null &&
          ` ${t(
            message(
              'Mục tiêu bằng 3 lần phần chỉ tiêu ký của nhóm còn thiếu.',
              'The target is 3 times what the unit still lacks of its signed target.',
              '목표는 팀 계약 목표 잔여분의 3배입니다.',
            ),
          )}`}
      </span>
    </div>
  )
}

export function BdOriginsCard({ period, data }: { period: string; data: KpiBdOriginsResponse }) {
  const { t } = useI18n()
  const { origins, pipeline } = data
  const top = Math.max(...origins.map((o) => o.leads), 1)
  if (origins.every((o) => o.leads === 0) && pipeline.created === 0 && pipeline.target === null) {
    return null
  }
  return (
    <GlassCard className={TILE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold leading-5">
          {t(
            message(
              'Nguồn lead và pipeline đã tạo',
              'Lead origins and pipeline opened',
              '리드 출처와 생성 파이프라인',
            ),
          )}
        </h3>
        <Legend />
      </div>
      {origins.map((o) => (
        <div key={o.origin} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[12.5px] font-semibold">{t(ORIGIN[o.origin])}</span>
            <span className={cn(NOTE, 'tnum font-num')}>
              {t(
                message(
                  `${num(o.leads)} lead → ${num(o.sql)} SQL → ${num(o.opportunities)} cơ hội · lead → SQL ${o.leads > 0 ? percent(o.sql / o.leads) : '—'}`,
                  `${num(o.leads)} leads → ${num(o.sql)} SQL → ${num(o.opportunities)} opportunities · lead → SQL ${o.leads > 0 ? percent(o.sql / o.leads) : '—'}`,
                  `리드 ${num(o.leads)} → SQL ${num(o.sql)} → 기회 ${num(o.opportunities)} · 리드 → SQL ${o.leads > 0 ? percent(o.sql / o.leads) : '—'}`,
                ),
              )}
            </span>
          </div>
          {o.leads > 0 && (
            <div aria-hidden style={{ width: `${share(o.leads, top) * 100}%` }}>
              <div className="bg-surface-ink/10 flex h-3 overflow-hidden rounded-sm">
                <span
                  className="bg-primary shadow-[1px_0_0_var(--card)]"
                  style={{ width: `${share(o.opportunities, o.leads) * 100}%` }}
                />
                <span
                  className={NEUTRAL_MARK}
                  style={{ width: `${share(o.sql - o.opportunities, o.leads) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      ))}
      <Pipeline period={period} data={data} />
    </GlassCard>
  )
}
