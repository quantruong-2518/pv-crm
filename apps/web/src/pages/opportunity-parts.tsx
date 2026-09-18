import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Handshake, Phone, TriangleAlert, Users, type IconGlyph } from '@pv/ui'
import {
  Avatar,
  Button,
  ContextRail,
  FlowVector,
  GlassCard,
  Icon,
  MetaPill,
  ScreenHeader,
  SectionTitle,
  Separator,
  Skeleton,
  cn,
} from '@pv/ui'
import {
  campaignLabel,
  type LeadProfile,
  type OpportunityProfileResponse,
  type OpportunityRow,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { dm, dmhm } from '@/lib/date'
import { phoneText } from '@/lib/phone'
import { realContact } from '@/data/lead-profile'
import { opportunityStageHistoryQuery } from '@/data/opportunities-write'
import type { DealDraft } from '@/data/deal-draft'
import type { FlowVectorStep, RailObject } from '@pv/ui'
import type { TouchEvent, TouchFocus } from '@/data/touches'
import { STAGE_LABEL } from '@/components/ops-fields'
import { ActivityTimeline } from '@/components/lead-history-card'
import { GateRefusal } from '@/components/sign-drawer'

/** Module 3 · the blocks of the deal screen, around the form card itself.
 *
 *  The page keeps the query, the four ways it fails to draw, and the assembly;
 *  everything that PAINTS is here, the same split `lead-detail.tsx` /
 *  `lead-parts.tsx` runs on. The form card has a file of its own because all
 *  three doors share it — see `opportunity-form-card.tsx`. */

/** The header, with no glass around it.
 *
 *  Identity on the left, the person to call on the right, and ONE row under
 *  the title carrying both provenance and the object chain. The card that used
 *  to wrap this is gone: it split a header into two halves that competed, and
 *  law 12 counts every surface.
 *
 *  THE RAIL RIDES IN THAT ROW rather than standing under the header as a strip
 *  of its own. Law 10 is satisfied either way, and the deal's own lead code was
 *  being printed twice — once as a dead pill, once as the rail's chip. The chip
 *  wins: it opens the record, the pill did not. */
export function DealHeader({
  op,
  lead,
  rail,
  onBack,
  onOpenLead,
}: {
  op: OpportunityRow
  lead: LeadProfile | null
  /** The object chain, already dressed by `railOf`. Law 10. */
  rail: RailObject[]
  onBack: () => void
  onOpenLead: () => void
}) {
  /* Read from the REAL profile, the same translation `lead-detail` runs on. */
  const contact = lead ? realContact(lead) : null

  return (
    <ScreenHeader
      back={{ label: 'Sổ cơ hội', onClick: onBack }}
      kicker={
        <span className="flex items-center gap-2">
          <span className="font-sans">Cơ hội</span>
          {op.code}
        </span>
      }
      title={op.name}
      actions={
        <>
          {contact ? (
            <span className="flex min-w-0 items-center gap-2">
              <Avatar name={contact.name} size="sm" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[12.5px] font-semibold">{contact.name}</span>
                <span className="text-muted-foreground truncate text-[11px] leading-[1.5]">
                  {[contact.title, phoneText(contact.phone)].filter(Boolean).join(' · ') ||
                    'chưa có kênh gọi'}
                </span>
              </span>
            </span>
          ) : (
            <span className="text-warning text-[11.5px] leading-[1.5]">
              Chưa đọc được người liên hệ.
            </span>
          )}

          {/* ICON ONLY, so it needs a name of its own — and `tel:` rather than
              a button that only lights up: a button that does nothing on press
              reads as a broken screen, not as a missing feature. */}
          <Button
            size="md"
            variant="secondary"
            aria-label={contact ? `Gọi ${contact.name}` : 'Gọi khách'}
            title={phoneText(contact?.phone) || 'Chưa moi được kênh gọi lại được'}
            disabled={!contact?.phone}
            className="pointer-coarse:size-12 size-10 shrink-0 px-0"
            onClick={() => {
              if (contact?.phone) window.location.href = `tel:${contact.phone}`
            }}
          >
            <Icon icon={Phone} size={16} />
          </Button>

          {/* 40px on a mouse, 48px on a finger (law 13). NOT `size="lg"`: that
              is 48px everywhere and would swell the header on the desktop. */}
          <Button size="md" className="pointer-coarse:h-12" onClick={onOpenLead}>
            <Icon icon={Users} size={16} />
            Hồ sơ lead
          </Button>
        </>
      }
      meta={
        <>
          {/* ALWAYS drawn (law 10), even as one chip: the deal's own azure chip
              marks where it stands in lead → deal → contract, and a reader cut
              off from the lead still needs that mark. */}
          <ContextRail objects={rail} />
          {lead ? (
            <>
              <MetaPill>{lead.province ?? '—'}</MetaPill>
              <MetaPill>{campaignLabel(lead.source)}</MetaPill>
            </>
          ) : (
            <span className="text-muted-foreground text-[11.5px] leading-[1.5]">
              Chưa đọc được hồ sơ lead <span className="font-mono">{op.leadCode}</span> — có thể nó
              nằm ngoài phạm vi quyền của bạn.
            </span>
          )}
        </>
      }
    />
  )
}

/** The history tab — who has carried the deal, what happened to it, and which
 *  columns it stood in.
 *
 *  Drawn WITHOUT a card of its own: it lives inside the form card's glass, and
 *  a second sheet of glass inside the first is the fifth layer law 12 refuses.
 *  That is why it reaches for `ActivityTimeline` rather than `ActivityCard`. */
export function DealHistoryTab({
  op,
  touches,
  vector,
  me,
  focus,
  onFocusStep,
}: {
  op: OpportunityRow
  touches: readonly TouchEvent[]
  vector: readonly FlowVectorStep[]
  me?: string
  focus: TouchFocus | null
  onFocusStep: (id: string) => void
}) {
  const history = useQuery(opportunityStageHistoryQuery(op.code))
  const rows = history.data?.rows ?? []

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {vector.length > 0 && <FlowVector steps={vector} you={me} onOpen={onFocusStep} />}

      <ActivityTimeline history={touches} focus={focus} />

      <Separator />

      <SectionTitle size="sm" hint="Mỗi lượt đổi cột, và đơn đã đứng đó bao lâu.">
        Đã đi qua
      </SectionTitle>

      {history.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Chưa có lượt đổi cột nào được ghi. Đơn mở trước ngày sổ lịch sử chạy thì bắt đầu từ lượt
          chuyển tiếp theo — số cũ không suy ngược lại được.
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-col gap-1">
              <span className="text-[12px] leading-[1.5]">
                {/* A missing end is a real event, not missing data: entering
                    the board when the deal opened, leaving it when the deal
                    was signed or lost. */}
                {e.from === null
                  ? `Vào bảng ở ${e.to === null ? '—' : stageName(e.to)}`
                  : e.to === null
                    ? `Ra khỏi bảng từ ${stageName(e.from)}`
                    : `${stageName(e.from)} → ${stageName(e.to)}`}
              </span>
              <span className="text-muted-foreground text-[11px] leading-[1.5]">
                {dm(e.at)} · {e.by}
                {e.daysInFrom !== null && ` · đứng ${e.daysInFrom} ngày`}
              </span>
              {e.note !== undefined && (
                <span className="text-muted-foreground text-[11px] leading-[1.5]">{e.note}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** A column's label, falling back to the key itself. Printing the raw key is
 *  ugly but TRUE for a column configured after `PIPELINE_STAGES` was frozen,
 *  while a dash would hide a column that really exists. */
const stageName = (key: NonNullable<OpportunityRow['stage']>) => STAGE_LABEL.get(key) ?? key

/** The sticky bar — what BLOCKS on the left, where to go on the right.
 *
 *  Solid ground (`bg-hc-surface`), no `backdrop-blur`: `.glass-b` sits at alpha
 *  .84 so only 16% of the background comes through, and blurring a static
 *  ground at 16% strength is work the eye never sees — on an element that
 *  repaints every scrolled frame. */
export function DealToolsBar({
  draft,
  op,
  onSign,
}: {
  draft: DealDraft
  /** `null` on the create door — nothing is signed and nothing is dirty yet. */
  op: OpportunityProfileResponse | null
  onSign: () => void
}) {
  const creating = draft.mode === 'create'
  const blocking = Boolean(draft.error) || draft.missing.length > 0

  /* Three states ruling each other out in order: signed prints a static pill
     for EVERY role, lost draws nothing at all (the server answers a 409), and
     anything else opens the sign panel for a role holding `opportunity.close`. */
  const signed = op?.contractCode !== undefined
  const lost = draft.work.state === 'close-lost'
  const pending = op?.pendingSign

  return (
    <div className="z-10 lg:sticky lg:bottom-4">
      <GlassCard
        variant="b"
        className="bg-hc-surface shadow-panel flex flex-wrap items-center gap-3 p-3"
        aria-label="Thanh công cụ"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {draft.gate ? (
            <GateRefusal criteria={draft.gate} />
          ) : (
            <span
              className={cn(
                'flex min-w-0 items-center gap-2 text-[11.5px] leading-[1.5]',
                blocking && 'text-destructive-foreground',
              )}
              aria-live="polite"
            >
              {blocking && <Icon icon={TriangleAlert} size={16} className="shrink-0" />}
              {/* A refusal from the server wins every other sentence: whoever
                  just pressed Save and saw nothing change needs the reason
                  before they need a count of unsaved boxes. */}
              {draft.error
                ? userMessage(draft.error)
                : draft.missing.length > 0
                  ? `Còn thiếu ${draft.missing.join(' · ')}`
                  : creating
                    ? 'Phiếu đã đủ — bấm Tạo cơ hội để ghi vào sổ.'
                    : draft.dirty.length > 0
                      ? `${draft.dirty.length} ô chưa lưu — rời màn bây giờ là mất.`
                      : 'Phiếu đã khớp với bản trên máy chủ.'}
            </span>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {signed && (
            <MetaPill icon={Handshake} tone="success" mono>
              Đã ký · {op?.contractCode}
            </MetaPill>
          )}
          {pending && (
            <MetaPill tone="warning">
              Chờ duyệt ký · {pending.raisedBy} gửi {dmhm(pending.raisedAt)}
            </MetaPill>
          )}

          {/* Every button in this bar clears law 13's 48px floor on a coarse
              pointer, and keeps the bar's 40px rhythm on a mouse. A bar where
              half the buttons are reachable is worse than one that is all small. */}
          {draft.canEdit && (
            <Button
              size="md"
              variant="ghost"
              className="pointer-coarse:h-12"
              disabled={draft.dirty.length === 0 || draft.busy}
              onClick={draft.reset}
            >
              Bỏ sửa
            </Button>
          )}

          {/* HIDDEN OUTRIGHT without `opportunity.close` — decision 4 of ADR
              `docs/decisions/0018-opportunity-module-decisions.md`. Hiding is
              NOT the fence: the real one stays at the api layer. */}
          {!creating && !signed && !lost && draft.canClose && (
            <Button
              size="md"
              variant="success"
              className="pointer-coarse:h-12"
              disabled={Boolean(pending)}
              onClick={onSign}
            >
              <Icon icon={Check} size={16} />
              Chốt thắng
            </Button>
          )}

          {/* Hidden, not greyed, for a read-only role — the same call ADR 0018
              makes for the sign button above. */}
          {draft.canEdit && (
            <Button
              size="md"
              className="pointer-coarse:h-12"
              disabled={!draft.canSubmit}
              onClick={draft.submit}
            >
              <Icon icon={Check} size={16} />
              {draft.busy ? 'Đang lưu…' : creating ? 'Tạo cơ hội' : 'Lưu phiếu'}
            </Button>
          )}

          {/* Room for the floating AI button (60px, `bottom-8 right-8` of
              AppShell) — without it, it covers the last action on the bar. */}
          <span aria-hidden className="hidden shrink-0 lg:block lg:size-[60px]" />
        </div>
      </GlassCard>
    </div>
  )
}

/** The screen that would not open — ONE block, four sentences, glyph follows
 *  the sentence. Four near-identical empty blocks would drift apart on the
 *  second edit; what differs is the SENTENCE, so the sentence is the prop. */
export function EmptyOp({
  icon,
  note,
  onBack,
}: {
  icon: IconGlyph
  note: ReactNode
  onBack: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Icon icon={icon} size={26} className="text-muted-foreground" />
      <p className="text-muted-foreground text-[12.5px] leading-[1.65]">{note}</p>
      <Button size="sm" variant="ghost" onClick={onBack}>
        Về sổ cơ hội
      </Button>
    </div>
  )
}
