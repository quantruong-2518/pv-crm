import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Modal } from '@pv/ui'
import {
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
import { doorDefault, doorTemplatesQuery } from '@/data/mas'
import { LetterContentCard, LetterPreviewColumn } from './letter-content'
import { LetterFooter } from './letter-footer'
import {
  EMPTY_FORM,
  letterBlocker,
  letterCta,
  letterReadyNote,
  letterWritten,
  queuedToast,
  withGroupHint,
  withTemplate,
  type LetterForm,
} from './letter-model'
import { RecipientPicker, RecipientsCard } from './letter-recipients'
import { useLetterRecipients } from './letter-recipients-state'

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
  unaccepted = false,
  onClose,
}: LetterSubject & {
  /** A deal still at `new`: the send records no milestone (ADR 0071 §3). */
  unaccepted?: boolean
  onClose: () => void
}) {
  const [letterId] = useState(() => crypto.randomUUID())
  const [form, setForm] = useState<LetterForm>(EMPTY_FORM)
  const [seededTemplate, setSeededTemplate] = useState(false)
  const [picking, setPicking] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [failure, setFailure] = useState('')

  const people = useLetterRecipients(door, code, leadCode)
  const { toCodes, cells, cc, preflight } = people
  const report = preflight.report
  const { data: catalogue } = useQuery(doorTemplatesQuery(door))
  const send = useLetterSend()
  const templates = useMemo(() => (catalogue?.rows ?? []).filter((t) => t.active), [catalogue])

  /* The door's default template, once, and only over a blank letter — a
     refetch or a slow catalogue must not overwrite what somebody has typed. */
  useEffect(() => {
    if (seededTemplate || !catalogue) return
    setSeededTemplate(true)
    const preset = doorDefault(templates, door)
    setForm((f) => (f.subject || f.body ? f : withTemplate(f, preset)))
  }, [seededTemplate, catalogue, templates, door])

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

  const blocker = letterBlocker(form, toCodes.length, report?.sendable)
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
          <RecipientsCard
            cells={cells}
            cc={cc}
            colleagues={people.directory}
            onOpenPicker={() => setPicking(true)}
            onDropTo={people.dropTo}
            onAddCc={people.addCc}
            onDropCc={people.dropCc}
          />
          {unaccepted && <UnrecordedMilestone templates={templates} code={form.templateCode} />}
          {/* Two equal columns from `wide:` (1440px): below it half the panel
              crops a ~600px letter, so the letter stacks under the form. */}
          <div className="wide:grid-cols-2 grid min-w-0 items-start gap-6">
            <LetterContentCard door={door} form={form} setForm={setForm} templates={templates} />
            <LetterPreviewColumn
              ready={ready}
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

/** A template that records a milestone, sent from a deal no head accepted:
 *  the send goes out but the milestone is not written (ADR 0071 §3). */
function UnrecordedMilestone({
  templates,
  code,
}: {
  templates: readonly MailTemplateRow[]
  code: string
}) {
  const milestone = templates.find((t) => t.code === code)?.milestone
  if (!milestone) return null
  return (
    <p className="text-warning m-0 text-[12px] leading-5">
      Thư vẫn gửi, nhưng cơ hội chưa được nhận PIC nên mốc {OPPORTUNITY_STAGE_LABEL[milestone]} của
      mẫu này sẽ không được ghi.
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
