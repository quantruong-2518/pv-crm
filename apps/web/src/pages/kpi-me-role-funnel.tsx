import { Badge, GlassCard, percent } from '@pv/ui'
import type { KpiFunnelResponse } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { kpiFunnelStepText } from '@/data/kpi-i18n'
import { num } from './home-model'
import { NOTE, TILE } from './home-tiles'
import { DASH } from './kpi-model'
import type { FunnelFact } from './kpi-me-bottleneck'
import { FUNNEL_HINT, FUNNEL_TITLE, NECK } from './kpi-me-role-i18n'
import { funnelFact, overallShare, type BoardRole } from './kpi-me-role-model'

/** The role's funnel (ADR 0160 §7): one bar per step, its length true to the count,
 *  and between two steps the share that went on beside the step's own target.
 *  Only the step furthest under its target is marked; a funnel with no target
 *  marks none. The sentence below is a template over the same numbers. */

type Steps = KpiFunnelResponse['steps']

function Sentence({ steps, fact }: { steps: Steps; fact: FunnelFact | null }) {
  const { t, lang } = useI18n()
  if (!fact) return null
  const to = steps[fact.at]!
  const from = steps[fact.at - 1]
  const name = `${from ? `${kpiFunnelStepText(from.step, lang)} → ` : ''}${kpiFunnelStepText(to.step, lang)}`
  if (fact.kind === 'neck') {
    const rate = percent(to.rate ?? 0)
    const gap = num(fact.gap * 100)
    return (
      <p className="m-0 text-[12.5px] leading-5">
        {t(
          message(
            `Điểm nghẽn ở bước ${name}: ${rate}, thấp hơn mục tiêu ${gap} điểm.`,
            `Bottleneck at ${name}: ${rate}, ${gap} points under target.`,
            `${name} 단계가 병목입니다: ${rate}, 목표보다 ${gap}%p 낮습니다.`,
          ),
        )}
      </p>
    )
  }
  const before = num(from?.count ?? 0)
  const after = num(to.count)
  return (
    <p className="m-0 text-[12.5px] leading-5">
      {fact.allMet &&
        `${t(message('Mọi bước đều đạt mục tiêu.', 'Every step meets its target.', '모든 단계가 목표를 달성했습니다.'))} `}
      {t(
        message(
          `Giảm nhiều nhất ở bước ${name}: ${before} còn ${after}.`,
          `Largest drop at ${name}: ${before} down to ${after}.`,
          `${name} 단계에서 가장 많이 줄었습니다: ${before}건에서 ${after}건.`,
        ),
      )}
    </p>
  )
}

function Link({ step, neck }: { step: Steps[number]; neck: boolean }) {
  const { t } = useI18n()
  const { rate, target } = step
  const tone = rate === null || target === null ? 'draft' : rate >= target ? 'success' : 'warning'
  return (
    <div className="flex flex-wrap items-center gap-2 pl-1">
      <Badge tone={tone}>
        {t(
          message(
            `${rate === null ? DASH : percent(rate)} đi tiếp`,
            `${rate === null ? DASH : percent(rate)} moved on`,
            `${rate === null ? DASH : percent(rate)} 다음 단계로`,
          ),
        )}
      </Badge>
      {target !== null && (
        <span className={NOTE}>
          {t(
            message(
              `mục tiêu ${percent(target)}`,
              `target ${percent(target)}`,
              `목표 ${percent(target)}`,
            ),
          )}
        </span>
      )}
      {neck && <Badge tone="danger">{t(NECK)}</Badge>}
    </div>
  )
}

export function FunnelCard({ role, steps }: { role: BoardRole; steps: Steps }) {
  const { t, lang } = useI18n()
  if (steps.length === 0) return null
  const top = Math.max(...steps.map((s) => s.count), 1)
  const fact = funnelFact(steps)
  const neck = fact?.kind === 'neck' ? fact.at : null
  const overall = overallShare(steps)
  return (
    <GlassCard className={TILE}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-[13px] font-semibold leading-5">{t(FUNNEL_TITLE[role])}</h3>
          <span className={NOTE}>{t(FUNNEL_HINT)}</span>
        </div>
        {overall !== null && (
          <Badge tone="draft">
            <span className="tnum font-num">
              {t(
                message(
                  `Cả phễu: ${num(steps[0]!.count)} → ${num(steps[steps.length - 1]!.count)} · ${percent(overall, 1)}`,
                  `Whole funnel: ${num(steps[0]!.count)} → ${num(steps[steps.length - 1]!.count)} · ${percent(overall, 1)}`,
                  `전체 퍼널: ${num(steps[0]!.count)} → ${num(steps[steps.length - 1]!.count)} · ${percent(overall, 1)}`,
                ),
              )}
            </span>
          </Badge>
        )}
      </div>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {steps.map((s, i) => (
          <li key={s.step} className="flex flex-col gap-2">
            {i > 0 && <Link step={s} neck={neck === i} />}
            <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)]">
              <span className="truncate text-[12.5px] font-semibold">
                {kpiFunnelStepText(s.step, lang)}
              </span>
              <span className="flex items-center gap-3">
                <span className="bg-surface-ink/10 h-3 flex-1 overflow-hidden rounded-sm">
                  <span
                    className="bg-primary block h-full rounded-sm"
                    style={{ width: `${Math.max((s.count / top) * 100, 1)}%` }}
                  />
                </span>
                <b className="tnum font-num w-12 shrink-0 text-right text-[14px]">{num(s.count)}</b>
              </span>
            </div>
          </li>
        ))}
      </ol>
      <Sentence steps={steps} fact={fact} />
    </GlassCard>
  )
}
