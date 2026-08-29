import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, Chip, GlassCard, MetaPill, Money, SectionTitle, Skeleton, cn } from '@pv/ui'
import type { OpportunityRow, QuoteRow } from '@pv/contracts'
import { useCan } from '@/app/auth'
import { toast } from '@/app/toast'
import { isApiError, userMessage } from '@/app/api'
import { dm } from '@/lib/date'
import {
  daysLeft,
  isExpired,
  isExpiring,
  quotesOfOpportunityQuery,
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TONE,
} from '@/data/quotes'
import {
  useDecideQuote,
  useDraftQuote,
  useReplaceQuote,
  useSaveQuote,
  useSendQuote,
} from '@/data/quotes-write'
import { QuoteComposeModal, type QuoteComposeMode } from '@/components/quote-compose-modal'

/** The quote card on a deal profile — the live version, with the negotiation
 *  history under it.
 *
 *  ------------------------------------------------------------------
 *  NEWEST ON TOP, SUPERSEDED VERSIONS INDENTED BENEATH
 *  ------------------------------------------------------------------
 *  Because that is the shape of the data: every round of negotiation is its OWN
 *  CODE, a superseded version is never edited over, it stays exactly as it was
 *  and says so. A card printing only the newest version would hide that this
 *  deal has been through three rounds — and three rounds is precisely what
 *  somebody about to phone the customer needs to know before dialling.
 *
 *  ------------------------------------------------------------------
 *  EACH BUTTON IS GATED BY THE PERMISSION OF THE DOOR IT CALLS
 *  ------------------------------------------------------------------
 *  Draft, edit and next-round ask for the EDIT permission; send asks for SEND;
 *  recording the customer's answer asks for the deal's CLOSE permission. Hidden
 *  outright rather than shown greyed — the same call the sign button settled: a
 *  greyed button cannot say why it is grey, and the user goes and asks the wrong
 *  person.
 *
 *  ------------------------------------------------------------------
 *  PRINT AND MAIL ARE NOT IN THIS ROUND
 *  ------------------------------------------------------------------
 *  The send button here writes to the book: it moves this version to sent,
 *  retires the older ones, and carries the deal onto the quotation step. It does
 *  NOT mail anybody — an outbound letter needs a suppression check and a
 *  `List-Unsubscribe` header, and half of that wired here would be a button that
 *  looks like it mailed the customer and did not. The print view (a `@media
 *  print` page plus `window.print()`) is unbuilt for the same round. */

type ComposeState = { mode: QuoteComposeMode; source?: QuoteRow } | null

