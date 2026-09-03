import { useEffect, useMemo, useState } from 'react'
import { Check, Inbox, RotateCcw, TriangleAlert, Users } from '@pv/ui'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AppShell,
  Badge,
  Button,
  Chip,
  GlassCard,
  Icon,
  Kicker,
  MetaPill,
  ScreenDetailGrid,
  ScreenHeader,
  ScreenLayout,
  SectionTitle,
  Separator,
  Skeleton,
  billions,
} from '@pv/ui'
import type { AccountProfile } from '@pv/contracts'
import { isApiError, userMessage, type FieldErrors } from '@/app/api'
import { useCan } from '@/app/auth'
import { useAppChrome } from '@/app/chrome'
import { dm } from '@/lib/date'
import {
  accountBodyOf,
  accountDraftOf,
  accountProfileQuery,
  changedAccountFields,
  useSaveAccount,
  type AccountDraft,
} from '@/data/accounts'
import { AccountFields } from '@/components/account-fields'
import { DetailSidePanel } from '@/components/detail-side-panel'

/** A company's profile — `/sales/accounts/:code`.
 *
 *  ------------------------------------------------------------------
 *  SAME TWO-COLUMN LAYOUT AS THE LEAD PROFILE AND THE DEAL PROFILE
 *  ------------------------------------------------------------------
 *  The main column is what the user EDITS (the company form), the side column
 *  is what they LOOK UP (three child books). `sideFirst` is not turned on,
 *  for the same reason the deal profile does not turn it on: whoever opens
 *  this screen is here to fix a field, not to work through a list.
 *
 *  ------------------------------------------------------------------
 *  THE THREE CHILD BOOKS ARE WHY THIS SCREEN EXISTS
 *  ------------------------------------------------------------------
 *  The form on the left is just nine fields — if the screen had only that, it
 *  would be an address-editing page. What no other screen can answer sits in
 *  the right column: how many times this company has enquired, what deals are
 *  open, who we know there. Those three lists come back with the SAME read as
 *  the form (`AccountProfile`), not three extra calls — they are bounded above
 *  by how much work one customer has generated, which is barely one screen.
 *
 *  ------------------------------------------------------------------
 *  NO DELETE BUTTON, AND NO OFF SWITCH EITHER
 *  ------------------------------------------------------------------
 *  A company still pointed at by a lead has its delete refused by the foreign
 *  key; a company with nothing pointing at it costs nothing to keep around.
 *  "Turning off" a company is a question this screen cannot answer: where do
 *  the four deals underneath it go. Merging two companies that turn out to be
 *  one is a different operation, and it has not been built —
 *  `account_identity_uniq` is what keeps that need rare. */
export default function AccountDetailPage() {
  const chrome = useAppChrome()
  const navigate = useNavigate()
  const { code = '' } = useParams()

  const { data: account, isPending, error } = useQuery(accountProfileQuery(code))

  if (isPending) {
    return (
      <AppShell {...chrome.shell}>
        <ScreenLayout>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-96 w-full" />
        </ScreenLayout>
      </AppShell>
    )
  }

  if (!account) {
    /* Three branches, one block — and the branch is picked by `error.kind`,
       not by the HTTP number: `app/api` has already translated the Problem
       into a readable union, and a screen comparing `status === 404` is a
       screen that has to be fixed every time the server changes its code. */
    const kind = isApiError(error) ? error.kind : undefined
    return (
      <AppShell {...chrome.shell}>
        <ScreenLayout>
          <ScreenHeader
            kicker="Kinh doanh · Khách hàng"
            title={
              kind === 'không-thấy'
                ? `Không có công ty ${code}`
                : kind === 'thiếu-quyền'
                  ? 'Bạn không được xem sổ công ty'
                  : 'Không mở được hồ sơ công ty'
            }
            description={
              kind === 'không-thấy'
                ? 'Mã này không có trong sổ. Có thể nó đã được gộp vào một công ty khác.'
                : isApiError(error)
                  ? userMessage(error)
                  : 'Vui lòng thử lại.'
            }
            actions={
              <Button size="md" onClick={() => navigate('/sales/accounts')}>
                Về sổ công ty
              </Button>
            }
          />
        </ScreenLayout>
      </AppShell>
    )
  }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          kicker="Kinh doanh · Khách hàng"
          title={account.name}
          description={account.legalName ?? undefined}
          back={{ label: 'Sổ công ty', onClick: () => navigate('/sales/accounts') }}
          meta={
            <div className="flex flex-wrap items-center gap-2">
              <Chip>{account.code}</Chip>
              {/* A customer who HAS BOUGHT is a different thing from one who
                  has not, and that split is what the whole product already
                  thinks in. Say it with a badge instead of making the reader
                  infer it from the number below. */}
              <Badge tone={account.signedDeals > 0 ? 'success' : 'draft'}>
                {account.signedDeals > 0 ? 'Đã mua' : 'Chưa mua'}
              </Badge>
              {account.province !== undefined && <MetaPill>{account.province}</MetaPill>}
              {account.category !== null && <MetaPill>{account.category}</MetaPill>}
            </div>
          }
        />

        <div className="grid gap-4 sm:grid-cols-4">
          <Score label="Lead đã hỏi" value={String(account.leads)} />
          <Score label="Đơn đang mở" value={String(account.openDeals)} />
          <Score label="Hợp đồng đã ký" value={String(account.signedDeals)} />
          <Score
            label="Doanh số đã ký"
            value={account.signedAmountVnd > 0 ? billions(account.signedAmountVnd) : '—'}
          />
        </div>

        <ScreenDetailGrid
          className="w-full"
          sideClassName="relative xl:self-stretch"
          sideLabel="Sổ con của công ty"
          main={<AccountCard account={account} />}
          side={
            <DetailSidePanel>
              <ContactsCard account={account} onOpenLead={(c) => navigate(`/sales/leads/${c}`)} />
              <LeadsCard account={account} onOpen={(c) => navigate(`/sales/leads/${c}`)} />
              <DealsCard account={account} onOpen={(c) => navigate(`/sales/opportunities/${c}`)} />
            </DetailSidePanel>
          }
        />
      </ScreenLayout>
    </AppShell>
  )
}

