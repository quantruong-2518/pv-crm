import type { ReactNode } from 'react'
import { Check } from '@pv/ui'
import { Badge, Button, Chip, Icon } from '@pv/ui'
import {
  type OpportunityContactPick,
  type OpportunityCreateResponse,
  type OpportunityOpenContext,
} from '@pv/contracts'
import { CURRENCIES } from '@pv/engines/fixtures/das-vina'
import { dmy } from '@/lib/date'
import { message, translate, useI18n } from '@/app/i18n'
import {
  leadStateLabel,
  opportunityContactRoleLabel,
  opportunityStageLabel,
} from '@/data/sales-labels-i18n'
import {
  BD_LANE,
  SALE_LANE,
  bdOwnersOf,
  laneText,
  namesOf,
  saleOwnersOf,
} from '@/data/opportunities'

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

function contactLine(created: Created, lang: ReturnType<typeof useI18n>['lang']): string {
  const primary = translate(message('chính', 'primary', '주 담당'), lang)
  return created.picks
    .map((pick) => {
      const name = created.contactNames[pick.contactCode] ?? pick.contactCode
      const note = pick.primary
        ? primary
        : pick.role
          ? opportunityContactRoleLabel(pick.role, lang).toLowerCase()
          : null
      return note ? `${name} · ${note}` : name
    })
    .join(', ')
}

function nextText(created: Created, lang: ReturnType<typeof useI18n>['lang']): string {
  const { row, context, convertsLead, leadCode } = created
  const ws = context.workstream?.code
  const days = context.newStageLimitDays
  const assigned = opportunityStageLabel('assigned', lang)
  const newStage = opportunityStageLabel('new', lang)
  const converted = leadStateLabel('converted', lang)
  const first =
    row.stage === 'new'
      ? translate(
          message(
            `Cơ hội chờ trưởng phòng Nhận PIC và giao Sale${days === null ? '' : `, hạn ${days} ngày`}. Trên bảng lượt bán, thẻ ${ws ?? 'lượt bán'} đã chuyển sang cơ hội · ${newStage}${days === null ? '' : ', quá hạn thì hiện trễ'}.`,
            `The opportunity is waiting for a manager to assign an owner and salesperson${days === null ? '' : `, due in ${days} days`}. Workstream ${ws ?? ''} now includes the ${newStage} opportunity${days === null ? '' : '; overdue items are marked late'}.`,
            `기회 담당자와 영업 담당자를 관리자에게 배정 대기 중${days === null ? '' : `, 기한 ${days}일`}. 영업 건 ${ws ?? ''}에 ${newStage} 기회가 추가되었습니다${days === null ? '' : '; 기한이 지나면 지연으로 표시됩니다'}.`,
          ),
          lang,
        )
      : translate(
          message(
            `Cơ hội đã nhận PIC và nằm ở cột ${assigned}. Trên bảng lượt bán, thẻ ${ws ?? 'lượt bán'} đã chuyển sang cơ hội · ${assigned}.`,
            `The opportunity has an owner and is in ${assigned}. Workstream ${ws ?? ''} now includes it.`,
            `기회 담당자가 지정되어 ${assigned} 단계입니다. 영업 건 ${ws ?? ''}에 해당 기회가 추가되었습니다.`,
          ),
          lang,
        )
  return convertsLead
    ? `${first} ${translate(message(`Lead ${leadCode} chuyển sang ${converted}.`, `Lead ${leadCode} moved to ${converted}.`, `리드 ${leadCode}이(가) ${converted}(으)로 전환되었습니다.`), lang)}`
    : first
}

