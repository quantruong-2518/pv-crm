import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { AiFillState } from '@pv/ui'
import type { LeadAiFillField, LeadAiJob, LeadProfile } from '@pv/contracts'
import { userMessage, type ApiError } from '@/app/api'
import { useCan } from '@/app/auth'
import { message, translate, useI18n, type Lang } from '@/app/i18n'
import { toast, toastDone, toastFail } from '@/app/toast'
import { AiFieldToggle, AiSourceLine } from '@/components/lead-ai-mark'
import {
  distinctSources,
  sourceOf,
  unsureFields,
  useAttachLeadAccount,
  type AiFillConflict,
  type AiSource,
} from '@/data/lead-ai-fill'
import {
  activeJobOf,
  aiJobsQuery,
  openAiTray,
  refusalLine,
  useAiJobs,
  useAiJobTurns,
  usePressAiFill,
  useUndoAiJob,
  type AiJobTurn,
} from '@/data/lead-ai-job'
import type { LeadDraft } from '@/data/lead-draft'
import type { FieldKey, FormValues } from '@/data/lead-form'
import { leadProfileQuery, profileForm } from '@/data/lead-profile'

/** Module 2 · the AI fill of a lead as its form shows it (ADR 0131).
 *
 *  The press only queues a job; the tray in the corner holds its steps and
 *  Undo, and the form shows one line of the same job: the step while it moves,
 *  the result once it is done. When a job this page saw moving turns DONE, the
 *  boxes it filled are skeletons until the new values are in the draft
 *  (`LeadDraft.absorb`); an Undo pressed anywhere is absorbed the same way, so
 *  no blur writes the AI value back. What needs a look is read from the
 *  profile's own marks, not the job, so it survives a reload and a reader who
 *  never pressed the button sees it too. */

/** What `FieldRow` asks of a run, per box. */
export type AiFillView = {
  /** `waiting` while a landed job's values are being read in. */
  stateOf: (key: FieldKey) => AiFillState | undefined
  /** The mark at the end of the label of a box the AI filled. */
  mark: (key: FieldKey) => ReactNode
  /** The source line under the box, while its mark is open. */
  under: (key: FieldKey) => ReactNode
}

/** What the lines above the form draw; `lead-ai-status.tsx` owns the looks. */
export type AiStatus = {
  /** A job of this lead is queued or running. */
  active?: Pick<LeadAiJob, 'state' | 'step'>
  /** The latest fill still standing: its count, sources and Undo. */
  done?: {
    filled: number
    sources: AiSource[]
    canUndo: boolean
    undo: () => void
    undoing: boolean
  }
  /** Fields the AI marked unsure, still holding its value. */
  unsure: { key: LeadAiFillField }[]
  conflicts: AiFillConflict[]
  attach: (conflict: AiFillConflict) => void
  attaching: boolean
  /** Absent when the reader may not open accounts. */
  openOwner?: (accountCode: string) => void
}

export type AiFillRun = {
  view: AiFillView
  status: AiStatus
  /** The button is drawn: the server's `canAiFill`, or a job is running. */
  offered: boolean
  busy: boolean
  press: () => void
}

type Run = { code: string; waiting: ReadonlySet<FieldKey> }

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

  const land = (job: LeadAiJob, turn: AiJobTurn) => {
    const code = job.leadCode
    const keys = (job.result?.filled ?? []).map((entry) => entry.field as FieldKey)
    if (code !== lead.code || keys.length === 0) return
    /* Read now: by the time the profile is back, a person may have typed. */
    const before = pick(draft.values, keys)
    if (turn === 'done') setRun({ code, waiting: new Set(keys) })
    const settle = (fresh: LeadProfile | undefined) => {
      if (fresh)
        draft.absorb(code, pick(profileForm(fresh) as FormValues, draft.untouched(code, before)))
      setRun(null)
    }
    const profile = leadProfileQuery(code)
    void client
      .fetchQuery({ ...profile, staleTime: 0 })
      .then(settle, () => settle(client.getQueryData(profile.queryKey)))
  }

  return { waiting: stored?.code === lead.code ? stored.waiting : undefined, land }
}

