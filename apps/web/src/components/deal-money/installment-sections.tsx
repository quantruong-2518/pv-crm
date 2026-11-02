import { useState, type ReactNode } from 'react'
import {
  Badge,
  Bell,
  Button,
  Check,
  Icon,
  Input,
  MetaPill,
  Plus,
  SegmentedControl,
  Separator,
  StatusDot,
  cn,
} from '@pv/ui'
import { RecordChannel, type ContractCode, type DocState, type InstallmentRow } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { dmhm, dmy } from '@/lib/date'
import { conditionSideText, docStateText, recordChannelText } from '@/data/installment-copy'
import { PAY_TEXT_MAX, useAddReminder } from '@/data/contracts-write'
import { BADGE_INK } from '@/data/opportunities'
import { Field } from '@/components/ops-fields'

/** The sections of the installment modal. Each one only words what the
 *  server sent and calls the door the shell or its own form owns. Collecting
 *  is not here: it lives on the installment screen, under its contract. */

const LINE = 'text-muted-foreground m-0 text-[12.5px] leading-[1.6]'

const DOC_TONE: Record<DocState, 'success' | 'warning' | 'draft'> = {
  complete: 'success',
  'awaiting-signature': 'warning',
  missing: 'draft',
}

export function Section({
  title,
  action,
  divided = true,
  children,
}: {
  title: string
  action?: ReactNode
  /** A line above, so neighbours read apart in both themes. */
  divided?: boolean
  children: ReactNode
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 pb-4">
      {divided && <Separator className="mb-1" />}
      <div className="flex items-center gap-3">
        <h3 className="font-display m-0 flex-1 text-[14px] font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/** The unlock checklist and the document slots it waits on. The blocking line
 *  (the one holding the installment up) has the footer's button; every other
 *  open line carries its own tick. */
export function AcceptSection({
  installment,
  canTick,
  blockingId,
  ticking,
  onTick,
  onAdd,
}: {
  installment: InstallmentRow
  canTick: boolean
  /** The condition the footer button acts on. */
  blockingId: string | undefined
  ticking: boolean
  onTick: (id: string) => void
  /** Absent = the reader may not add a condition. */
  onAdd?: (() => void) | undefined
}) {
  const { t, lang } = useI18n()
  return (
    <Section
      divided={false}
      title={t(message('Nghiệm thu', 'Acceptance', '검수'))}
      action={
        onAdd && (
          <Button size="sm" variant="ghost" className="pointer-coarse:h-12" onClick={onAdd}>
            <Icon icon={Plus} size={16} />
            {t(message('Thêm điều kiện', 'Add condition', '조건 추가'))}
          </Button>
        )
      }
    >
      {installment.conditions.length === 0 ? (
        <p className={LINE}>
          {t(
            message(
              'Chưa ghi điều kiện nào.',
              'No conditions recorded.',
              '기록된 조건이 없습니다.',
            ),
          )}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {installment.conditions.map((c) => (
            <li
              key={c.id}
              className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2 text-[12.5px] leading-[1.5]"
            >
              <StatusDot state={c.doneAt ? 'ok' : 'next'} className="mt-1 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block break-words">{c.what}</span>
                <span className="text-muted-foreground tnum text-[12px]">
                  {[
                    conditionSideText(c.side, lang),
                    c.who,
                    t(message(`hạn ${dmy(c.due)}`, `due ${dmy(c.due)}`, `기한 ${dmy(c.due)}`)),
                    c.doneAt
                      ? t(
                          message(
                            `xong ${dmy(c.doneAt)}`,
                            `done ${dmy(c.doneAt)}`,
                            `완료 ${dmy(c.doneAt)}`,
                          ),
                        )
                      : t(message('chưa xong', 'not done', '미완료')),
                  ].join(' · ')}
                </span>
              </span>
              {canTick && !c.doneAt && c.id !== blockingId && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="pointer-coarse:h-12 shrink-0"
                  disabled={ticking}
                  onClick={() => onTick(c.id)}
                >
                  <Icon icon={Check} size={16} />
                  {t(message('Đánh dấu xong', 'Mark as done', '완료로 표시'))}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {installment.docs.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {installment.docs.map((doc) => (
            <li key={doc.id} className="flex min-w-0 items-center gap-3 text-[12.5px]">
              <span className="min-w-0 flex-1">
                <span className="block break-words">{doc.name}</span>
                <span className="text-muted-foreground text-[12px]">{doc.hint}</span>
              </span>
              <Badge
                tone={DOC_TONE[doc.state]}
                className={cn('shrink-0', doc.state === 'missing' && BADGE_INK)}
              >
                {docStateText(doc.state, lang)}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/** Past reminders, and the form that records another — inline, not a layer. */
export function ReminderSection({
  code,
  installment,
  canRemind,
}: {
  code: ContractCode
  installment: InstallmentRow
  canRemind: boolean
}) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)

  return (
    <Section
      title={t(
        message(
          `Nhắc khách · ${installment.records.length} lần`,
          `Reminders · ${installment.records.length}`,
          `고객 알림 · ${installment.records.length}회`,
        ),
      )}
      action={
        canRemind && (
          <Button
            size="sm"
            variant="ghost"
            className="pointer-coarse:h-12"
            aria-expanded={open}
            onClick={() => setOpen((was) => !was)}
          >
            <Icon icon={Plus} size={16} />
            {t(message('Ghi lần nhắc', 'Log a reminder', '알림 기록'))}
          </Button>
        )
      }
    >
      {installment.records.length === 0 ? (
        <p className={LINE}>
          {t(message('Chưa nhắc lần nào.', 'No reminders yet.', '아직 보낸 알림이 없습니다.'))}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {installment.records.map((r) => (
            <li key={r.id} className="flex min-w-0 items-start gap-3 text-[12.5px] leading-[1.5]">
              <MetaPill>{recordChannelText(r.channel, lang)}</MetaPill>
              <span className="min-w-0 flex-1">
                <span className="block break-words">{r.what}</span>
                <span className="text-muted-foreground block break-words text-[12px]">
                  {t(message('Kết quả: ', 'Result: ', '결과: '))}
                  {r.detail}
                </span>
              </span>
              <span className="text-muted-foreground tnum shrink-0 text-[12px]">{dmhm(r.at)}</span>
            </li>
          ))}
        </ul>
      )}
      {open && <ReminderForm code={code} no={installment.no} onClose={() => setOpen(false)} />}
    </Section>
  )
}

/** The form that records one reminder. Mounted only while open, so closing
 *  it (saved or dropped) clears every box. */
export function ReminderForm({
  code,
  no,
  onClose,
}: {
  code: ContractCode
  no: number
  onClose: () => void
}) {
  const { t, lang } = useI18n()
  const channels = RecordChannel.options.map((c) => ({
    value: c,
    label: recordChannelText(c, lang),
  }))
  const [channel, setChannel] = useState('')
  const [what, setWhat] = useState('')
  const [detail, setDetail] = useState('')
  const add = useAddReminder(code)
  const picked = RecordChannel.safeParse(channel)
  const ready = picked.success && what.trim() !== '' && detail.trim() !== ''

  return (
    <div className="bg-surface-ink/5 flex flex-col gap-4 rounded-md p-4">
      <Field label={t(message('Kênh nhắc', 'Reminder channel', '알림 채널'))} required plain>
        <SegmentedControl
          label={t(message('Kênh nhắc', 'Reminder channel', '알림 채널'))}
          hideLabel
          tone="quiet"
          value={channel}
          onChange={setChannel}
          options={channels}
        />
      </Field>
      <Field label={t(message('Nội dung đã nhắc', 'What was said', '알린 내용'))} required>
        <Input
          aria-label={t(message('Nội dung đã nhắc', 'What was said', '알린 내용'))}
          className="pointer-coarse:h-12"
          maxLength={PAY_TEXT_MAX.what}
          value={what}
          onChange={(e) => setWhat(e.target.value)}
        />
      </Field>
      <Field label={t(message('Kết quả', 'Result', '결과'))} required>
        <Input
          aria-label={t(message('Kết quả', 'Result', '결과'))}
          className="pointer-coarse:h-12"
          maxLength={PAY_TEXT_MAX.detail}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
        />
      </Field>
      <div className="flex items-center justify-end gap-2">
        <Button size="md" variant="ghost" className="pointer-coarse:h-12" onClick={onClose}>
          {t(message('Bỏ', 'Discard', '취소'))}
        </Button>
        <Button
          size="md"
          variant="secondary"
          className="pointer-coarse:h-12"
          disabled={!ready || add.isPending}
          onClick={() => {
            if (!picked.success) return
            add.mutate(
              { no, body: { channel: picked.data, what: what.trim(), detail: detail.trim() } },
              {
                onSuccess: () => {
                  toastDone(
                    t(message('Đã ghi lần nhắc.', 'Reminder logged.', '알림을 기록했습니다.')),
                  )
                  onClose()
                },
              },
            )
          }}
        >
          <Icon icon={Bell} size={16} />
          {t(message('Lưu lần nhắc', 'Save reminder', '알림 저장'))}
        </Button>
      </div>
      {add.error && (
        <p className="text-destructive-foreground m-0 text-[12px]">{userMessage(add.error)}</p>
      )}
    </div>
  )
}
