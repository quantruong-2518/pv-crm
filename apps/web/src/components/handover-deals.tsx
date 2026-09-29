import { Checkbox } from '@pv/ui'
import { standingLabel } from '@/data/opportunities'
import type { HandoverChoice } from '@/data/lead-owner'

/** The checklist shown above the confirm line. Renders nothing when the old
 *  holder stands as SALE on no open deal of this lead. */
export function HandoverDeals({ choice }: { choice: HandoverChoice }) {
  if (choice.failed) {
    return (
      <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
        Chưa đọc được cơ hội của lead. Nếu xác nhận, mọi cơ hội đang mở người cũ đứng tên Sale sẽ đi
        cùng lead.
      </p>
    )
  }
  if (choice.deals.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <span className="text-[12.5px] font-semibold">Cơ hội đi cùng lead</span>
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
          Còn {choice.hidden} cơ hội bạn không xem được — chỉ đi cùng lead khi bạn giữ mọi ô.
        </p>
      )}
      <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
        Cơ hội đang chờ duyệt ký, hoặc đổi người làm sai luật PIC, sẽ ở lại với người cũ và có ghi
        chú trên dòng thời gian của cơ hội.
      </p>
    </section>
  )
}