function Score({ label, value }: { label: string; value: string }) {
  return (
    <GlassCard className="flex flex-col gap-1 p-4">
      <Kicker tone="muted">{label}</Kicker>
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
  const canWrite = useCan('khách-hàng.sửa')
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
    <GlassCard className="flex flex-col gap-6 p-5 lg:p-6" aria-label="Phiếu công ty">
      <SectionTitle
        hint={
          canWrite
            ? 'Đây là bản ghi DUY NHẤT về công ty này. Sửa ở đây là sửa cho mọi lead, mọi đơn và mọi hợp đồng bên dưới.'
            : 'Vai của bạn đọc được sổ công ty nhưng không sửa được.'
        }
      >
        Hồ sơ công ty
      </SectionTitle>

      <AccountFields draft={work} onSet={set} errors={errors} />

      <Separator />

      <div className="flex flex-wrap items-center gap-4">
        <Button
          size="md"
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
    </GlassCard>
  )
}

/** People we know at this company.
 *
 *  The list is merged from EVERY lead of the company — see the docblock of
 *  `contact.schema.ts` for why a contact hangs under a lead rather than under
 *  a company. That is why every row carries its lead code along: opening a
 *  contact to edit means opening the lead profile holding them, not a third
 *  screen. */
function ContactsCard({
  account,
  onOpenLead,
}: {
  account: AccountProfile
  onOpenLead: (leadCode: string) => void
}) {
  return (
    <GlassCard variant="b" className="flex flex-col gap-4 p-5 lg:p-6" aria-label="Người liên hệ">
      <SectionTitle size="sm" hint="Gộp từ mọi lead của công ty này.">
        <span className="flex items-center gap-2">
          <Icon icon={Users} size={16} />
          Người liên hệ · {account.contactRows.length}
        </span>
      </SectionTitle>

      {account.contactRows.length === 0 ? (
        <p className="text-muted-foreground text-[11.5px] leading-[1.5]">
          Chưa ghi được ai ở công ty này. Thêm người liên hệ ở hồ sơ lead.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {account.contactRows.map((c) => (
            <li key={c.code} className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => onOpenLead(c.leadCode)}
                className="motion-std flex items-center gap-2 text-left text-[12px] hover:underline"
              >
                <span className="font-semibold">{c.name}</span>
                {c.isPrimary && <Badge tone="success">Chính</Badge>}
              </button>
              <span className="text-muted-foreground text-[11px] leading-[1.5]">
                {[c.title, c.email, c.phone].filter((x) => x !== undefined).join(' · ') ||
                  'Chưa có kênh liên lạc nào'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
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
          {account.leadRows.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                onClick={() => onOpen(l.code)}
                className="motion-std flex w-full items-center justify-between gap-3 text-left text-[12px] hover:underline"
              >
                <Chip>{l.code}</Chip>
                <span className="text-muted-foreground text-[11px]">{dm(l.createdAt)}</span>
              </button>
              <span className="text-muted-foreground text-[11px] leading-[1.5]">
                {[l.tier, l.stage, l.ownerName].filter((x) => x !== undefined).join(' · ') ||
                  'Chưa xếp bậc'}
              </span>
            </li>
          ))}
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
        hint="Cả đơn đã đóng — thứ mình đã CHÀO cho khách này gồm cả những lần trượt."
      >
        <span className="flex items-center gap-2">
          <Icon icon={TriangleAlert} size={16} />
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
                className="motion-std flex w-full items-center justify-between gap-3 text-left text-[12px] hover:underline"
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
