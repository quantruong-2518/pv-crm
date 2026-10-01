import { type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Check,
  Handshake,
  Mail,
  PenLine,
  Phone,
  TriangleAlert,
  Users,
  type IconGlyph,
} from '@pv/ui'
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
  OPPORTUNITY_STAGE_LABEL,
  type LeadProfile,
  type OpportunityProfileResponse,
  type OpportunityRow,
} from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { dm, dmhm } from '@/lib/date'
import { phoneText } from '@/lib/phone'
import { realContact } from '@/data/lead-profile'
import { noSellerSentence, useHasSeller } from '@/data/deal-sale'
import { opportunityStageHistoryQuery } from '@/data/opportunities-write'
import type { DealDraft } from '@/data/deal-draft'
import type { FlowVectorStep, RailObject } from '@pv/ui'
import type { TouchEvent, TouchFocus } from '@/data/touches'
import { ActivityTimeline } from '@/components/lead-history-card'
import { LetterLines } from '@/components/mail-letter/letter-lines'
import { DealMoves } from './opportunity-moves'

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
 *  a second sheet of glass inside the first would stack two panels — avoided
 *  by convention, not law 12 (that law fixes only the screen's single
 *  aurora-glow layer). That is why it reaches for `ActivityTimeline` rather
 *  than `ActivityCard`. */
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

      <SectionTitle size="sm" hint="Thư gửi từ cơ hội này và trạng thái của từng thư.">
        Email
      </SectionTitle>
      <LetterLines door="opportunity" code={op.code} />

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

/** A column's label, from the ONE table the server prints from as well — no
 *  fallback, because `StageKey` and this record are the same four keys. */
const stageName = (key: NonNullable<OpportunityRow['stage']>) => OPPORTUNITY_STAGE_LABEL[key]

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
  quotationLogged = false,
  canSendEmail = false,
  composeBlocked,
  onCompose,
}: {
  draft: DealDraft
  /** `null` on the create door — nothing is signed and nothing is dirty yet. */
  op: OpportunityProfileResponse | null
  onSign: () => void
  /** Has a `quotation-sent` touch been recorded? The first sign 409s without
   *  one (ADR 0064 §3), so the button says so BEFORE the press rather than after. */
  quotationLogged?: boolean
  /** `lead.send-email`, scoped — the permission `data/mas.ts` declares. */
  canSendEmail?: boolean
  /** Why this deal cannot be written to, when it cannot. */
  composeBlocked?: string
  /** Absent on the create door: there is no deal to write about yet. */
  onCompose?: () => void
}) {
  const creating = draft.mode === 'create'
  const blocking = Boolean(draft.error) || draft.missing.length > 0

  /* Open signs for the first time, won signs again (ADR 0069 §5), lost never:
     the door refuses it and there is no way back from a stop. */
  const won = op?.state === 'won'
  const pending = op?.pendingSign
  const sign = useSignWhy(op, quotationLogged, draft.canClose && !pending)
  /* The bar prints the sign reason only when nothing outranks it; when that
     reason is the missing seller, the moves row drops its own copy of it. */
  const quiet = !draft.error && draft.missing.length === 0 && !creating && draft.dirty.length === 0
  const sellerOnBar = quiet && sign.shown !== undefined && sign.shown === sign.noSeller

  return (
    /* Sticky on a finger too (tablet portrait), capped at half the screen so a
       wrapped bar never covers the form it saves. */
    <div className="pointer-coarse:sticky pointer-coarse:bottom-4 z-10 lg:sticky lg:bottom-4">
      <GlassCard
        variant="b"
        className="bg-hc-surface shadow-panel pointer-coarse:max-h-[50dvh] pointer-coarse:overflow-y-auto flex flex-wrap items-center gap-3 p-3"
        aria-label="Thanh công cụ"
      >
        {/* WHERE THE DEAL STANDS, on its own line above the actions: the row
            below is already full of buttons. Absent on the create door — a deal
            that does not exist yet stands nowhere. */}
        {op && <DealMoves op={op} canEdit={draft.canEdit} sellerOnBar={sellerOnBar} />}

        <div className="flex min-w-0 flex-1 items-center gap-2">
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
                    : (sign.shown ?? 'Phiếu đã khớp với bản trên máy chủ.')}
          </span>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {/* Plain pills, not links: the contract routes are parked. */}
          {op?.contractCodes.map((contract) => (
            <MetaPill key={contract} icon={Handshake} tone="success" mono>
              {contract}
            </MetaPill>
          ))}
          {pending && (
            <MetaPill tone="warning">
              Chờ duyệt ký · {pending.raisedBy} gửi {dmhm(pending.raisedAt)}
            </MetaPill>
          )}

          {/* Every button in this bar clears law 13's 48px floor on a coarse
              pointer, and keeps the bar's 40px rhythm on a mouse. A bar where
              half the buttons are reachable is worse than one that is all small. */}
          {/* Locked buttons say WHY on the title, the same way the lead toolbar
              does: a panel filled in and then refused with a 403 is the one
              outcome a disabled button is here to prevent. */}
          {onCompose && (
            <Button
              size="md"
              variant="secondary"
              className="pointer-coarse:h-12"
              disabled={!canSendEmail || Boolean(composeBlocked)}
              title={canSendEmail ? composeBlocked : 'Cần quyền gửi email cho lead.'}
              onClick={onCompose}
            >
              <Icon icon={Mail} size={16} />
              Gửi mail cho khách
            </Button>
          )}

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
          {/* Shut until a quotation has been sent, reason on the title: the door
              answers 409 otherwise, and a seller who filled in the whole panel
              first deserves to have been told before pressing. */}
          {!creating && op?.state === 'open' && draft.canClose && (
            <Button
              size="md"
              variant="success"
              className="pointer-coarse:h-12"
              disabled={Boolean(pending) || Boolean(sign.first)}
              title={sign.first}
              onClick={onSign}
            >
              <Icon icon={Check} size={16} />
              Chốt thắng
            </Button>
          )}
          {won && draft.canClose && (
            <Button
              size="md"
              variant="success"
              className="pointer-coarse:h-12"
              disabled={Boolean(pending) || Boolean(sign.again)}
              title={sign.again}
              onClick={onSign}
            >
              <Icon icon={PenLine} size={16} />
              Ký thêm hợp đồng
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
          <span
            aria-hidden
            className="pointer-coarse:block pointer-coarse:size-[60px] hidden shrink-0 lg:block lg:size-[60px]"
          />
        </div>
      </GlassCard>
    </div>
  )
}

/** Why each sign button is shut — mirrors the sign door's 409s off the SAVED
 *  row (ADR 0071 §4): a seller (`isSellerRole`) must stand on the SALE lane,
 *  and a first sign needs a quotation. `shown` is the one the bar prints. No
 *  seller reason while the roles are still loading — never a guess. */
function useSignWhy(op: OpportunityRow | null, quotationLogged: boolean, offered: boolean) {
  const seller = useHasSeller(op)
  const canAssign = useCan('opportunity.assign')
  const noSeller = noSellerSentence(op?.state === 'won', canAssign)
  const again = seller === false ? noSeller : undefined
  const first = again ?? (quotationLogged ? undefined : NO_QUOTATION)
  const shown = !offered
    ? undefined
    : op?.state === 'open'
      ? first
      : op?.state === 'won'
        ? again
        : undefined
  return { first, again, shown, noSeller }
}

const NO_QUOTATION = `Chưa ghi ${OPPORTUNITY_STAGE_LABEL.quotation} — gửi báo giá trước khi chốt.`

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
