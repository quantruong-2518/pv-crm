import { useState } from 'react'
import { Button, GlassCard, Input, Plus, Textarea, Icon, cn } from '@pv/ui'
import type { KpiOneOnOneAction, KpiOneOnOneBody, KpiOneOnOneResponse } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import {
  useAcknowledgeKpiOneOnOne,
  useDoneKpiOneOnOneAction,
  useWriteKpiOneOnOne,
} from '@/data/kpi-score'
import { dm, dmy } from '@/lib/date'
import { NOTE, TILE } from './home-tiles'
import { FailLine } from './kpi-allocate-parts'

/** The note and the actions of a 1:1: a form for the writer, a reading for the
 *  person. Who may do what is `canWrite` / `canAcknowledge` from the server. */

const NOTE_MAX = 2000
const TEXT_MAX = 200
const ACTIONS_MAX = 3

type Row = { text: string; due: string }
const BLANK: Row = { text: '', due: '' }

const bodyOf = (note: string, rows: readonly Row[]): KpiOneOnOneBody | null => {
  const filled = rows.filter((r) => r.text.trim() !== '' || r.due !== '')
  if (note.trim() === '' || filled.some((r) => r.text.trim() === '' || r.due === '')) return null
  return {
    note: note.trim(),
    actions: filled.map((r) => ({ text: r.text.trim(), due: r.due })),
  }
}

export function WriteForm({
  period,
  actorId,
  name,
  data,
}: {
  period: string
  actorId: string
  name: string
  data: KpiOneOnOneResponse
}) {
  const { t } = useI18n()
  const write = useWriteKpiOneOnOne(period, actorId)
  const [note, setNote] = useState(data.note ?? '')
  const [rows, setRows] = useState<Row[]>(
    data.actions.length > 0
      ? data.actions.map((a) => ({ text: a.text, due: a.due.slice(0, 10) }))
      : [BLANK],
  )
  const body = bodyOf(note, rows)
  const edit = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, at) => (at === i ? { ...r, ...patch } : r)))
  return (
    <GlassCard className={cn(TILE, 'gap-4')}>
      <label className="flex flex-col gap-2">
        <span className="text-[12.5px] font-semibold">
          {t(message('Nhận xét', 'Note', '의견'))}
        </span>
        <Textarea
          rows={3}
          autoGrow
          maxLength={NOTE_MAX}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="flex flex-col gap-2">
        <span className="text-[12.5px] font-semibold">
          {t(message('Việc cần làm (tối đa 3)', 'Actions (up to 3)', '할 일 (최대 3개)'))}
        </span>
        {rows.map((row, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
            <Input
              aria-label={t(message(`Việc ${i + 1}`, `Action ${i + 1}`, `할 일 ${i + 1}`))}
              className="pointer-coarse:h-12"
              maxLength={TEXT_MAX}
              value={row.text}
              onChange={(e) => edit(i, { text: e.target.value })}
            />
            <Input
              type="date"
              aria-label={t(message(`Hạn việc ${i + 1}`, `Due date ${i + 1}`, `기한 ${i + 1}`))}
              className="pointer-coarse:h-12"
              value={row.due}
              onChange={(e) => edit(i, { due: e.target.value })}
            />
          </div>
        ))}
        {rows.length < ACTIONS_MAX && (
          <Button
            variant="ghost"
            size="sm"
            className="pointer-coarse:h-12 self-start"
            onClick={() => setRows([...rows, BLANK])}
          >
            <Icon icon={Plus} size={16} />
            {t(message('Thêm việc', 'Add action', '할 일 추가'))}
          </Button>
        )}
      </div>
      <FailLine error={write.error} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={NOTE}>
          {t(
            message(
              `Việc hiện trên KPI của ${name} tới khi một trong hai người đánh dấu xong.`,
              `The actions show on ${name}'s KPIs until either of you marks them done.`,
              `${name}님의 KPI에 두 사람 중 한 명이 완료 표시할 때까지 표시됩니다.`,
            ),
          )}
        </p>
        <Button
          className="pointer-coarse:h-12"
          disabled={body === null || write.isPending}
          onClick={() =>
            body &&
            write.mutate(body, {
              onSuccess: () =>
                toastDone(
                  t(message(`Đã gửi cho ${name}`, `Sent to ${name}`, `${name}님께 보냈습니다`)),
                ),
            })
          }
        >
          {t(message(`Gửi cho ${name}`, `Send to ${name}`, `${name}님께 보내기`))}
        </Button>
      </div>
    </GlassCard>
  )
}

function ActionRow({ action, canDone }: { action: KpiOneOnOneAction; canDone: boolean }) {
  const { t } = useI18n()
  const done = useDoneKpiOneOnOneAction()
  return (
    <li className="flex flex-wrap items-center justify-between gap-3">
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-[13px]">{action.text}</span>
        <span className={cn(NOTE, 'tnum font-num')}>
          {action.doneAt
            ? t(
                message(
                  `Xong ${dm(action.doneAt)}`,
                  `Done ${dm(action.doneAt)}`,
                  `완료 ${dm(action.doneAt)}`,
                ),
              )
            : t(
                message(`Hạn ${dm(action.due)}`, `Due ${dm(action.due)}`, `기한 ${dm(action.due)}`),
              )}
        </span>
      </span>
      {canDone && !action.doneAt && (
        <Button
          variant="secondary"
          size="sm"
          className="pointer-coarse:h-12"
          disabled={done.isPending}
          onClick={() => done.mutate(action.id)}
        >
          {t(message('Đánh dấu xong', 'Mark done', '완료 표시'))}
        </Button>
      )}
    </li>
  )
}

export function ReadNote({
  period,
  actorId,
  data,
}: {
  period: string
  actorId: string
  data: KpiOneOnOneResponse
}) {
  const { t } = useI18n()
  const ack = useAcknowledgeKpiOneOnOne(period, actorId)
  if (data.note === null) {
    return (
      <p className={NOTE}>
        {t(
          message(
            'Chưa có nhận xét cho tháng này.',
            'No note for this month yet.',
            '이번 달 의견이 아직 없습니다.',
          ),
        )}
      </p>
    )
  }
  return (
    <GlassCard className={cn(TILE, 'gap-4')}>
      <div className="flex flex-col gap-2">
        <span className="text-[12.5px] font-semibold">
          {t(message('Nhận xét', 'Note', '의견'))}
          {data.writerName && <span className={NOTE}>{` · ${data.writerName}`}</span>}
        </span>
        <p className="m-0 whitespace-pre-line text-[13px] leading-5">{data.note}</p>
      </div>
      {data.actions.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[12.5px] font-semibold">
            {t(message('Việc cần làm', 'Actions', '할 일'))}
          </span>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {data.actions.map((a) => (
              <ActionRow key={a.id} action={a} canDone={data.canMarkDone} />
            ))}
          </ul>
        </div>
      )}
      <FailLine error={ack.error} />
      {data.acknowledgedAt ? (
        <p className={cn(NOTE, 'tnum font-num')}>
          {t(
            message(
              `Đã trao đổi ngày ${dmy(data.acknowledgedAt)}`,
              `Discussed on ${dmy(data.acknowledgedAt)}`,
              `${dmy(data.acknowledgedAt)}에 논의함`,
            ),
          )}
        </p>
      ) : (
        data.canAcknowledge && (
          <Button
            className="pointer-coarse:h-12 self-start"
            disabled={ack.isPending}
            onClick={() => ack.mutate()}
          >
            {t(message('Xác nhận đã trao đổi', 'Confirm discussed', '논의 확인'))}
          </Button>
        )
      )}
    </GlassCard>
  )
}
