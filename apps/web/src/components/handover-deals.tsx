import { Checkbox } from '@pv/ui'
import { message, useI18n } from '@/app/i18n'
import { standingLabel } from '@/data/opportunities'
import type { HandoverChoice } from '@/data/lead-owner'

/** The checklist shown above the confirm line. Renders nothing when the old
 *  holder stands as SALE on no open deal of this lead. */
export function HandoverDeals({ choice }: { choice: HandoverChoice }) {
  const { t } = useI18n()
  if (choice.failed) {
    return (
      <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
        {t(
          message(
            'Chưa đọc được cơ hội của lead. Xác nhận thì mọi cơ hội đang mở mà người cũ làm Sale đi cùng lead.',
            'Could not load the lead’s opportunities. If you confirm, every open opportunity where the previous owner is Sale moves with the lead.',
            '리드의 기회를 불러오지 못했습니다. 확인하면 이전 담당자가 영업인 모든 진행 중 기회가 리드와 함께 이동합니다.',
          ),
        )}
      </p>
    )
  }
  if (choice.deals.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <span className="text-[12.5px] font-semibold">
        {t(
          message(
            'Cơ hội đi cùng lead',
            'Opportunities moving with the lead',
            '리드와 함께 이동할 기회',
          ),
        )}
      </span>
      <div className="flex flex-col gap-1">
        {choice.deals.map((deal) => (
          <Checkbox
            key={deal.code}
            className="min-h-12"
            wrap
            checked={choice.isTicked(deal.code)}
            onChange={() => choice.toggle(deal.code)}
            label={deal.name}
            hint={`${deal.code} · ${standingLabel(deal)}`}
          />
        ))}
      </div>
      {choice.hidden > 0 && (
        <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
          {t(
            message(
              `Còn ${choice.hidden} cơ hội bạn không xem được. Chúng chỉ đi cùng lead khi bạn chọn hết các ô.`,
              `${choice.hidden} more ${choice.hidden === 1 ? 'opportunity' : 'opportunities'} you cannot see. They only move with the lead when you tick every box.`,
              `볼 수 없는 기회가 ${choice.hidden}건 더 있습니다. 모든 항목을 선택해야 리드와 함께 이동합니다.`,
            ),
          )}
        </p>
      )}
      <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
        {t(
          message(
            'Cơ hội đang chờ duyệt ký ở lại với người cũ.',
            'Opportunities awaiting signature approval stay with the previous owner.',
            '서명 승인 대기 중인 기회는 이전 담당자에게 남습니다.',
          ),
        )}
      </p>
    </section>
  )
}
