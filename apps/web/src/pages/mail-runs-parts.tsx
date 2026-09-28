import { CircleX, Pencil } from '@pv/ui'
import { Button, Icon } from '@pv/ui'
import type { MailRunRow } from '@pv/contracts'
import { CANCELLABLE, EDITABLE, SKIPPED_MAIL_LABEL, type MailRunRoute } from '@/data/mail-runs'

/** Cells of the run book (G-Runs) that need more than one line of logic: who
 *  filed the run, what a group letter shows instead of a head count, and the
 *  two buttons G8 gates by state AND by who is asking. */

const num = (n: number) => n.toLocaleString('vi-VN')

const PERMISSION_WHY = 'Chỉ người tạo lô hoặc người có quyền phát chiến dịch.'

export function RunLabel({ run }: { run: MailRunRow }) {
  const name = run.sequenceName ?? run.campaignName ?? run.label
  return (
    <div className="min-w-0">
      <span className="block truncate" title={name}>
        {name}
      </span>
      <span
        className="text-muted-foreground block truncate text-[11px]"
        title={`${run.phase ?? run.label} · ${run.subject}`}
      >
        {run.waveNo ? `Đợt ${run.waveNo} · ` : ''}
        {run.phase ?? run.label} · {run.subject}
      </span>
      <span className="text-muted-foreground block truncate text-[11px]">
        Tạo bởi {run.createdBy.name}
        {run.mine ? ' (bạn)' : ''}
      </span>
    </div>
  )
}

/** A group run is ONE letter to named To/CC (G1), so `audienceCount` is 1 and
 *  says nothing; the row does not carry the addresses, so it names the kind. */
export function RunAudience({ run }: { run: MailRunRow }) {
  if (run.kind === 'group') {
    return <span title="Một thư, mọi người nhận cùng thấy To/CC">Thư nhóm</span>
  }
  return <span>{num(run.audienceCount)}</span>
}

/** `withheld` rides under the sent count: it is the other half of "why fewer
 *  left than were filed" on a later wave (G6), and not a failure. */
export function RunSent({ run }: { run: MailRunRow }) {
  return (
    <span className="flex flex-col items-end">
      <span>{num(run.sent)}</span>
      {run.withheld > 0 && (
        <span
          className="text-muted-foreground text-[11px]"
          title="Đã trả lời hoặc đã có cuộc gặp sau đợt 1, nên không gửi đợt này."
        >
          {SKIPPED_MAIL_LABEL} {num(run.withheld)}
        </span>
      )}
    </span>
  )
}

/** Greyed with the reason rather than hidden: the row's state says when Edit
 *  comes back, and a missing button hides that. The title sits on a wrapper
 *  because a disabled button fires no hover in most browsers. */
export function RunActions({
  run,
  route,
  busy,
  onEdit,
  onStop,
}: {
  run: MailRunRow
  route: MailRunRoute | null
  busy: boolean
  onEdit: () => void
  onStop: (route: MailRunRoute) => void
}) {
  const canEdit = EDITABLE.includes(run.state)
  const canStop = CANCELLABLE.includes(run.state)
  const editWhy = !canEdit
    ? 'Chỉ lô còn Hẹn giờ mới sửa được.'
    : route
      ? 'Sửa nội dung hoặc giờ gửi'
      : PERMISSION_WHY
  const stopWhy = !canStop
    ? 'Lô đã kết thúc.'
    : route
      ? 'Giữ lại những thư chưa gửi'
      : PERMISSION_WHY

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span title={editWhy}>
        <Button
          size="sm"
          variant="ghost"
          className="pointer-coarse:h-12"
          disabled={!canEdit || !route}
          onClick={onEdit}
        >
          <Icon icon={Pencil} size={14} />
          Sửa
        </Button>
      </span>
      <span title={stopWhy}>
        <Button
          size="sm"
          variant="ghost"
          className="pointer-coarse:h-12"
          disabled={!canStop || !route || busy}
          onClick={() => route && onStop(route)}
        >
          <Icon icon={CircleX} size={14} />
          Dừng
        </Button>
      </span>
    </div>
  )
}
