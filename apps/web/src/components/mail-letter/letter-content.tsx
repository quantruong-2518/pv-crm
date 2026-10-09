import type { Dispatch, SetStateAction } from 'react'
import { PenLine } from '@pv/ui'
import { GlassCard, Icon, Input, Select } from '@pv/ui'
import {
  MAIL_DOOR_LABEL,
  MAIL_SUBJECT_MAX,
  SALES_INBOX,
  type MailSubjectKind,
  type MailTemplateRow,
  type MailTransport,
  type MasPreviewResponse,
} from '@pv/contracts'
import { MailPreviewCard } from '@/components/mail-compose-bits'
import { BodyField } from '@/components/mail-sequence/body-field'
import { addresseeLine, withTemplate, type LetterForm } from './letter-model'

/** The two equal columns of the one-screen composer: the letter being written
 *  on the left, the letter as it will leave on the right (G-Compose). The attachment block of the
 *  board is left out on purpose — attachments are not in this turn's scope. */

export function LetterContentCard({
  door,
  form,
  setForm,
  templates,
}: {
  door: MailSubjectKind
  form: LetterForm
  setForm: Dispatch<SetStateAction<LetterForm>>
  /** Already filtered to this door by the server (G4). */
  templates: readonly MailTemplateRow[]
}) {
  const doorLabel = MAIL_DOOR_LABEL[door].toLowerCase()
  const set = (patch: Partial<LetterForm>) => setForm((f) => ({ ...f, ...patch }))

  return (
    <GlassCard className="flex min-w-0 flex-col gap-4 p-5 lg:p-6">
      <span className="flex items-center gap-2 text-[13px] font-semibold leading-5">
        <Icon icon={PenLine} size={16} />
        Nội dung thư
      </span>

      <label className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[12px]">
          {`Mẫu thư · chỉ mẫu dùng ở ${doorLabel}`}
        </span>
        <Select
          label="Mẫu thư"
          hideLabel
          size="lg"
          value={form.templateCode}
          onChange={(code) =>
            setForm((f) =>
              withTemplate(
                f,
                templates.find((t) => t.code === code),
              ),
            )
          }
          options={[
            ...templates.map((t) => ({
              value: t.code,
              label: t.defaultFor.includes(door) ? `${t.name} · mặc định ở ${doorLabel}` : t.name,
            })),
            { value: '', label: 'Tự soạn' },
          ]}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-muted-foreground tnum text-[12px]">
          {`Tiêu đề email · ${form.subject.length}/${MAIL_SUBJECT_MAX}`}
        </span>
        <Input
          className="h-12"
          value={form.subject}
          maxLength={MAIL_SUBJECT_MAX}
          placeholder="Tiêu đề người nhận đọc thấy trong hộp thư"
          onChange={(e) => set({ subject: e.target.value })}
        />
      </label>

      <BodyField body={form.body} onBody={(body) => set({ body })} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[12px]">
            Nút trong email · nhãn (không bắt buộc)
          </span>
          <Input
            className="h-12"
            value={form.ctaLabel}
            maxLength={80}
            onChange={(e) => set({ ctaLabel: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[12px]">Nút trong email · URL</span>
          <Input
            className="h-12"
            value={form.ctaUrl}
            placeholder="https://…"
            onChange={(e) => set({ ctaUrl: e.target.value })}
          />
        </label>
      </div>
    </GlassCard>
  )
}

/** The letter as its readers get it, under the envelope they see. Nothing is
 *  drawn until there is a letter AND someone to address it to — the preview
 *  route needs a first To to fill `{{contactName}}`. */
export function LetterPreviewColumn({
  ready,
  transport,
  letter,
  pending,
  error,
  to,
  cc,
}: {
  ready: boolean
  /** The mailbox the letter will leave from; absent while that is not known
   *  or the chosen one cannot send — then no mailbox and no reply line is shown. */
  transport?: MailTransport
  letter?: MasPreviewResponse
  pending: boolean
  error: string
  to: readonly { name: string }[]
  cc: readonly { name: string; email: string }[]
}) {
  if (!ready) {
    return (
      <p className="text-muted-foreground m-0 px-1 text-[12px] leading-5">
        Bản xem trước hiện ở đây ngay khi có người trong To, tiêu đề và nội dung.
      </p>
    )
  }
  return (
    <MailPreviewCard
      letter={letter}
      pending={pending}
      error={error}
      envelope={[
        { label: 'Từ', value: (transport && letter?.from) || '—' },
        { label: 'Tới', value: to.map((person) => person.name).join(', ') || '—' },
        { label: 'CC', value: addresseeLine([...cc, { email: SALES_INBOX }]) },
      ]}
      caption={`Thư nhóm: mọi người trong To và CC nhận cùng một bản.${
        transport === 'gmail'
          ? ' Khách trả lời vào hộp thư của bạn; hệ thống tự ghi nhận “Đã trả lời”.'
          : transport === 'resend'
            ? ' Thư trả lời của khách không về hộp thư của bạn.'
            : ''
      }`}
    />
  )
}
