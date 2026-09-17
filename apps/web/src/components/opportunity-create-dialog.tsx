import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TriangleAlert, X } from '@pv/ui'
import { Button, Drawer, EmptyState, Icon, Skeleton } from '@pv/ui'
import type { LeadRow, OpportunityCreateResponse } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { leadProfileQuery } from '@/data/lead-profile'
import { LeadPickList } from './lead-picker'
import { ConvertDialog } from './convert-dialog'

/** Module 3 · one opportunity typed by hand, opened from the opportunity book.
 *
 *  ------------------------------------------------------------------
 *  TWO STEPS, BECAUSE THE FORM CANNOT EXIST BEFORE THE LEAD DOES
 *  ------------------------------------------------------------------
 *  `POST /sales/opportunities` requires a `leadCode` and the column carries a
 *  foreign key, so a blank ticket is not a shape this door accepts. The lead
 *  profile is also what seeds the fourteen cells (`draftOpportunity`) — pick
 *  the lead first and the form opens most of the way filled in; a form that
 *  asked for the lead last would have nothing to seed from.
 *
 *  So step two is `ConvertDialog` ITSELF, unchanged. The lead profile has been
 *  opening that same panel since day one; a second copy of the fourteen cells
 *  here is a second place they drift apart.
 *
 *  ------------------------------------------------------------------
 *  WHY THE ROWS SHOW EXISTING DEALS, PER ROW
 *  ------------------------------------------------------------------
 *  A lead may hold several open deals at once, and opening one more is never
 *  refused for that reason — so the badge below is INFORMATION, not a gate.
 *  It still asks per row rather than through the book, because the book's
 *  scope axis (`ownOnly`) would hide a colleague's deal from a Sale, and
 *  `live-deal` is unscoped on purpose (see `opportunitiesOfLeadQuery`). */

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (row: OpportunityCreateResponse) => void
}

export function OpportunityCreateDialog({ open, onClose, onCreated }: Props) {
  const [picked, setPicked] = useState<LeadRow | null>(null)
  const [wasOpen, setWasOpen] = useState(open)

  /* Cleared on the way IN, not on the way out. Dropping the lead the moment
     `open` goes false unmounts the panel mid-slide, and `Drawer` runs its exit
     animation only while it is still mounted. Adjusted during render rather
     than in an effect so a reopened panel never flashes step two for one frame
     before the effect catches up. */
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setPicked(null)
  }

  return picked === null ? (
    <LeadPicker open={open} onClose={onClose} onPick={setPicked} />
  ) : (
    <ConvertStep lead={picked} open={open} onClose={onClose} onCreated={onCreated} />
  )
}

// ---------------------------------------------------------------------------

/** Step one — which lead this deal comes out of. The list itself lives in
 *  `components/lead-picker.tsx`: the create PAGE asks the same question without
 *  a drawer around it. */
function LeadPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (lead: LeadRow) => void
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      /* `lg`, the width step two uses. Picking a lead swaps one panel for the
         other with no animation in between, so a narrower step one would read
         as the panel jerking wider rather than as one form moving on. */
      width="lg"
      title="Tạo cơ hội"
      subtitle="Một cơ hội mọc ra từ một lead. Chọn lead trước — phiếu điền mở ngay sau, đã mồi sẵn tên, tiền và người bán của khách đó."
      footer={
        <div className="flex justify-end">
          <Button size="md" variant="ghost" onClick={onClose}>
            <Icon icon={X} size={16} />
            Huỷ
          </Button>
        </div>
      }
    >
      <LeadPickList enabled={open} onPick={onPick} onGiveUp={onClose} />
    </Drawer>
  )
}

/** Step two — the lead's profile, then the panel that has always filled this
 *  form in. The profile is a second read because `ConvertDialog` seeds from a
 *  `LeadProfile` and a book row is not one; `profileForm` is the only
 *  translation into the form's shape, and it takes the profile. */
function ConvertStep({
  lead,
  open,
  onClose,
  onCreated,
}: {
  lead: LeadRow
  open: boolean
  onClose: () => void
  onCreated: (row: OpportunityCreateResponse) => void
}) {
  const { data: profile, error, refetch } = useQuery(leadProfileQuery(lead.code))

  if (profile !== undefined) {
    return <ConvertDialog profile={profile} open={open} onClose={onClose} onCreated={onCreated} />
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      title="Đổi lead thành cơ hội"
      subtitle={
        <>
          <span className="font-mono">{lead.code}</span> · {lead.company}
        </>
      }
      footer={
        <div className="flex justify-end">
          <Button size="md" variant="ghost" onClick={onClose}>
            <Icon icon={X} size={16} />
            Huỷ
          </Button>
        </div>
      }
    >
      {error ? (
        <EmptyState
          icon={TriangleAlert}
          message={`Không mở được hồ sơ lead ${lead.code}. ${
            isApiError(error) ? userMessage(error) : 'Vui lòng thử lại.'
          }`}
          action={{ label: 'Thử lại', onClick: () => void refetch() }}
          className="py-12"
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}
    </Drawer>
  )
}
