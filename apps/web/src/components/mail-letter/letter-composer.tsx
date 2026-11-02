import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Modal, cn } from '@pv/ui'
import {
  type MailGroupPreflightResponse,
  type MailSubjectKind,
  type MailTemplateRow,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { message, useI18n } from '@/app/i18n'
import { MailFloatingAids } from '@/components/mail-compose-bits'
import { MailGuideDrawer } from '@/components/mail-guide-drawer'
import { mailHints } from '@/data/mail-hints'
import { useLetterPreview, useLetterSend } from '@/data/mail-letters'
import { doorTemplatesQuery } from '@/data/mas'
import type { EventOffer } from '@/data/opportunities'
import { LetterContentCard, LetterPreviewColumn } from './letter-content'
import { LetterFooter } from './letter-footer'
import { useLetterForm, useLetterSender } from './letter-form-state'
import {
  letterBlocker,
  letterCta,
  letterReadyNote,
  letterWritten,
  queuedToast,
  withGroupHint,
} from './letter-model'
import { RecipientsCard } from './letter-recipients'
import { useLetterRecipients } from './letter-recipients-state'
import { LetterSenderLine } from './letter-sender'

/** An activity or the next quotation round, or the reason nothing is recorded. */
type DealRecord = { offer: EventOffer | null; block: string | null }

/** THE ONE-SCREEN COMPOSER (G1) — a detail door (lead · opportunity · contract)
 *  writes ONE letter to ONE fixed person in To (the contact it was opened
 *  from), with `sales@` locked in CC.
 *
 *  Mounted per opening by its page, so `letterId` is minted exactly once per
 *  letter: a retried send carries the same id and the server answers with the
 *  run it already filed. Send opens only once the preflight answered for the
 *  exact To list on screen (G2) and at least one person will receive it. */
export type LetterSubject = {
  door: MailSubjectKind
  /** The object the letter is about — its code names the run (G3). */
  code: string
  /** Its lead: whose contacts may be addressed, and whose scope the server checks. */
  leadCode: string
}

const COMPOSER = {
  checkingRecipients: message(
    'Đang kiểm tra người nhận…',
    'Checking recipients…',
    '받는 사람 확인 중…',
  ),
  couldNotCreateThis: message(
    'Không tạo được thư này.',
    'Could not create this letter.',
    '이 메일을 만들지 못했습니다.',
  ),
  couldNotReadThe: message(
    'Không đọc được danh sách người liên hệ. Chưa chọn được người nhận.',
    'Could not read the contact list. Recipients cannot be chosen yet.',
    '연락처 목록을 읽지 못했습니다. 아직 받는 사람을 선택할 수 없습니다.',
  ),
}

export function LetterComposer({
  door,
  code,
  leadCode,
  to,
  deal,
  onClose,
}: LetterSubject & {
  /** The contact (code) the letter goes to; absent = the lead's primary person. */
  to?: string | null
  /** What a template's milestone does on THIS deal (ADR 0072 §5). */
  deal?: DealRecord
  onClose: () => void
}) {
  const { t, lang } = useI18n()
  const [letterId] = useState(() => crypto.randomUUID())
  const [guideOpen, setGuideOpen] = useState(false)
  const [failure, setFailure] = useState('')

  const people = useLetterRecipients(door, code, leadCode, to)
  const { toCodes, cells, cc, preflight } = people
  const report = preflight.report
  const { data: catalogue } = useQuery(doorTemplatesQuery(door))
  const send = useLetterSend()
  const templates = useMemo(() => (catalogue?.rows ?? []).filter((t) => t.active), [catalogue])
  const { form, setForm } = useLetterForm(door, templates, catalogue !== undefined)

  const from = useLetterSender(preflight, form.timing === 'later')
  const transport = from.transport

  const cta = letterCta(form)
  const ready = people.addressing !== null && letterWritten(form)
  const letter = { subject: form.subject, body: form.body, ...(cta ? { cta } : {}) }
  const preview = useLetterPreview(
    ready && people.addressing && transport ? { ...people.addressing, ...letter, transport } : null,
  )
  const hints = withGroupHint(
    mailHints(
      {
        subject: form.subject,
        body: form.body,
        ctaUrl: form.ctaUrl,
        missing: preview.letter?.missing,
      },
      lang,
    ),
    toCodes.length,
    form.body,
    lang,
  )

  const blocker = letterBlocker(form, toCodes.length, report?.sendable, from.fault, lang)
  const fault = failure || preflight.error
  const status =
    fault ||
    (preflight.checking
      ? t(COMPOSER.checkingRecipients)
      : (blocker ?? (report ? letterReadyNote(report, lang) : '')))
  const badge = <ToBadge checking={preflight.checking} report={report} />

  const submit = async () => {
    if (blocker || !report || !transport || send.isPending) return
    setFailure('')
    try {
      const result = await send.mutateAsync({
        door,
        subjectCode: code,
        letterId,
        to: toCodes,
        ccActorIds: people.ccIds,
        ...(form.templateCode ? { templateCode: form.templateCode } : {}),
        ...letter,
        transport,
        ...(form.timing === 'later' ? { scheduledAt: new Date(form.at).toISOString() } : {}),
      })
      const said = queuedToast(result.state, form.at, lang)
      toast(said.title, { tone: 'success', detail: said.detail })
      onClose()
    } catch (error) {
      setFailure(isApiError(error) ? userMessage(error) : t(COMPOSER.couldNotCreateThis))
    }
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        width="wide"
        title={t(message(`Gửi email · ${code}`, `Send email · ${code}`, `이메일 보내기 · ${code}`))}
        meta={badge}
        footer={
          <LetterFooter
            status={status}
            warn={Boolean(fault) || (!preflight.checking && Boolean(blocker))}
            failed={Boolean(fault)}
            form={form}
            setTiming={(timing, at) => setForm((f) => ({ ...f, timing, at }))}
            sendDisabled={Boolean(blocker) || !report || !transport || send.isPending}
            sending={send.isPending}
            aids={<MailFloatingAids hints={hints} onGuide={() => setGuideOpen(true)} />}
            {...(preflight.error ? { onRetryCheck: preflight.retry } : {})}
            onCancel={onClose}
            onSend={() => void submit()}
          />
        }
      >
        <div className="flex min-w-0 flex-col gap-5">
          {people.contacts.failed && (
            <p className="text-destructive-foreground m-0 text-[12px] leading-5">
              {t(COMPOSER.couldNotReadThe)}
            </p>
          )}
          <LetterSenderLine line={from.line} />
          <RecipientsCard
            cells={cells}
            cc={cc}
            colleagues={people.directory}
            onAddCc={people.addCc}
            onDropCc={people.dropCc}
          />
          {deal && <MilestoneNote templates={templates} code={form.templateCode} deal={deal} />}
          {/* Two equal columns from `wide:` (1440px): below it half the panel
              crops a ~600px letter, so the letter stacks under the form. */}
          <div className="wide:grid-cols-2 grid min-w-0 items-start gap-6">
            <LetterContentCard door={door} form={form} setForm={setForm} templates={templates} />
            <LetterPreviewColumn
              ready={ready}
              {...(from.shown ? { transport: from.shown } : {})}
              letter={preview.letter}
              pending={preview.pending}
              error={preview.error}
              to={cells}
              cc={cc}
            />
          </div>
        </div>
      </Modal>

      <MailGuideDrawer
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        section="content"
        parts={CONTENT_ONLY}
      />
    </>
  )
}

/** What the chosen template's milestone will record, said before the send —
 *  or why it will record nothing (`eventBlockOf`). Silent without a milestone. */
function MilestoneNote({
  templates,
  code,
  deal,
}: {
  templates: readonly MailTemplateRow[]
  code: string
  deal: DealRecord
}) {
  const { t } = useI18n()
  const milestone = templates.find((t) => t.code === code)?.milestone
  if (!milestone) return null
  const quoting = milestone === 'quotation'
  const offer = deal.offer
  const text = !offer
    ? t(
        message(
          `Thư vẫn gửi nhưng không ghi ${quoting ? 'Báo giá' : 'hoạt động Sample'}. ${deal.block ?? ''}`,
          `The letter still goes out but no ${quoting ? 'quotation' : 'Sample activity'} is recorded. ${deal.block ?? ''}`,
          `메일은 발송되지만 ${quoting ? '견적서' : '샘플 활동'}은(는) 기록되지 않습니다. ${deal.block ?? ''}`,
        ),
      ).trim()
    : quoting
      ? t(
          message(
            `Gửi thành công sẽ ghi một lần Báo giá${offer.atAssigned ? ' và chuyển cơ hội sang cột Báo giá, bỏ qua cột chăm sóc vì chưa có hoạt động nào.' : '.'} Giá trị và loại hợp đồng bổ sung trên hồ sơ cơ hội.`,
            `A successful send records one quotation${offer.atAssigned ? ' and moves the opportunity to the Quotation column, skipping the nurturing column because there is no activity yet.' : '.'} Add the value and contract type on the opportunity profile.`,
            `발송에 성공하면 견적서가 1회 기록됩니다${offer.atAssigned ? '. 기회가 견적 열로 이동하며 아직 활동이 없어 육성 열은 건너뜁니다.' : '.'} 금액과 계약 유형은 기회 상세에서 추가하세요.`,
          ),
        )
      : t(
          message(
            `Gửi thành công sẽ ghi một hoạt động Sample${offer.atAssigned ? ' và chuyển cơ hội sang cột Chăm sóc' : ''}.`,
            `A successful send records one Sample activity${offer.atAssigned ? ' and moves the opportunity to the Nurturing column' : ''}.`,
            `발송에 성공하면 샘플 활동이 1건 기록됩니다${offer.atAssigned ? '. 기회가 육성 열로 이동합니다' : ''}.`,
          ),
        )
  return (
    <p
      className={cn(
        'm-0 text-[12px] leading-5',
        !offer || (quoting && offer.atAssigned) ? 'text-warning' : 'text-muted-foreground',
      )}
    >
      {text}
    </p>
  )
}

/** The recipients and delivery parts of the guide explain the three-step
 *  mould; this panel has neither a list step nor a delivery step. */
const CONTENT_ONLY = ['content' as const]

/** The header count — the server's, once it answered for this list. */
function ToBadge({ checking, report }: { checking: boolean; report?: MailGroupPreflightResponse }) {
  const { t } = useI18n()
  if (checking)
    return <Badge tone="draft">{t(message('Đang kiểm tra…', 'Checking…', '확인 중…'))}</Badge>
  const sendable = report?.sendable ?? 0
  return (
    <Badge tone={!report || sendable === 0 ? 'draft' : report.blocked ? 'warning' : 'success'}>
      <span className="tnum">
        {t(
          message(`${sendable} người sẽ nhận`, `${sendable} will receive`, `${sendable}명이 수신`),
        )}
      </span>
    </Badge>
  )
}
