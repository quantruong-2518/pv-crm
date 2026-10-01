import type { ReactNode } from 'react'
import { Check } from '@pv/ui'
import { Badge, Button, Chip, Icon } from '@pv/ui'
import {
  LEAD_STATE_LABEL,
  OPPORTUNITY_CONTACT_ROLE_LABEL,
  OPPORTUNITY_STAGE_LABEL,
  type OpportunityContactPick,
  type OpportunityCreateResponse,
  type OpportunityOpenContext,
} from '@pv/contracts'
import { CURRENCIES } from '@pv/engines/fixtures/das-vina'
import { dmy } from '@/lib/date'
import { bdOwnersOf, namesOf, saleOwnersOf } from '@/data/opportunities'

/** What the drawer turns into once the server has accepted the ticket.
 *
 *  Everything printed comes from the row the server just wrote, plus a frozen
 *  copy of the context and picks it was built from: the drawer's own queries
 *  refresh the moment the deal exists, and a summary that changed under the
 *  reader would be reporting a different ticket. */

export type Created = {
  row: OpportunityCreateResponse
  context: OpportunityOpenContext
  picks: OpportunityContactPick[]
  /** Contact code → name, from the list the picks were made on. */
  contactNames: Record<string, string>
  /** Whether this deal is what moves the lead to `converted`. */
  convertsLead: boolean
  leadCode: string
}

const Pair = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-[10rem_minmax(0,1fr)] items-center gap-4 py-2 text-[14px]">
    <span className="text-muted-foreground">{label}</span>
    <span className="flex min-w-0 flex-wrap items-center gap-2">{children}</span>
  </div>
)

function contactLine(created: Created): string {
  return created.picks
    .map((pick) => {
      const name = created.contactNames[pick.contactCode] ?? pick.contactCode
      const note = pick.primary
        ? 'chính'
        : pick.role
          ? OPPORTUNITY_CONTACT_ROLE_LABEL[pick.role].toLowerCase()
          : null
      return note ? `${name} · ${note}` : name
    })
    .join(', ')
}

function nextText(created: Created): string {
  const { row, context, convertsLead, leadCode } = created
  const ws = context.workstream?.code
  const days = context.newStageLimitDays
  const first =
    row.stage === 'new'
      ? `Cơ hội chờ trưởng phòng Nhận PIC và giao Sale${
          days === null ? '' : `, trong hạn cột Khởi tạo ở Thiết lập (${days} ngày)`
        }. Trên bảng lượt bán, thẻ ${ws ?? 'lượt bán'} đã chuyển sang cơ hội · Khởi tạo${
          days === null ? '' : ' và hiện trễ nếu quá hạn'
        }.`
      : `Cơ hội đã nhận PIC và nằm ở cột ${OPPORTUNITY_STAGE_LABEL.assigned}. Trên bảng lượt bán, thẻ ${
          ws ?? 'lượt bán'
        } đã chuyển sang cơ hội · ${OPPORTUNITY_STAGE_LABEL.assigned}.`
  return convertsLead
    ? `${first} Lead ${leadCode} chuyển sang ${LEAD_STATE_LABEL.converted}.`
    : first
}

function moneyText(row: OpportunityCreateResponse): string {
  if (row.amount === null) return '—'
  const symbol = CURRENCIES.find((c) => c.code === row.currency)?.symbol ?? ''
  return `${row.amount.toLocaleString('vi-VN')} ${symbol || row.currency || ''}`.trim()
}

export function CreatedPanel({
  created,
  stayLabel,
  onOpen,
  onStay,
}: {
  created: Created
  stayLabel: string
  onOpen: () => void
  onStay: () => void
}) {
  const { row, context } = created
  const { workstream } = context
  const bd = namesOf(bdOwnersOf(row))
  const sale = namesOf(saleOwnersOf(row))

  return (
    <div className="flex flex-col gap-8 py-8">
      <div className="flex flex-col gap-4">
        <span className="bg-success/20 text-on-tint-success-strong flex size-12 items-center justify-center rounded-md">
          <Icon icon={Check} size={24} />
        </span>
        <div className="flex flex-col gap-2">
          <h3 className="font-display m-0 text-[24px] font-semibold leading-[1.3]">
            Đã mở cơ hội <span className="text-accent-foreground font-mono">{row.code}</span>
          </h3>
          <p className="text-muted-foreground m-0 text-[14px]">{row.name}</p>
        </div>
      </div>

      <div className="flex flex-col" aria-label="Tóm tắt cơ hội vừa mở">
        {workstream && (
          <Pair label="Lượt bán">
            <Chip>{workstream.code}</Chip>
            {workstream.customer !== null && (
              <Badge tone={workstream.customer === 'new' ? 'running' : 'success'}>
                {workstream.customer === 'new' ? 'Khách mới' : 'Khách cũ'}
              </Badge>
            )}
          </Pair>
        )}
        <Pair label="Giá trị đơn">
          <span className="tnum font-mono">{moneyText(row)}</span>
        </Pair>
        <Pair label="Ngày chốt dự kiến">{row.expectedClose ? dmy(row.expectedClose) : '—'}</Pair>
        <Pair label="Người liên hệ">{contactLine(created)}</Pair>
        <Pair label="BD mở cửa">{bd.length > 0 ? bd.join(', ') : '—'}</Pair>
        {sale.length > 0 && <Pair label="Sale đứng đơn">{sale.join(', ')}</Pair>}
        <Pair label="Công ty">
          {row.accountCode ? (
            <>
              <Chip>{row.accountCode}</Chip>
              {row.account}
            </>
          ) : (
            <>
              <Badge tone="warning">Chưa gắn</Badge>
              <span className="text-muted-foreground text-[12px]">cần có trước khi ký</span>
            </>
          )}
        </Pair>
        <Pair label="Cột hiện tại">
          <Badge tone="draft">{row.stage ? OPPORTUNITY_STAGE_LABEL[row.stage] : '—'}</Badge>
        </Pair>
      </div>

      <div className="bg-surface-ink/9 flex flex-col gap-1 rounded-md px-5 py-4">
        <span className="text-[14px] font-semibold">Tiếp theo</span>
        <span className="text-muted-foreground text-[13px] leading-[1.6]">{nextText(created)}</span>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button size="lg" onClick={onOpen}>
          Mở <span className="font-mono">{row.code}</span>
        </Button>
        <Button size="lg" variant="ghost" onClick={onStay}>
          {stayLabel}
        </Button>
      </div>
    </div>
  )
}
