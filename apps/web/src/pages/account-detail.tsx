import { useEffect, useMemo, useState } from 'react'
import { BriefcaseDollar, Check, Inbox, RotateCcw, Route } from '@pv/ui'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  Chip,
  GlassCard,
  Icon,
  SectionTitle,
  Separator,
  Skeleton,
  billions,
} from '@pv/ui'
import type { AccountProfile } from '@pv/contracts'
import { userMessage, type FieldErrors } from '@/app/api'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { dm, dmy } from '@/lib/date'
import {
  accountBodyOf,
  accountDraftOf,
  accountProfileQuery,
  CATEGORY_LABEL,
  changedAccountFields,
  useSaveAccount,
  type AccountDraft,
} from '@/data/accounts'
import { LEAD_STATE_FACE, tierLabel } from '@/data/lead-state'
import { DEFAULT_WORKSTREAM_BOOK_QUERY, workstreamBookQuery } from '@/data/workstreams'
import { AccountFields } from '@/components/account-fields'
import { CloseBadge } from '@/components/workstream-bits'
import { RecordCard } from '@/components/record/record-card'
import { RecordShell } from '@/components/record/record-shell'
import { RecordHeader } from '@/components/record/record-header'
import { ContextStrip } from '@/components/record/run-strip'
import { RunContacts } from '@/components/run/run-contacts'

/** A company's profile — `/sales/accounts/:code`, on the record shell without
 *  the run parts (ADR 0078): a company is many runs, not one.
 *
 *  The body is the four scores, then the company form, set lighter: whoever
 *  opens this screen fixes a field, but what no other screen answers is the
 *  rail — the company's runs, who we know there, every lead and every deal.
 *  The lists come back with the SAME read as the form (`AccountProfile`), the
 *  runs from the workstream book filtered by this company.
 *
 *  NO DELETE AND NO OFF SWITCH. A company still pointed at by a lead has its
 *  delete refused by the foreign key; one with nothing pointing at it costs
 *  nothing to keep. Merging two companies that turn out to be one is not
 *  built — `account_identity_uniq` is what keeps that need rare. */
export default function AccountDetailPage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const { code = '' } = useParams()
  const canSeeRuns = useCan('workstream.view')

  const { data: account, isPending, error } = useQuery(accountProfileQuery(code))

  if (!account) {
    return (
      <AppShell {...chrome.shell}>
        <RecordShell
          pending={isPending}
          failure={{
            error,
            notFound: `Không có công ty ${code} trong sổ. Có thể nó đã được gộp vào một công ty khác.`,
            fallback: 'Không mở được hồ sơ công ty.',
            back: { label: 'Về sổ công ty', onClick: () => navigate('/sales/accounts') },
          }}
        />
      </AppShell>
    )
  }

  return (
    <AppShell {...chrome.shell}>
      <RecordShell
        strip={<ContextStrip objects={[{ code: account.code, source: true }]} />}
        header={
          <RecordHeader
            title={account.name}
            meta={[
              account.legalName,
              /* Bought or not is the split the whole product thinks in; said
                 here so the reader need not infer it from the scores. */
              account.signedDeals > 0 ? 'Đã mua' : 'Chưa mua',
              account.province,
              account.category !== null && CATEGORY_LABEL[account.category],
            ]}
          />
        }
        main={
          <>
            <div className="grid gap-4 sm:grid-cols-4">
              <Score label="Lead đã hỏi" value={String(account.leads)} />
              <Score label="Đơn đang mở" value={String(account.openDeals)} />
              <Score label="Hợp đồng đã ký" value={String(account.signedDeals)} />
              <Score
                label="Doanh số đã ký"
                value={account.signedAmountVnd > 0 ? billions(account.signedAmountVnd) : '—'}
              />
            </div>
            <AccountCard account={account} />
          </>
        }
        railLabel="Lượt, người liên hệ, lead và cơ hội của công ty"
        rail={
          <>
            {canSeeRuns && (
              <RunsCard
                accountCode={account.code}
                onOpen={(c) => navigate(`/sales/workstreams/${encodeURIComponent(c)}`)}
              />
            )}
            <RunContacts subject={{ kind: 'account', code: account.code }} />
            <LeadsCard account={account} onOpen={(c) => navigate(`/sales/leads/${c}`)} />
            <DealsCard account={account} onOpen={(c) => navigate(`/sales/opportunities/${c}`)} />
          </>
        }
      />
    </AppShell>
  )
}

