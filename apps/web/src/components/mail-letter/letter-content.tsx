import type { Dispatch, SetStateAction } from 'react'
import { PenLine } from '@pv/ui'
import { GlassCard, Icon, Input, Select } from '@pv/ui'
import {
  MAIL_SUBJECT_MAX,
  SALES_INBOX,
  type MailSubjectKind,
  type MailTemplateRow,
  type MailTransport,
  type MasPreviewResponse,
} from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { mailDoorLabel } from '@/data/mail-door-copy'
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
  const { t, lang } = useI18n()
  const doorLabel = mailDoorLabel(door, lang).toLowerCase()
  const set = (patch: Partial<LetterForm>) => setForm((f) => ({ ...f, ...patch }))

  return (
    <GlassCard className="flex min-w-0 flex-col gap-4 p-5 lg:p-6">
      <span className="flex items-center gap-2 text-[13px] font-semibold leading-5">
        <Icon icon={PenLine} size={16} />
        {t(message('Nội dung thư', 'Letter content', '메일 내용'))}
      </span>

      <label className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[12px]">
          {t(
            message(
              `Mẫu thư · chỉ mẫu dùng ở ${doorLabel}`,
              `Template · only templates used for ${doorLabel}`,
              `메일 양식 · ${doorLabel}에서 사용하는 양식만`,
            ),
          )}
        </span>
        <Select
          label={t(message('Mẫu thư', 'Template', '메일 양식'))}
          hideLabel
          size="lg"
          value={form.templateCode}
          onChange={(code) =>
            setForm((f) =>
              withTemplate(
                f,
                templates.find((tpl) => tpl.code === code),
              ),
            )
          }
          options={[
            ...templates.map((tpl) => ({
              value: tpl.code,
              label: tpl.defaultFor.includes(door)
                ? t(
                    message(
                      `${tpl.name} · mặc định ở ${doorLabel}`,
                      `${tpl.name} · default for ${doorLabel}`,
                      `${tpl.name} · ${doorLabel} 기본값`,
                    ),
                  )
                : tpl.name,
            })),
            { value: '', label: t(message('Tự soạn', 'Write my own', '직접 작성')) },
          ]}
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-muted-foreground tnum text-[12px]">
          {`${t(message('Tiêu đề email', 'Email subject', '이메일 제목'))} · ${form.subject.length}/${MAIL_SUBJECT_MAX}`}
        </span>
        <Input
          className="h-12"
          value={form.subject}
          maxLength={MAIL_SUBJECT_MAX}
          placeholder={t(
            message(
              'Tiêu đề người nhận đọc thấy trong hộp thư',
              'The subject the recipient sees in their inbox',
              '받는 사람의 받은편지함에 표시되는 제목',
            ),
          )}
          onChange={(e) => set({ subject: e.target.value })}
        />
      </label>

      <BodyField body={form.body} onBody={(body) => set({ body })} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[12px]">
            {t(
              message(
                'Nút trong email · nhãn (không bắt buộc)',
                'Email button · label (optional)',
                '이메일 버튼 · 이름 (선택)',
              ),
            )}
          </span>
          <Input
            className="h-12"
            value={form.ctaLabel}
            maxLength={80}
            onChange={(e) => set({ ctaLabel: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[12px]">
            {t(message('Nút trong email · URL', 'Email button · URL', '이메일 버튼 · URL'))}
          </span>
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
  const { t } = useI18n()
  if (!ready) {
    return (
      <p className="text-muted-foreground m-0 px-1 text-[12px] leading-5">
        {t(
          message(
            'Bản xem trước hiện khi đã có người nhận, tiêu đề và nội dung.',
            'The preview appears once there is a recipient, a subject and content.',
            '받는 사람, 제목, 내용이 모두 있으면 미리보기가 표시됩니다.',
          ),
        )}
      </p>
    )
  }
  return (
    <MailPreviewCard
      letter={letter}
      pending={pending}
      error={error}
      envelope={[
        { label: t(message('Từ', 'From', '보낸 사람')), value: (transport && letter?.from) || '—' },
        {
          label: t(message('Tới', 'To', '받는 사람')),
          value: to.map((person) => person.name).join(', ') || '—',
        },
        { label: 'CC', value: addresseeLine([...cc, { email: SALES_INBOX }]) },
      ]}
      caption={t(
        message(
          `Thư nhóm: mọi người trong To và CC nhận cùng một bản.${
            transport === 'gmail'
              ? ' Khách trả lời vào hộp thư của bạn. Thư được ghi “Đã trả lời”.'
              : transport === 'resend'
                ? ' Thư trả lời của khách không về hộp thư của bạn.'
                : ''
          }`,
          `Group letter: everyone in To and CC gets the same copy.${
            transport === 'gmail'
              ? ' Customer replies go to your mailbox. The letter is marked “Replied”.'
              : transport === 'resend'
                ? ' Customer replies do not come to your mailbox.'
                : ''
          }`,
          `그룹 메일: To와 CC의 모든 사람이 같은 내용을 받습니다.${
            transport === 'gmail'
              ? ' 고객의 답장은 내 메일함으로 옵니다. 메일은 “답장됨”으로 기록됩니다.'
              : transport === 'resend'
                ? ' 고객의 답장은 내 메일함으로 오지 않습니다.'
                : ''
          }`,
        ),
      )}
    />
  )
}
