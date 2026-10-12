import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Chip, billions } from '@pv/ui'
import { SOURCE_KIND_LABEL, type LeadProfile, type OpportunityOpenContext } from '@pv/contracts'
import { chainPath } from '@/data/opportunities'

/** The top of the "open an opportunity" drawer: which lead this deal grows out
 *  of, which sales run (the workstream) it joins, and which company it books to.
 *
 *  Every figure and code here arrives from `OpportunityOpenContext`, so the
 *  drawer reads the same answer the server will check the ticket against.
 *  Nothing in this file is a gate: a missing account is information for the
 *  person opening it. The lead's running deals are `open-deal-running.tsx`. */

const MIL = 1_000_000

/** The budget the customer named, as a sentence part: billions, else millions. */
function budgetText(profile: LeadProfile): string | null {
  if (profile.budget === undefined) return null
  if (profile.currency !== undefined && profile.currency !== 'VND')
    return `${profile.budget.toLocaleString('vi-VN')} ${profile.currency}`
  if (profile.budget >= 1000 * MIL) return billions(profile.budget)
  return `${(profile.budget / MIL).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu`
}

function sourceText(profile: LeadProfile): string | null {
  const { origin, kind } = profile.source
  return origin?.name ?? (kind ? SOURCE_KIND_LABEL[kind] : null)
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
  const { workstream, account } = context
  const line = [
    sourceText(profile) && `nguồn ${sourceText(profile)}`,
    budgetText(profile) && `ngân sách ${budgetText(profile)}`,
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
        <Row label="Lượt bán">
          {workstream ? (
            <>
              <Chip>{workstream.code}</Chip>
              {workstream.customer === null ? (
                <Badge tone="warning">Chưa đối chiếu</Badge>
              ) : workstream.customer === 'new' ? (
                <Badge tone="running">Khách mới</Badge>
              ) : (
                <Badge tone="success">Khách cũ</Badge>
              )}
              {workstream.customer !== null && (
                <span className="text-muted-foreground">theo lịch sử công ty</span>
              )}
              {previous && workstream.previousWonCode && (
                <Link
                  to={previous}
                  className="text-on-tint-primary pointer-coarse:min-h-12 inline-flex items-center font-mono hover:underline"
                >
                  {workstream.previousWonCode} · thắng
                </Link>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Lead chưa có lượt bán.</span>
          )}
        </Row>

        <Row label="Công ty">
          {account ? (
            <>
              <Chip>{account.code}</Chip>
              <span className="text-muted-foreground">
                {account.owner ? `phụ trách: ${account.owner.name}` : 'chưa có người phụ trách'}
              </span>
            </>
          ) : (
            <>
              <Badge tone="warning">Chưa gắn</Badge>
              <span className="text-muted-foreground">cần có trước khi ký</span>
            </>
          )}
        </Row>
      </div>
    </div>
  )
}