/** The company's runs — the workstream book cut to this company, closed runs
 *  included. Scoped like the book: rows the reader may not see are cut by the
 *  server, and the cut is said, not counted (see `WorkstreamColumnCards`). */
function RunsCard({
  accountCode,
  onOpen,
}: {
  accountCode: string
  onOpen: (code: string) => void
}) {
  const { data, isPending, isError } = useQuery(
    workstreamBookQuery({
      ...DEFAULT_WORKSTREAM_BOOK_QUERY,
      accountCode,
      status: 'all',
      sort: 'openedAt',
    }),
  )

  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Lượt của công ty">
      <SectionTitle
        size="sm"
        hint="Mỗi lượt là một lần bán: một lead, các cơ hội và hợp đồng của nó."
      >
        <span className="flex items-center gap-2">
          <Icon icon={Route} size={16} />
          Lượt{data && <span className="tnum"> · {data.total}</span>}
        </span>
      </SectionTitle>

      {isPending ? (
        <Skeleton height={96} />
      ) : isError ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Không đọc được các lượt của công ty này.
        </p>
      ) : data.rows.length === 0 ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          {data.hidden > 0
            ? 'Công ty này có lượt, nhưng vai của bạn không xem được lượt nào.'
            : 'Chưa có lượt nào gắn với công ty này.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.rows.map((run) => (
            <li key={run.code} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => onOpen(run.code)}
                className="motion-std pointer-coarse:min-h-12 flex w-full items-center justify-between gap-3 text-left text-[12px] hover:underline"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Chip>{run.code}</Chip>
                  <span className="truncate">{run.stand.phaseLabel}</span>
                </span>
                <span className="text-muted-foreground tnum text-[11px]">{dmy(run.openedAt)}</span>
              </button>
              {run.closeReason !== null && (
                <span className="flex items-center gap-2">
                  <CloseBadge reason={run.closeReason} />
                  {run.closedAt !== null && (
                    <span className="text-muted-foreground tnum text-[11px]">
                      {dmy(run.closedAt)}
                    </span>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {data && data.rows.length > 0 && data.hidden > 0 && (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Còn lượt khác của công ty này mà vai của bạn không xem được.
        </p>
      )}
    </GlassCard>
  )
}

function Score({ label, value }: { label: string; value: string }) {
  return (
    <GlassCard className="flex flex-col gap-1 p-4">
      <span className="text-muted-foreground text-[12px] leading-[1.5]">{label}</span>
      <span className="tnum font-num text-[20px] leading-[1.2]">{value}</span>
    </GlassCard>
  )
}

/** The company form — nine fields, saved with a button.
 *
 *  Editing requires pressing Save, like the other two profiles and for the
 *  same reason: autosaving every keystroke throws away the "I'm mid-edit"
 *  state, right when the user needs to see how many fields are unsaved and
 *  have a way back. */
function AccountCard({ account }: { account: AccountProfile }) {
  const canWrite = useCan('account.edit')
  const save = useSaveAccount(account.code)

  const saved = useMemo(() => accountDraftOf(account), [account])
  const [work, setWork] = useState<AccountDraft>(saved)
  const [errors, setErrors] = useState<FieldErrors>({})

  /* The form reloads whenever the server row changes — including when that
     change is the save that just happened. `errors` is dropped along with
     it: the old rejection no longer describes what is on screen. */
  useEffect(() => {
    setWork(saved)
    setErrors({})
  }, [saved])

  const set = <K extends keyof AccountDraft>(key: K, value: AccountDraft[K]) => {
    setWork((d) => ({ ...d, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const { [key]: _fixed, ...rest } = current
      return rest
    })
  }

  const dirty = changedAccountFields(saved, work)
  const blocked = !canWrite || dirty.length === 0 || work.name.trim() === '' || save.isPending

  return (
    <RecordCard
      title="Hồ sơ công ty"
      tone="reference"
      hint={
        canWrite
          ? 'Đây là bản ghi duy nhất về công ty này. Sửa ở đây là sửa cho mọi lead, mọi đơn và mọi hợp đồng bên dưới.'
          : 'Vai của bạn đọc được sổ công ty nhưng không sửa được.'
      }
    >
      <AccountFields draft={work} onSet={set} errors={errors} />

      <Separator />

      <div className="flex flex-wrap items-center gap-4">
        <Button
          size="md"
          className="pointer-coarse:h-12"
          disabled={blocked}
          onClick={() =>
            save.mutate(accountBodyOf(work), {
              onError: (error) => setErrors(error.errors ?? {}),
            })
          }
        >
          <Icon icon={Check} size={16} />
          {save.isPending
            ? 'Đang lưu…'
            : `Lưu ${dirty.length > 0 ? `${dirty.length} ô đã sửa` : ''}`}
        </Button>
        <Button
          size="md"
          variant="ghost"
          className="pointer-coarse:h-12"
          disabled={dirty.length === 0 || save.isPending}
          onClick={() => {
            setWork(saved)
            setErrors({})
          }}
        >
          <Icon icon={RotateCcw} size={16} />
          Bỏ sửa
        </Button>
        {save.isError && (
          <span role="alert" className="text-destructive-foreground text-[11.5px] leading-[1.5]">
            {userMessage(save.error)}
          </span>
        )}
      </div>
    </RecordCard>
  )
}

function LeadsCard({
  account,
  onOpen,
}: {
  account: AccountProfile
  onOpen: (code: string) => void
}) {
  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Lead của công ty">
      <SectionTitle size="sm" hint="Mỗi dòng là một lần công ty này hỏi hàng.">
        <span className="flex items-center gap-2">
          <Icon icon={Inbox} size={16} />
          Lead · {account.leadRows.length}
        </span>
      </SectionTitle>

      {account.leadRows.length === 0 ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Chưa có lead nào — công ty này được mở bằng tay, chưa qua lần hỏi hàng nào.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {account.leadRows.map((l) => {
            const face = LEAD_STATE_FACE[l.state]
            const meta = [l.tier === undefined ? undefined : tierLabel(l.tier), l.ownerName]
              .filter((x) => x !== undefined)
              .join(' · ')

            return (
              <li key={l.code}>
                <button
                  type="button"
                  onClick={() => onOpen(l.code)}
                  className="motion-std pointer-coarse:min-h-12 flex w-full items-center justify-between gap-3 text-left text-[12px] hover:underline"
                >
                  <Chip>{l.code}</Chip>
                  <span className="text-muted-foreground text-[11px]">{dm(l.createdAt)}</span>
                </button>
                <span className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge tone={face.badge}>{face.label}</Badge>
                  {meta && (
                    <span className="text-muted-foreground text-[11px] leading-[1.5]">{meta}</span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </GlassCard>
  )
}

function DealsCard({
  account,
  onOpen,
}: {
  account: AccountProfile
  onOpen: (code: string) => void
}) {
  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Đơn của công ty">
      <SectionTitle
        size="sm"
        hint="Cả đơn đã đóng — thứ mình đã chào cho khách này gồm cả những lần trượt."
      >
        <span className="flex items-center gap-2">
          <Icon icon={BriefcaseDollar} size={16} />
          Cơ hội · {account.dealRows.length}
        </span>
      </SectionTitle>

      {account.dealRows.length === 0 ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Chưa có đơn nào mở cho công ty này.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {account.dealRows.map((d) => (
            <li key={d.code} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => onOpen(d.code)}
                className="motion-std pointer-coarse:min-h-12 flex w-full items-center justify-between gap-3 text-left text-[12px] hover:underline"
              >
                <span className="truncate">{d.name}</span>
                {d.signed && <Badge tone="success">Đã ký</Badge>}
              </button>
              <span className="text-muted-foreground tnum font-num text-[11px] leading-[1.5]">
                {d.amountVnd === null ? 'Chưa có giá trị' : billions(d.amountVnd)} ·{' '}
                {dm(d.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  )
}
