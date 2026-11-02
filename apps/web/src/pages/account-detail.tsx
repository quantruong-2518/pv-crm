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
import { message, useI18n } from '@/app/i18n'
import { useAppChrome } from '@/app/chrome'
import { dm, dmy } from '@/lib/date'
import {
  accountBodyOf,
  accountDraftOf,
  accountProfileQuery,
  changedAccountFields,
  useSaveAccount,
  type AccountDraft,
} from '@/data/accounts'
import { LEAD_STATE_FACE, tierLabel } from '@/data/lead-state'
import { DEFAULT_WORKSTREAM_BOOK_QUERY, workstreamBookQuery } from '@/data/workstreams'
import { AccountFields } from '@/components/account-fields'
import { CloseBadge } from '@/components/workstream-bits'
import { TerminatedBadge } from '@/components/contract-bits'
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
  const { t } = useI18n()
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
            notFound: t(
              message(
                `Không có công ty ${code} trong sổ.`,
                `Company ${code} was not found.`,
                `회사 ${code}을(를) 찾을 수 없습니다.`,
              ),
            ),
            fallback: t(
              message(
                'Không mở được hồ sơ công ty.',
                'Could not open company profile.',
                '회사 프로필을 열 수 없습니다.',
              ),
            ),
            back: {
              label: t(message('Về sổ công ty', 'Back to companies', '회사 목록으로')),
              onClick: () => navigate('/sales/accounts'),
            },
          }}
        />
      </AppShell>
    )
  }

  return (
    <AppShell {...chrome.shell}>
      <RecordShell
        strip={<ContextStrip objects={[{ code: account.code, source: true }]} />}
        header={<RecordHeader title={account.name} />}
        main={
          <>
            <div className="grid gap-6 sm:grid-cols-4">
              <Score
                label={t(message('Lead đã hỏi', 'Leads', '리드'))}
                value={String(account.leads)}
              />
              <Score
                label={t(message('Đơn đang mở', 'Open opportunities', '진행 중인 기회'))}
                value={String(account.openDeals)}
              />
              <Score
                label={t(message('Hợp đồng đã ký', 'Signed contracts', '체결 계약'))}
                value={String(account.signedDeals)}
              />
              <Score
                label={t(message('Doanh số đã ký', 'Signed revenue', '계약 매출'))}
                value={account.signedAmountVnd > 0 ? billions(account.signedAmountVnd) : '—'}
              />
            </div>
            <AccountCard account={account} />
          </>
        }
        railLabel={t(
          message(
            'Lượt, người liên hệ, lead và cơ hội của công ty',
            'Company activity, contacts, leads, and opportunities',
            '회사 활동, 연락처, 리드 및 기회',
          ),
        )}
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
  const { t } = useI18n()
  const { data, isPending, isError } = useQuery(
    workstreamBookQuery({
      ...DEFAULT_WORKSTREAM_BOOK_QUERY,
      accountCode,
      status: 'all',
      sort: 'openedAt',
    }),
  )

  return (
    <GlassCard
      variant="b"
      className="flex flex-col gap-4 p-5 lg:p-6"
      aria-label={t(message('Lượt của công ty', 'Company activity', '회사 활동'))}
    >
      <SectionTitle
        size="sm"
        hint={t(
          message(
            'Mỗi lượt là một lần bán: một lead, các cơ hội và hợp đồng của nó.',
            'Each activity is one sales journey: a lead and its opportunities and contracts.',
            '각 활동은 리드와 관련 기회 및 계약으로 구성된 하나의 영업 여정입니다.',
          ),
        )}
      >
        <span className="flex items-center gap-2">
          <Icon icon={Route} size={16} />
          {t(message('Lượt', 'Activity', '활동'))}
          {data && <span className="tnum"> · {data.total}</span>}
        </span>
      </SectionTitle>

      {isPending ? (
        <Skeleton height={96} />
      ) : isError ? (
        <p className="text-destructive-foreground text-[11.5px] leading-[1.5]">
          {t(
            message(
              'Không tải được các lượt.',
              'Could not load activity.',
              '활동을 불러오지 못했습니다.',
            ),
          )}
        </p>
      ) : data.rows.length === 0 ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          {data.hidden > 0
            ? t(
                message(
                  'Vai của bạn không xem được lượt nào.',
                  'Your role cannot view any activity.',
                  '역할 권한으로 볼 수 있는 활동이 없습니다.',
                ),
              )
            : t(message('Chưa có lượt nào.', 'No activity yet.', '활동이 없습니다.'))}
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
          {t(
            message(
              'Còn lượt khác mà vai của bạn không xem được.',
              'Some activity is outside your role’s access.',
              '역할 권한으로 볼 수 없는 활동이 더 있습니다.',
            ),
          )}
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
  const { t } = useI18n()
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
      title={t(message('Hồ sơ công ty', 'Company profile', '회사 프로필'))}
      tone="reference"
      hint={
        canWrite
          ? t(
              message(
                'Sửa ở đây là sửa cho mọi lead, cơ hội và hợp đồng của công ty.',
                'Changes here apply to all company leads, opportunities, and contracts.',
                '여기서 수정하면 회사의 모든 리드, 기회 및 계약에 반영됩니다.',
              ),
            )
          : t(
              message(
                'Vai của bạn chỉ được xem.',
                'Your role has view-only access.',
                '역할 권한은 보기 전용입니다.',
              ),
            )
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
            ? t(message('Đang lưu…', 'Saving…', '저장 중…'))
            : t(
                message(
                  `Lưu${dirty.length > 0 ? ` ${dirty.length} ô đã sửa` : ''}`,
                  `Save${dirty.length > 0 ? ` ${dirty.length} changed fields` : ''}`,
                  `저장${dirty.length > 0 ? ` · 변경된 항목 ${dirty.length}개` : ''}`,
                ),
              )}
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
          {t(message('Bỏ sửa', 'Discard changes', '변경 취소'))}
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
  const { t } = useI18n()
  return (
    <GlassCard
      variant="b"
      className="flex flex-col gap-4 p-5 lg:p-6"
      aria-label={t(message('Lead của công ty', 'Company leads', '회사 리드'))}
    >
      <SectionTitle size="sm">
        <span className="flex items-center gap-2">
          <Icon icon={Inbox} size={16} />
          Lead · {account.leadRows.length}
        </span>
      </SectionTitle>

      {account.leadRows.length === 0 ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          {t(message('Chưa có lead nào.', 'No leads yet.', '리드가 없습니다.'))}
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
  const { t } = useI18n()
  return (
    <GlassCard
      variant="b"
      className="flex flex-col gap-4 p-5 lg:p-6"
      aria-label={t(message('Cơ hội của công ty', 'Company opportunities', '회사 기회'))}
    >
      <SectionTitle
        size="sm"
        hint={t(
          message(
            'Gồm cả cơ hội đã đóng.',
            'Includes closed opportunities.',
            '종료된 기회도 포함됩니다.',
          ),
        )}
      >
        <span className="flex items-center gap-2">
          <Icon icon={BriefcaseDollar} size={16} />
          {t(message('Cơ hội', 'Opportunities', '기회'))} · {account.dealRows.length}
        </span>
      </SectionTitle>

      {account.dealRows.length === 0 ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          {t(message('Chưa có cơ hội nào.', 'No opportunities yet.', '기회가 없습니다.'))}
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
                {/* `state` is a plain string on the wire; terminated outranks the signed flag. */}
                {d.state === 'terminated' ? (
                  <TerminatedBadge />
                ) : (
                  d.signed && (
                    <Badge tone="success">{t(message('Đã ký', 'Signed', '계약 체결'))}</Badge>
                  )
                )}
              </button>
              <span className="text-muted-foreground tnum font-num text-[11px] leading-[1.5]">
                {d.amountVnd === null
                  ? t(message('Chưa có giá trị', 'No value', '금액 없음'))
                  : billions(d.amountVnd)}{' '}
                · {dm(d.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  )
}
