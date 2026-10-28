import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AI_FLASH_MS, AiFieldConflict, type AiFillState } from '@pv/ui'
import type { LeadAiFillField, LeadAiFillResult, LeadProfile } from '@pv/contracts'
import { userMessage, type ApiError } from '@/app/api'
import { useCan } from '@/app/auth'
import { toast, toastDone, toastFail } from '@/app/toast'
import { LeadAiMark } from '@/components/lead-ai-mark'
import { leadContactsQuery } from '@/data/contacts'
import {
  emptyFillable,
  filledValues,
  inlineLabel,
  undoOf,
  useAttachLeadAccount,
  useLeadAiFill,
  type AiFillConflict,
} from '@/data/lead-ai-fill'
import type { LeadDraft } from '@/data/lead-draft'
import type { FieldKey } from '@/data/lead-form'
import { useUpdateLeadProfile } from '@/data/lead-patch'

/** Module 2 · one press of the AI fill button on a lead, as the boxes show it.
 *
 *  Pending: every empty fillable box is a skeleton. Answered: the new values go
 *  into the draft at once as already written (`LeadDraft.absorb`), so autosave
 *  never sends the old empty value back; the skeletons then lift one box at a
 *  time, 120 ms apart, each with the `AI_FLASH_MS` flash. Reduced motion lifts them all
 *  at once. The run lives on this screen only; the captions come from the
 *  server's `aiFill`, so they survive a reload and leave when a person edits. */

const STEP_MS = 120

/** What `FieldRow` asks of a run, per box. */
export type AiFillView = {
  stateOf: (key: FieldKey) => AiFillState | undefined
  under: (key: FieldKey) => ReactNode
}

export type AiFillRun = {
  view: AiFillView
  /** The button is drawn: the server's `canAiFill`, or a fill is running. */
  offered: boolean
  busy: boolean
  press: () => void
}

type Run = {
  code: string
  phase: Partial<Record<FieldKey, AiFillState>>
  conflicts: AiFillConflict[]
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

const failureLine = (error: ApiError) =>
  error.kind === 'conflict' || error.kind === 'forbidden' || error.kind === 'rate-limited'
    ? (error.serverTitle ?? userMessage(error))
    : undefined

export function useAiFillRun(lead: LeadProfile, draft: LeadDraft, canEdit: boolean): AiFillRun {
  const navigate = useNavigate()
  const client = useQueryClient()
  const canOpenAccount = useCan('account.view')
  const fill = useLeadAiFill()
  const attach = useAttachLeadAccount()
  const save = useUpdateLeadProfile()
  const [stored, setRun] = useState<Run | null>(null)
  const run = stored?.code === lead.code ? stored : null
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const setPhase = (key: FieldKey, state: AiFillState | undefined) =>
    setRun((cur) => cur && { ...cur, phase: { ...cur.phase, [key]: state } })

  const reveal = (code: string, result: LeadAiFillResult) => {
    const keys = result.filled.map((entry) => entry.field)
    const step = reducedMotion() ? 0 : STEP_MS
    setRun({
      code,
      phase: Object.fromEntries(keys.map((key) => [key, 'waiting'])),
      conflicts: result.conflicts,
    })
    keys.forEach((key, i) =>
      timers.current.push(setTimeout(() => setPhase(key, 'flash'), i * step)),
    )
    const done = keys.length * step + AI_FLASH_MS
    timers.current.push(setTimeout(() => setRun((cur) => cur && { ...cur, phase: {} }), done))
  }

  const undo = (code: string, result: LeadAiFillResult) => {
    const written = filledValues(result)
    /* Asked of the LIVE boxes: one a person has typed into since, or whose
       save is still in flight, is theirs now and stays. */
    const keys = draft.untouched(code, written)
    const plan = keys.length > 0 ? undoOf(result, keys) : null
    if (!plan) return
    draft.absorb(code, plan.emptied)
    save.mutate(
      { code, body: plan.body },
      {
        onSuccess: () =>
          void client.invalidateQueries({ queryKey: leadContactsQuery(code).queryKey }),
        onError: (error) => {
          draft.absorb(code, Object.fromEntries(keys.map((key) => [key, written[key]])))
          toastFail('Chưa hoàn tác được.', userMessage(error))
        },
      },
    )
  }

  const report = (code: string, result: LeadAiFillResult) => {
    const filled = result.filled.length
    if (filled === 0) {
      if (result.conflicts.length === 0)
        toast('Không tìm thấy thông tin công khai của công ty này.', { tone: 'info' })
      return
    }
    const unsure = result.filled.filter((entry) => entry.unsure).length
    toast(`Đã điền ${filled} ô${unsure > 0 ? `, ${unsure} ô chưa chắc` : ''}.`, {
      tone: 'success',
      detail:
        result.notFound.length > 0
          ? `Không tìm thấy ${result.notFound.map(inlineLabel).join(', ')}.`
          : undefined,
      action: { label: 'Hoàn tác', onClick: () => undo(code, result) },
      ttlMs: 10_000,
    })
  }

  const press = () => {
    const code = lead.code
    const waiting = emptyFillable(draft.base)
    setRun({ code, phase: Object.fromEntries(waiting.map((k) => [k, 'waiting'])), conflicts: [] })
    fill.mutate(code, {
      onSuccess: (result) => {
        draft.absorb(code, filledValues(result))
        reveal(code, result)
        report(code, result)
      },
      onError: (error) => {
        setRun(null)
        const line = failureLine(error)
        if (line) toast(line, { tone: 'danger' })
        else
          toast('Chưa điền được. Thử lại sau ít phút.', {
            tone: 'danger',
            action: { label: 'Thử lại', onClick: press },
          })
      },
    })
  }

  const attachTo = (conflict: AiFillConflict) =>
    attach.mutate(
      { code: lead.code, accountCode: conflict.accountCode },
      {
        onSuccess: () => {
          setRun((cur) => cur && { ...cur, conflicts: cur.conflicts.filter((c) => c !== conflict) })
          toastDone(`Đã gắn vào ${conflict.accountName}.`)
        },
        onError: (error) => toastFail('Chưa gắn được.', userMessage(error)),
      },
    )

  const stateOf = (key: FieldKey) => run?.phase[key]
  /* One hook instance serves every lead the screen steps through. */
  const busy = fill.isPending && fill.variables === lead.code

  const under = (key: FieldKey): ReactNode => {
    const mark = stateOf(key) === 'waiting' ? undefined : lead.aiFill[key as LeadAiFillField]
    const conflicts = key === 'taxCode' ? (run?.conflicts ?? []) : []
    if (!mark && conflicts.length === 0) return null
    return (
      <>
        <LeadAiMark mark={mark} />
        {conflicts.map((conflict) => (
          <AiFieldConflict
            key={conflict.accountCode}
            value={conflict.value}
            ownerName={conflict.accountName}
            onOpenOwner={
              canOpenAccount ? () => navigate(`/sales/accounts/${conflict.accountCode}`) : undefined
            }
            onAttach={() => attachTo(conflict)}
          />
        ))}
      </>
    )
  }

  return {
    view: { stateOf, under },
    offered: canEdit && (busy || lead.canAiFill),
    busy,
    press,
  }
}
