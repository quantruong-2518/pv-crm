import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Modal, cn } from '@pv/ui'
import {
  OPPORTUNITY_MILESTONE_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  type MailGroupPreflightResponse,
  type MailSubjectKind,
  type MailTemplateRow,
} from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { toast } from '@/app/toast'
import { MailFloatingAids } from '@/components/mail-compose-bits'
import { MailGuideDrawer } from '@/components/mail-guide-drawer'
import { mailHints } from '@/data/mail-hints'
import { useLetterPreview, useLetterSend } from '@/data/mail-letters'
import { doorTemplatesQuery } from '@/data/mas'
import type { EventOffer } from '@/data/opportunities'
import { LetterContentCard, LetterPreviewColumn } from './letter-content'
import { LetterFooter } from './letter-footer'
import { useLetterForm } from './letter-form-state'
import {
  letterBlocker,
  letterCta,
  letterReadyNote,
  letterWritten,
  queuedToast,
  withGroupHint,
} from './letter-model'
import { RecipientPicker, RecipientsCard } from './letter-recipients'
import { useLetterRecipients } from './letter-recipients-state'
import { LetterSenderLine } from './letter-sender'

/** An activity or the next quotation round, or the reason nothing is recorded;
 *  `primaryContact` is the deal's own addressee (contact code), seeded into To. */
type DealRecord = { offer: EventOffer | null; block: string | null; primaryContact?: string | null }

/** THE ONE-SCREEN COMPOSER (G1) — a detail door (lead · opportunity · contract)
 *  writes ONE letter every recipient reads in To/CC, with `sales@` locked in CC.
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

export function LetterComposer({
  door,
  code,
  leadCode,
  deal,
  onClose,
}: LetterSubject & {
  /** What a template's milestone does on THIS deal (ADR 0072 §5). */
  deal?: DealRecord
  onClose: () => void
}) {
  const [letterId] = useState(() => crypto.randomUUID())
  const [picking, setPicking] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [failure, setFailure] = useState('')

  const people = useLetterRecipients(door, code, leadCode, deal?.primaryContact)
  const { toCodes, cells, cc, preflight } = people
  const report = preflight.report
  const { data: catalogue } = useQuery(doorTemplatesQuery(door))
  const send = useLetterSend()
  const templates = useMemo(() => (catalogue?.rows ?? []).filter((t) => t.active), [catalogue])
  const { form, setForm, dirty } = useLetterForm(door, templates, catalogue !== undefined)

  const cta = letterCta(form)
  const ready = people.addressing !== null && letterWritten(form)
  const preview = useLetterPreview(
    ready && people.addressing
      ? { ...people.addressing, subject: form.subject, body: form.body, ...(cta ? { cta } : {}) }
      : null,
  )
  const hints = withGroupHint(
    mailHints({
      subject: form.subject,
      body: form.body,
      ctaUrl: form.ctaUrl,
      missing: preview.letter?.missing,
    }),
    toCodes.length,
    form.body,
  )

  const blocker = letterBlocker(
    form,
    toCodes.length,
    report?.sendable,
    preflight.sender?.mustConnect,
  )
  const fault = failure || preflight.error
  const message =
    fault ||
    (preflight.checking
      ? 'Đang kiểm tra người nhận…'
      : (blocker ?? (report ? letterReadyNote(report) : '')))
  const badge = <ToBadge checking={preflight.checking} report={report} />

  const submit = async () => {
    if (blocker || !report || send.isPending) return
    setFailure('')
    try {
      const result = await send.mutateAsync({
        door,
        subjectCode: code,
        letterId,
        to: toCodes,
        ccActorIds: people.ccIds,
        ...(form.templateCode ? { templateCode: form.templateCode } : {}),
        subject: form.subject,
        body: form.body,
        ...(cta ? { cta } : {}),
        ...(form.timing === 'later' ? { scheduledAt: new Date(form.at).toISOString() } : {}),
      })
      const said = queuedToast(result.state, form.at)
      toast(said.title, { tone: 'success', detail: said.detail })
      onClose()
    } catch (error) {
      setFailure(isApiError(error) ? userMessage(error) : 'Không tạo được thư này.')
    }
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        width="wide"
        title={`Gửi email · ${code}`}
        meta={badge}
        footer={
          <LetterFooter
            message={message}
            warn={Boolean(fault) || (!preflight.checking && Boolean(blocker))}
            form={form}
            setTiming={(timing, at) => setForm((f) => ({ ...f, timing, at }))}
            sendDisabled={Boolean(blocker) || !report || send.isPending}
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
            <p className="text-warning m-0 text-[12px] leading-5">
              Không đọc được danh bạ liên hệ của khách này — chưa thêm người nhận được.
            </p>
          )}
          <LetterSenderLine sender={preflight.sender} dirty={dirty} />
          <RecipientsCard
            cells={cells}
            cc={cc}
            colleagues={people.directory}
            onOpenPicker={() => setPicking(true)}
            onDropTo={people.dropTo}
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
              transport={preflight.sender?.transport}
              letter={preview.letter}
              pending={preview.pending}
              error={preview.error}
              to={cells}
              cc={cc}
            />
          </div>
        </div>
      </Modal>

      <RecipientPicker
        open={picking}
        onClose={() => setPicking(false)}
        company={people.contacts.company}
        pool={people.contacts.rows}
        cells={cells}
        badge={badge}
        onAdd={people.addTo}
        onDrop={people.dropTo}
      />
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
  const milestone = templates.find((t) => t.code === code)?.milestone
  if (!milestone) return null
  const quoting = milestone === 'quotation'
  const what = quoting
    ? OPPORTUNITY_MILESTONE_LABEL.quotation
    : `hoạt động ${OPPORTUNITY_MILESTONE_LABEL.sample}`
  const offer = deal.offer
  const moves = offer?.atAssigned
    ? ` và chuyển cơ hội sang cột ${OPPORTUNITY_STAGE_LABEL[quoting ? 'quotation' : 'engaged']}`
    : ''
  return (
    <p
      className={cn(
        'm-0 text-[12px] leading-5',
        !offer || (quoting && offer.atAssigned) ? 'text-warning' : 'text-muted-foreground',
      )}
    >
      {!offer
        ? `Thư vẫn gửi, ${what} sẽ không được ghi. ${deal.block ?? ''}`.trim()
        : quoting
          ? `Gửi thành công sẽ ghi ${what} (lần ${offer.nextRound})${moves}` +
            (offer.atAssigned ? ' — bỏ qua cột chăm sóc vì chưa có hoạt động nào.' : '.')
          : `Gửi thành công sẽ ghi một ${what}${moves}.`}
    </p>
  )
}

/** The recipients and delivery parts of the guide explain the three-step
 *  mould; this panel has neither a list step nor a delivery step. */
const CONTENT_ONLY = ['content' as const]

/** The header count — the server's, once it answered for this list. */
function ToBadge({ checking, report }: { checking: boolean; report?: MailGroupPreflightResponse }) {
  if (checking) return <Badge tone="draft">Đang kiểm tra…</Badge>
  const sendable = report?.sendable ?? 0
  return (
    <Badge tone={!report || sendable === 0 ? 'draft' : report.blocked ? 'warning' : 'success'}>
      <span className="tnum">{`${sendable} người sẽ nhận`}</span>
    </Badge>
  )
}
