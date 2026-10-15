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
import {
  DOC_STATE_LABEL,
  RecordChannel,
  type ContractCode,
  type DocState,
  type InstallmentRow,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import { dmhm, dmy } from '@/lib/date'
import { CONDITION_SIDE_LABEL, RECORD_CHANNEL_LABEL } from '@/data/contracts'
import { PAY_TEXT_MAX, useAddReminder } from '@/data/contracts-write'
import { BADGE_INK } from '@/data/opportunities'
import { Field } from '@/components/ops-fields'
import type { DayPick, PayDay } from './use-pay-day'

/** The four sections of the installment modal. Each one only words what the
 *  server sent and calls the door the shell or its own form owns. */

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
  return (
    <Section
      divided={false}
      title="Nghiệm thu"
      action={
        onAdd && (
          <Button size="sm" variant="ghost" className="pointer-coarse:h-12" onClick={onAdd}>
            <Icon icon={Plus} size={16} />
            Thêm điều kiện
          </Button>
        )
      }
    >
      {installment.conditions.length === 0 ? (
        <p className={LINE}>Chưa ghi điều kiện nào.</p>
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
                    CONDITION_SIDE_LABEL[c.side],
                    c.who,
                    `hạn ${dmy(c.due)}`,
                    c.doneAt ? `xong ${dmy(c.doneAt)}` : 'chưa xong',
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
                  Đánh dấu xong
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
                {DOC_STATE_LABEL[doc.state]}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/** The collection: the day to record while unpaid, the fact once paid. */
export function PaySection({
  installment,
  canPay,
  pay,
}: {
  installment: InstallmentRow
  canPay: boolean
  pay: PayDay
}) {
  const paid = installment.paidAt !== undefined
  return (
    <Section title="Thu tiền">
      {paid ? (
        <p className="text-success tnum m-0 text-[13px]">
          Đã thu {dmy(installment.paidAt ?? '')}
          {installment.paidBy && ` · ${installment.paidBy.name} ghi nhận`}
        </p>
      ) : canPay ? (
        <>
          <SegmentedControl
            label="Ngày nhận tiền"
            tone="quiet"
            value={pay.pick}
            onChange={(v) => pay.setPick(v as DayPick)}
            options={[
              { value: 'today', label: 'Hôm nay' },
              { value: 'yesterday', label: 'Hôm qua', disabled: !pay.yesterdayOk },
              { value: 'other', label: 'Chọn ngày…' },
            ]}
          />
          {pay.pick === 'other' && (
            <Input
              type="date"
              aria-label="Ngày nhận tiền"
              className="pointer-coarse:h-12 max-w-[200px]"
              value={pay.other}
              min={pay.min}
              max={pay.today}
              onChange={(e) => pay.setOther(e.target.value)}
            />
          )}
        </>
      ) : (
        <p className={LINE}>Chưa thu.</p>
      )}
    </Section>
  )
}

const CHANNELS = RecordChannel.options.map((c) => ({ value: c, label: RECORD_CHANNEL_LABEL[c] }))

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
  const [open, setOpen] = useState(false)
  const [channel, setChannel] = useState('')
  const [what, setWhat] = useState('')
  const [detail, setDetail] = useState('')
  const add = useAddReminder(code)
  const picked = RecordChannel.safeParse(channel)
  const ready = picked.success && what.trim() !== '' && detail.trim() !== ''

  const reset = () => {
    setOpen(false)
    setChannel('')
    setWhat('')
    setDetail('')
  }

  return (
    <Section
      title={`Nhắc khách · ${installment.records.length} lần`}
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
            Ghi lần nhắc
          </Button>
        )
      }
    >
      {installment.records.length === 0 ? (
        <p className={LINE}>Chưa nhắc lần nào.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {installment.records.map((r) => (
            <li key={r.id} className="flex min-w-0 items-start gap-3 text-[12.5px] leading-[1.5]">
              <MetaPill>{RECORD_CHANNEL_LABEL[r.channel]}</MetaPill>
              <span className="min-w-0 flex-1">
                <span className="block break-words">{r.what}</span>
                <span className="text-muted-foreground block break-words text-[12px]">
                  Kết quả: {r.detail}
                </span>
              </span>
              <span className="text-muted-foreground tnum shrink-0 text-[12px]">{dmhm(r.at)}</span>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className="bg-surface-ink/5 flex flex-col gap-4 rounded-md p-4">
          <Field label="Kênh nhắc" required plain>
            <SegmentedControl
              label="Kênh nhắc"
              hideLabel
              tone="quiet"
              value={channel}
              onChange={setChannel}
              options={CHANNELS}
            />
          </Field>
          <Field label="Nội dung đã nhắc" required>
            <Input
              aria-label="Nội dung đã nhắc"
              className="pointer-coarse:h-12"
              maxLength={PAY_TEXT_MAX.what}
              value={what}
              onChange={(e) => setWhat(e.target.value)}
            />
          </Field>
          <Field label="Kết quả" required>
            <Input
              aria-label="Kết quả"
              className="pointer-coarse:h-12"
              maxLength={PAY_TEXT_MAX.detail}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
          </Field>
          <div className="flex items-center justify-end gap-2">
            <Button size="md" variant="ghost" className="pointer-coarse:h-12" onClick={reset}>
              Bỏ
            </Button>
            <Button
              size="md"
              variant="secondary"
              className="pointer-coarse:h-12"
              disabled={!ready || add.isPending}
              onClick={() => {
                if (!picked.success) return
                add.mutate(
                  {
                    no: installment.no,
                    body: { channel: picked.data, what: what.trim(), detail: detail.trim() },
                  },
                  {
                    onSuccess: () => {
                      toastDone('Đã ghi lần nhắc.')
                      reset()
                    },
                  },
                )
              }}
            >
              <Icon icon={Bell} size={16} />
              Lưu lần nhắc
            </Button>
          </div>
          {add.error && (
            <p className="text-destructive-foreground m-0 text-[12px]">{userMessage(add.error)}</p>
          )}
        </div>
      )}
    </Section>
  )
}