function moneyText(
  row: OpportunityCreateResponse,
  lang: ReturnType<typeof useI18n>['lang'],
): string {
  if (row.amount === null) return '—'
  const symbol = CURRENCIES.find((c) => c.code === row.currency)?.symbol ?? ''
  return `${row.amount.toLocaleString(lang === 'vi' ? 'vi-VN' : lang === 'ko' ? 'ko-KR' : 'en-US')} ${symbol || row.currency || ''}`.trim()
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
  const { t, lang } = useI18n()
  const { row, context } = created
  const { workstream } = context
  const bd = namesOf(bdOwnersOf(row))
  const sale = saleOwnersOf(row)

  return (
    <div className="flex flex-col gap-8 py-8">
      <div className="flex flex-col gap-4">
        <span className="bg-success/20 text-on-tint-success-strong flex size-12 items-center justify-center rounded-md">
          <Icon icon={Check} size={24} />
        </span>
        <div className="flex flex-col gap-2">
          <h3 className="font-display m-0 text-[24px] font-semibold leading-[1.3]">
            {t(message('Đã mở cơ hội ', 'Opportunity ', '기회 '))}
            <span className="text-accent-foreground font-mono">{row.code}</span>
            {t(message('', ' created', ' 생성 완료'))}
          </h3>
          <p className="text-muted-foreground m-0 text-[14px]">{row.name}</p>
        </div>
      </div>

      <div
        className="flex flex-col"
        aria-label={t(
          message('Tóm tắt cơ hội vừa mở', 'Summary of the new opportunity', '새 기회 요약'),
        )}
      >
        {workstream && (
          <Pair label={t(message('Lượt bán', 'Workstream', '영업 건'))}>
            <Chip>{workstream.code}</Chip>
            {workstream.customer !== null && (
              <Badge tone={workstream.customer === 'new' ? 'running' : 'success'}>
                {t(
                  message(
                    workstream.customer === 'new' ? 'Khách mới' : 'Khách cũ',
                    workstream.customer === 'new' ? 'New customer' : 'Existing customer',
                    workstream.customer === 'new' ? '신규 고객' : '기존 고객',
                  ),
                )}
              </Badge>
            )}
          </Pair>
        )}
        <Pair label={t(message('Giá trị đơn', 'Opportunity value', '기회 금액'))}>
          <span className="tnum font-mono">{moneyText(row, lang)}</span>
        </Pair>
        <Pair label={t(message('Ngày chốt dự kiến', 'Expected close date', '예상 종료일'))}>
          {row.expectedClose ? dmy(row.expectedClose) : '—'}
        </Pair>
        <Pair label={t(message('Người liên hệ', 'Contacts', '연락처'))}>
          {contactLine(created, lang)}
        </Pair>
        <Pair label={t(message(BD_LANE.label, 'Business development', '사업 개발'))}>
          {bd.length > 0 ? bd.join(', ') : '—'}
        </Pair>
        {sale.length > 0 && (
          <Pair label={t(message(SALE_LANE.label, 'Salesperson', '영업 담당자'))}>
            {laneText(sale)}
          </Pair>
        )}
        <Pair label={t(message('Công ty', 'Account', '고객사'))}>
          {row.accountCode ? (
            <>
              <Chip>{row.accountCode}</Chip>
              {row.account}
            </>
          ) : (
            <>
              <Badge tone="warning">{t(message('Chưa gắn', 'Not linked', '연결되지 않음'))}</Badge>
              <span className="text-muted-foreground text-[12px]">
                {t(message('cần có trước khi ký', 'required before signing', '서명 전에 필요'))}
              </span>
            </>
          )}
        </Pair>
        <Pair label={t(message('Cột hiện tại', 'Current stage', '현재 단계'))}>
          <Badge tone="draft">{row.stage ? opportunityStageLabel(row.stage, lang) : '—'}</Badge>
        </Pair>
      </div>

      <div className="bg-surface-ink/9 flex flex-col gap-1 rounded-md px-5 py-4">
        <span className="text-[14px] font-semibold">{t(message('Tiếp theo', 'Next', '다음'))}</span>
        <span className="text-muted-foreground text-[13px] leading-[1.6]">
          {nextText(created, lang)}
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button size="lg" onClick={onOpen}>
          {t(message('Mở', 'Open', '열기'))} <span className="font-mono">{row.code}</span>
        </Button>
        <Button size="lg" variant="ghost" onClick={onStay}>
          {stayLabel}
        </Button>
      </div>
    </div>
  )
}