export function QuoteCard({ op }: { op: OpportunityRow }) {
  const canEdit = useCan('báo-giá.sửa')
  const canSend = useCan('báo-giá.gửi')
  const canDecide = useCan('cơ-hội.chốt')

  const { data: quotes, isPending } = useQuery(quotesOfOpportunityQuery(op.code))
  const [compose, setCompose] = useState<ComposeState>(null)

  const draft = useDraftQuote()
  const save = useSaveQuote(compose?.source?.code ?? '')
  const replace = useReplaceQuote(compose?.source?.code ?? '')
  const send = useSendQuote()
  const decide = useDecideQuote()

  /* Reversed here: the server returns version 1 first (negotiation order) and
     this card draws the newest on top. Reversed in the card rather than in the
     question, because this is the only caller that wants it that way — the quote
     book does not. */
  const versions = [...(quotes ?? [])].reverse()
  const live = versions[0]
  const older = versions.slice(1)

  /* A closed deal takes no more paperwork. The server refuses with a 409; the
     button is hidden here so nobody types out a whole quote before finding out. */
  const closed = op.state === 'close-won' || op.state === 'close-lost'

  const busy = draft.isPending || save.isPending || replace.isPending

  const submit = async (body: Parameters<typeof draft.mutateAsync>[0] | object) => {
    if (compose?.mode === 'edit' && compose.source) {
      await save.mutateAsync(body as Parameters<typeof save.mutateAsync>[0])
      return
    }
    if (compose?.mode === 'replace' && compose.source) {
      await replace.mutateAsync(body as Parameters<typeof replace.mutateAsync>[0])
      return
    }
    await draft.mutateAsync({
      opportunityCode: op.code,
      ...(body as Parameters<typeof save.mutateAsync>[0]),
    })
  }

  /** A server call from a button that opens no form. Both outcomes are said out
   *  loud: success confirms what just happened, failure relays the sentence the
   *  server wrote itself rather than a generic one. */
  const run = async (work: Promise<unknown>, done: string) => {
    try {
      await work
      toast(done, { tone: 'success' })
    } catch (e) {
      toast(isApiError(e) ? userMessage(e) : 'Máy chủ không nhận lượt này.', { tone: 'danger' })
    }
  }

  return (
    <GlassCard className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Báo giá">
      <SectionTitle
        kicker="Báo giá"
        size="md"
        /* "Draft the next round" only once the current version has actually
           LEFT — replacing a draft would leave two live drafts on one deal and
           burn a code for nothing, when the honest action on a draft is the edit
           button below. So: no quote at all offers "draft one"; a sent or
           answered version offers the next round; a draft offers neither here. */
        actions={
          canEdit && !closed && live?.status !== 'nhap' ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setCompose(live ? { mode: 'replace', source: live } : { mode: 'create' })
              }
            >
              {live ? 'Soạn bản mới' : 'Soạn báo giá'}
            </Button>
          ) : undefined
        }
      >
        {live ? `${live.code} · bản ${live.version}` : 'Chưa có báo giá'}
      </SectionTitle>

      {isPending ? (
        <Skeleton className="h-12 w-full" />
      ) : !live ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Đơn này chưa có tờ báo giá nào.
          {closed && ' Đơn đã đóng sổ nên cũng không soạn thêm được.'}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={QUOTE_STATUS_TONE[live.status]}>{QUOTE_STATUS_LABEL[live.status]}</Badge>
            <ValidityPill quote={live} />
          </div>

          {/* EXACT dong, not the `card` scale that rounds to millions. A deal
              value is an estimate and reads fine rounded; a quote total is the
              number printed on paper the customer is holding, and "1,0 tr" for
              990.000 is the screen disagreeing with that paper. */}
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground text-[11.5px]">{live.title}</span>
            <Money value={live.total} scale="table" className="text-[15px]" />
          </div>

          {/* Which buttons appear depends on where this version stands in its
              lifecycle. A draft can be edited and sent; a sent one waits for the
              customer; one that already has an answer has no buttons at all —
              answering again means drafting a new version, which is the
              one-code-per-version rule showing through the screen. */}
          <div className="flex flex-wrap items-center gap-2">
            {live.status === 'nhap' && canEdit && (
              <Button
                size="md"
                variant="ghost"
                onClick={() => setCompose({ mode: 'edit', source: live })}
              >
                Sửa
              </Button>
            )}
            {live.status === 'nhap' && canSend && (
              <Button
                size="md"
                disabled={send.isPending}
                onClick={() =>
                  void run(send.mutateAsync(live.code), `${live.code} đã ghi là gửi khách`)
                }
              >
                Gửi khách
              </Button>
            )}
            {live.status === 'da-gui' && canDecide && (
              <>
                <Button
                  size="md"
                  disabled={decide.isPending}
                  onClick={() =>
                    void run(
                      decide.mutateAsync({ code: live.code, body: { outcome: 'khach-chot' } }),
                      `${live.code} · khách đã chốt`,
                    )
                  }
                >
                  Khách chốt
                </Button>
                <Button
                  size="md"
                  variant="ghost"
                  disabled={decide.isPending}
                  onClick={() =>
                    void run(
                      decide.mutateAsync({ code: live.code, body: { outcome: 'khach-tu-choi' } }),
                      `${live.code} · khách từ chối`,
                    )
                  }
                >
                  Khách từ chối
                </Button>
              </>
            )}
          </div>

          {older.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
              {older.map((q) => (
                <div key={q.code} className="flex flex-wrap items-center gap-2 pl-3">
                  <span aria-hidden className="text-muted-foreground text-[11.5px]">
                    ↳
                  </span>
                  <Chip>{q.code}</Chip>
                  <MetaPill>bản {q.version}</MetaPill>
                  <Badge tone={QUOTE_STATUS_TONE[q.status]}>{QUOTE_STATUS_LABEL[q.status]}</Badge>
                  <Money value={q.total} scale="table" className="text-muted-foreground" />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <QuoteComposeModal
        open={compose !== null}
        onClose={() => setCompose(null)}
        mode={compose?.mode ?? 'create'}
        deal={{ code: op.code, account: op.account }}
        {...(compose?.source ? { source: compose.source } : {})}
        nextVersion={
          compose?.mode === 'edit' ? (compose.source?.version ?? 1) : versions.length + 1
        }
        saving={busy}
        onSubmit={submit}
      />
    </GlassCard>
  )
}

/** The validity date, and only while it still means something.
 *
 *  A version that was superseded, refused, or never sent tells nobody anything
 *  with its date — colouring it amber invites somebody to go rescue a sheet no
 *  one is waiting on. Expiry is computed ON READ, never off a stored status. */
function ValidityPill({ quote }: { quote: QuoteRow }) {
  const expired = isExpired(quote)
  const expiring = isExpiring(quote)

  return (
    <MetaPill mono tone={expired || expiring ? 'warning' : undefined}>
      <span className={cn(expired && 'text-warning')}>
        hạn {dm(quote.validUntil)}
        {expired ? ' · đã quá hạn' : expiring ? ` · còn ${daysLeft(quote)} ngày` : ''}
      </span>
    </MetaPill>
  )
}
