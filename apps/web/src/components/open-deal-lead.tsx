import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Chip, billions } from '@pv/ui'
import type { LeadProfile, OpportunityOpenContext } from '@pv/contracts'
import { formatNumber, message, useI18n, type Lang } from '@/app/i18n'
import { chainPath } from '@/data/opportunities'
import { leadSourceKindLabel } from '@/data/sales-labels-i18n'

/** The top of the "open an opportunity" drawer: which lead this deal grows out
 *  of, which sales run (the workstream) it joins, and which company it books to.
 *
 *  Every figure and code here arrives from `OpportunityOpenContext`, so the
 *  drawer reads the same answer the server will check the ticket against.
 *  Nothing in this file is a gate: a missing account is information for the
 *  person opening it. The lead's running deals are `open-deal-running.tsx`. */

const MIL = 1_000_000

/** The budget the customer named, as a sentence part: billions, else millions. */
function budgetText(profile: LeadProfile, lang: Lang): string | null {
  if (profile.budget === undefined) return null
  if (profile.currency !== undefined && profile.currency !== 'VND')
    return `${formatNumber(profile.budget, lang)} ${profile.currency}`
  if (profile.budget >= 1000 * MIL) return billions(profile.budget)
  const millions = formatNumber(profile.budget / MIL, lang, { maximumFractionDigits: 1 })
  return lang === 'en'
    ? `${millions} million`
    : lang === 'ko'
      ? `${millions}백만`
      : `${millions} triệu` // i18n-ignore
}

function sourceText(profile: LeadProfile, lang: Lang): string | null {
  const { origin, kind } = profile.source
  return origin?.name ?? (kind ? leadSourceKindLabel(kind, lang) : null)
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <>
    <span className="text-muted-foreground pt-1">{label}</span>
    <span className="flex min-w-0 flex-wrap items-center gap-2">{children}</span>
  </>
)

export function LeadCard({
  profile,
  context,
}: {
  profile: LeadProfile
  context: OpportunityOpenContext
}) {
  const { t, lang } = useI18n()
  const { workstream, account } = context
  const source = sourceText(profile, lang)
  const budget = budgetText(profile, lang)
  const line = [
    source && t(message(`nguồn ${source}`, `source ${source}`, `출처 ${source}`)),
    budget && t(message(`ngân sách ${budget}`, `budget ${budget}`, `예산 ${budget}`)),
  ].filter(Boolean)
  const previous = workstream?.previousWonCode
    ? chainPath('WS', workstream.previousWonCode)
    : undefined

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center gap-4">
        <Chip>{profile.code}</Chip>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[14px] font-semibold">{profile.company}</span>
          {line.length > 0 && (
            <span className="text-muted-foreground text-[12px]">{line.join(' · ')}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-[12px]">
        <Row label={t(message('Lượt bán', 'Workstream', '영업 건'))}>
          {workstream ? (
            <>
              <Chip>{workstream.code}</Chip>
              {workstream.customer === null ? (
                <Badge tone="warning">
                  {t(message('Chưa đối chiếu', 'Not checked', '확인 전'))}
                </Badge>
              ) : workstream.customer === 'new' ? (
                <Badge tone="running">{t(message('Khách mới', 'New customer', '신규 고객'))}</Badge>
              ) : (
                <Badge tone="success">
                  {t(message('Khách cũ', 'Existing customer', '기존 고객'))}
                </Badge>
              )}
              {workstream.customer !== null && (
                <span className="text-muted-foreground">
                  {t(message('theo lịch sử công ty', 'based on company history', '회사 이력 기준'))}
                </span>
              )}
              {previous && workstream.previousWonCode && (
                <Link
                  to={previous}
                  className="text-on-tint-primary pointer-coarse:min-h-12 inline-flex items-center font-mono hover:underline"
                >
                  {workstream.previousWonCode} · {t(message('thắng', 'won', '수주'))}
                </Link>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">
              {t(
                message(
                  'Lead chưa có lượt bán.',
                  'This lead has no workstream yet.',
                  '이 리드에는 아직 영업 건이 없습니다.',
                ),
              )}
            </span>
          )}
        </Row>

        <Row label={t(message('Công ty', 'Account', '고객사'))}>
          {account ? (
            <>
              <Chip>{account.code}</Chip>
              <span className="text-muted-foreground">
                {account.owner
                  ? t(
                      message(
                        `phụ trách: ${account.owner.name}`,
                        `owner: ${account.owner.name}`,
                        `담당: ${account.owner.name}`,
                      ),
                    )
                  : t(message('chưa có người phụ trách', 'no owner yet', '담당자 없음'))}
              </span>
            </>
          ) : (
            <>
              <Badge tone="warning">{t(message('Chưa gắn', 'Not linked', '연결 안 됨'))}</Badge>
              <span className="text-muted-foreground">
                {t(message('cần có trước khi ký', 'needed before signing', '체결 전에 필요합니다'))}
              </span>
            </>
          )}
        </Row>
      </div>
    </div>
  )
}
