import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AI_FLASH_MS, AiFieldConflict, type AiFillState } from '@pv/ui'
import type { LeadAiFillField, LeadAiJob, LeadProfile } from '@pv/contracts'
import { userMessage, type ApiError } from '@/app/api'
import { useCan } from '@/app/auth'
import { toast, toastDone, toastFail } from '@/app/toast'
import { LeadAiMark } from '@/components/lead-ai-mark'
import { useAttachLeadAccount, type AiFillConflict } from '@/data/lead-ai-fill'
import {
  activeJobOf,
  aiJobsQuery,
  openAiTray,
  refusalLine,
  useAiJobs,
  useAiJobTurns,
  usePressAiFill,
  type AiJobTurn,
} from '@/data/lead-ai-job'
import type { LeadDraft } from '@/data/lead-draft'
import type { FieldKey, FormValues } from '@/data/lead-form'
import { leadProfileQuery, profileForm } from '@/data/lead-profile'

/** Module 2 · the AI fill of a lead as its boxes show it (ADR 0131).
 *
 *  The press only queues a job; the tray in the corner shows its steps and
 *  holds Undo. While this lead has a job moving, the boxes it may fill are
 *  skeletons. When a job this page saw moving turns DONE, the new values go
 *  into the draft as already written (`LeadDraft.absorb`) and the skeletons
 *  lift one box at a time, 120 ms apart, each with the `AI_FLASH_MS` flash;
 *  reduced motion lifts them all at once. An Undo pressed in the tray is
 *  absorbed the same way, so no blur writes the AI value back. */

const STEP_MS = 120

/** What `FieldRow` asks of a run, per box. */
export type AiFillView = {
  stateOf: (key: FieldKey) => AiFillState | undefined
  under: (key: FieldKey) => ReactNode
}

export type AiFillRun = {
  view: AiFillView
  /** The button is drawn: the server's `canAiFill`, or a job is running. */
  offered: boolean
  busy: boolean
  press: () => void
}

type Run = { code: string; phase: Partial<Record<FieldKey, AiFillState>> }

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

const pick = (values: FormValues, keys: readonly FieldKey[]) =>
  Object.fromEntries(keys.map((key) => [key, values[key]])) as Partial<FormValues>

/** The conflicts worth a door: from the lead's latest fill still standing. */
const standingOf = (jobs: readonly LeadAiJob[], code: string) =>
  jobs
    .filter((job) => job.leadCode === code && job.state === 'DONE' && !job.undoneAt)
    .reduce<LeadAiJob | undefined>((a, b) => (a && a.createdAt > b.createdAt ? a : b), undefined)

/** The boxes as they stand when a job lands or is undone: what the server now
 *  holds goes in, except boxes a person typed into meanwhile. */
function useLanding(lead: LeadProfile, draft: LeadDraft) {
  const client = useQueryClient()
  const [stored, setRun] = useState<Run | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const setPhase = (key: FieldKey, state: AiFillState | undefined) =>
    setRun((cur) => cur && { ...cur, phase: { ...cur.phase, [key]: state } })

  const reveal = (code: string, keys: FieldKey[]) => {
    const step = reducedMotion() ? 0 : STEP_MS
    setRun({ code, phase: Object.fromEntries(keys.map((key) => [key, 'waiting'])) })
    keys.forEach((key, i) =>
      timers.current.push(setTimeout(() => setPhase(key, 'flash'), i * step)),
    )
    const done = keys.length * step + AI_FLASH_MS
    timers.current.push(setTimeout(() => setRun((cur) => cur && { ...cur, phase: {} }), done))
  }

  const land = (job: LeadAiJob, turn: AiJobTurn) => {
    const code = job.leadCode
    const keys = (job.result?.filled ?? []).map((entry) => entry.field as FieldKey)
    if (code !== lead.code || keys.length === 0) return
    /* Read now: by the time the profile is back, a person may have typed. */
    const before = pick(draft.values, keys)
    if (turn === 'done')
      setRun({ code, phase: Object.fromEntries(keys.map((key) => [key, 'waiting'])) })
    const settle = (fresh: LeadProfile | undefined) => {
      if (!fresh) return setRun(null)
      draft.absorb(code, pick(profileForm(fresh) as FormValues, draft.untouched(code, before)))
      if (turn === 'done') reveal(code, keys)
    }
    const profile = leadProfileQuery(code)
    void client
      .fetchQuery({ ...profile, staleTime: 0 })
      .then(settle, () => settle(client.getQueryData(profile.queryKey)))
  }

  return { run: stored?.code === lead.code ? stored : null, land }
}

export function useAiFillRun(lead: LeadProfile, draft: LeadDraft, canEdit: boolean): AiFillRun {
  const navigate = useNavigate()
  const client = useQueryClient()
  const canOpenAccount = useCan('account.view')
  const jobs = useAiJobs()
  const fill = usePressAiFill()
  const attach = useAttachLeadAccount()
  const { run, land } = useLanding(lead, draft)
  const [attached, setAttached] = useState<ReadonlySet<string>>(() => new Set())
  useAiJobTurns(jobs, land)

  const active = activeJobOf(jobs, lead.code)
  const refused = async (code: string, error: ApiError) => {
    if (error.kind === 'conflict') {
      const now = await client.fetchQuery({ ...aiJobsQuery, staleTime: 0 }).catch(() => [])
      if (activeJobOf(now, code)) return openAiTray()
    }
    const line = refusalLine(error)
    if (line) toast(line, { tone: 'danger' })
    else
      toast('Chưa điền được. Thử lại sau ít phút.', {
        tone: 'danger',
        action: { label: 'Thử lại', onClick: press },
      })
  }

  function press() {
    if (active) return openAiTray()
    const code = lead.code
    fill.mutate(code, { onError: (error) => void refused(code, error) })
  }

  const standing = standingOf(jobs, lead.code)
  const tag = (conflict: AiFillConflict) => `${standing?.id}:${conflict.accountCode}`
  const conflicts = (standing?.result?.conflicts ?? []).filter((c) => !attached.has(tag(c)))

  const attachTo = (conflict: AiFillConflict) =>
    attach.mutate(
      { code: lead.code, accountCode: conflict.accountCode },
      {
        onSuccess: () => {
          setAttached((cur) => new Set(cur).add(tag(conflict)))
          toastDone(`Đã gắn vào ${conflict.accountName}.`)
        },
        onError: (error) => toastFail('Chưa gắn được.', userMessage(error)),
      },
    )

  /* Boxes stay editable while the job runs; absorb skips any a person typed in. */
  const stateOf = (key: FieldKey) => run?.phase[key]
  /* One hook instance serves every lead the screen steps through. */
  const busy = active !== undefined || (fill.isPending && fill.variables === lead.code)

  const under = (key: FieldKey): ReactNode => {
    const shut = stateOf(key) === 'waiting'
    const mark = shut ? undefined : lead.aiFill[key as LeadAiFillField]
    const doors = key === 'taxCode' && !shut ? conflicts : []
    if (!mark && doors.length === 0) return null
    return (
      <>
        <LeadAiMark mark={mark} />
        {doors.map((conflict) => (
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
