import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { CustomerTemperature, DebriefClose, DebriefStepTarget } from '@pv/contracts'
import {
  commTargetQuery,
  stepBlockerOf,
  stepInputOf,
  type StepDraft,
} from '@/data/comm-record-detail'
import { useStepOptions, type NextStepSubject } from '@/data/next-step'

/** The step part of every comm close-out — the record page, the meeting
 *  close-out and the mobile log. On a bought customer (ADR 0121) the form asks
 *  a temperature beside the evaluation; the step templates hang on that pick,
 *  and the step lands on the customer's lead whatever the comm's subject is.
 *  A closer who cannot write that step is asked neither. Elsewhere it is the
 *  subject's own step, as before. An unreached close never comes here, so it
 *  records no temperature. */

export const NO_TEMPERATURE = 'Chưa chọn nhiệt độ khách hàng.'

/** `stepTarget` is the record's own; a form with no record yet (the mobile
 *  log) leaves it out and takes the one the target door answers. */
export function useCloseStep(subjectCode: string, stepTarget?: DebriefStepTarget | null) {
  const target = useQuery({ ...commTargetQuery(subjectCode), enabled: subjectCode !== '' })
  const [temperature, setTemperature] = useState<CustomerTemperature | null>(null)

  const own = stepTarget === undefined ? target.data?.stepTarget : stepTarget
  /* A closer who cannot write the customer's step gets no target: no temperature, no step. */
  const customer = own ? (target.data?.customer ?? null) : null
  const kind: NextStepSubject | null = customer ? 'lead' : (own?.kind ?? null)
  const code = customer?.leadCode ?? subjectCode
  /* A customer's templates are read only once a temperature is picked. */
  const asked = customer === null || temperature !== null
  const options = useStepOptions(asked ? kind : null, code, temperature ?? undefined)

  /** Whether the form draws the step fields now. */
  const stepShown = kind !== null && asked

  /** The evaluation part's own gap: the temperature sits beside the answers. */
  const temperatureGap = customer && temperature === null ? NO_TEMPERATURE : null

  /** What still blocks the step part, or null when it is complete. */
  const gapOf = (draft: StepDraft): string | null => {
    if (!target.data) {
      return target.error ? 'Không tải được điều kiện xác nhận.' : 'Đang tải điều kiện xác nhận.'
    }
    if (customer && temperature === null) return NO_TEMPERATURE
    return kind ? stepBlockerOf(draft, options) : null
  }

  const inputOf = (draft: StepDraft): Pick<DebriefClose, 'step' | 'temperature'> => ({
    ...(kind && { step: stepInputOf(draft, options.data) }),
    ...(customer && temperature && { temperature }),
  })

  return {
    target,
    customer,
    temperature,
    temperatureGap,
    setTemperature,
    takesStep: kind !== null,
    stepShown,
    stepCode: code,
    options,
    gapOf,
    inputOf,
  }
}

export type CloseStep = ReturnType<typeof useCloseStep>