/** The per-box face of a run: the mark of a box the AI filled and its source
 *  line while that mark is open. `opened` holds `lead:key` slots. */
function viewOf(
  lead: LeadProfile,
  lang: Lang,
  stateOf: AiFillView['stateOf'],
  opened: ReadonlySet<string>,
  toggle: (slot: string) => void,
): AiFillView {
  const markOf = (key: FieldKey) => (stateOf(key) ? undefined : lead.aiFill[key as LeadAiFillField])
  const slot = (key: FieldKey) => `${lead.code}:${key}`
  return {
    stateOf,
    mark: (key) =>
      markOf(key) && (
        <AiFieldToggle open={opened.has(slot(key))} onToggle={() => toggle(slot(key))} />
      ),
    under: (key) => {
      const mark = markOf(key)
      return mark && opened.has(slot(key)) ? (
        <AiSourceLine source={sourceOf(mark.source, lang)} />
      ) : null
    },
  }
}

export function useAiFillRun(lead: LeadProfile, draft: LeadDraft, canEdit: boolean): AiFillRun {
  const { lang } = useI18n()
  const navigate = useNavigate()
  const client = useQueryClient()
  const canOpenAccount = useCan('account.view')
  const jobs = useAiJobs()
  const fill = usePressAiFill()
  const attach = useAttachLeadAccount()
  const undo = useUndoAiJob()
  const { waiting, land } = useLanding(lead, draft)
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set())
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
      toast(
        translate(
          message(
            'Chưa điền được. Thử lại sau ít phút.',
            'Could not fill in. Try again in a few minutes.',
            '자동 입력하지 못했습니다. 잠시 후 다시 시도하세요.',
          ),
        ),
        {
          tone: 'danger',
          action: { label: translate(message('Thử lại', 'Retry', '다시 시도')), onClick: press },
        },
      )
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
          toastDone(
            translate(
              message(
                `Đã gắn vào ${conflict.accountName}.`,
                `Linked to ${conflict.accountName}.`,
                `${conflict.accountName}에 연결했습니다.`,
              ),
            ),
          )
        },
        onError: (error) =>
          toastFail(
            translate(message('Chưa gắn được.', 'Could not link.', '연결하지 못했습니다.')),
            userMessage(error),
          ),
      },
    )

  const result = standing?.result
  const done: AiStatus['done'] =
    standing && result
      ? {
          filled: result.filled.length,
          sources: distinctSources(result.filled, lang),
          canUndo: standing.canUndo,
          undo: () =>
            undo.mutate(standing.id, {
              onError: (error) =>
                toastFail(
                  translate(
                    message('Chưa hoàn tác được.', 'Could not undo.', '실행 취소하지 못했습니다.'),
                  ),
                  userMessage(error),
                ),
            }),
          undoing: undo.isPending && undo.variables === standing.id,
        }
      : undefined

  /* Boxes stay editable while the job runs; absorb skips any a person typed in. */
  const stateOf = (key: FieldKey) => (waiting?.has(key) ? 'waiting' : undefined)
  /* One hook instance serves every lead the screen steps through. */
  const busy = active !== undefined || (fill.isPending && fill.variables === lead.code)

  const toggle = (slot: string) =>
    setOpened((cur) => {
      const next = new Set(cur)
      if (!next.delete(slot)) next.add(slot)
      return next
    })
  const view = viewOf(lead, lang, stateOf, opened, toggle)

  return {
    view,
    status: {
      active,
      done,
      unsure: unsureFields(lead.aiFill).map((key) => ({ key })),
      conflicts,
      attach: attachTo,
      attaching: attach.isPending,
      openOwner: canOpenAccount
        ? (code) => navigate(`/sales/accounts/${encodeURIComponent(code)}`)
        : undefined,
    },
    offered: canEdit && (busy || lead.canAiFill),
    busy,
    press,
  }
}
