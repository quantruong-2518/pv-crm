import { CircleX, Pencil } from '@pv/ui'
import { Button, Icon } from '@pv/ui'
import type { MailRunRow } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { CANCELLABLE, EDITABLE, SKIPPED_MAIL_COPY, type MailRunRoute } from '@/data/mail-runs'

/** Cells of the run book (G-Runs) that need more than one line of logic: what
 *  a group letter shows instead of a head count, and the two buttons G8 gates by state AND by who is asking. */

const PERMISSION_WHY = message(
  'Chỉ người tạo lô hoặc người có quyền phát chiến dịch.',
  'Only the run creator or someone allowed to broadcast campaigns.',
  '발송 건 작성자 또는 캠페인 발송 권한이 있는 사람만 가능합니다.',
)

export function RunLabel({ run }: { run: MailRunRow }) {
  const { t } = useI18n()
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
        {run.waveNo
          ? t(message(`Đợt ${run.waveNo} · `, `Wave ${run.waveNo} · `, `웨이브 ${run.waveNo} · `))
          : ''}
        {run.phase ?? run.label} · {run.subject}
      </span>
    </div>
  )
}

/** A group run is ONE letter to named To/CC (G1), so `audienceCount` is 1 and
 *  says nothing; the row does not carry the addresses, so it names the kind. */
export function RunAudience({ run }: { run: MailRunRow }) {
  const { t, number } = useI18n()
  if (run.kind === 'group') {
    return (
      <span
        title={t(
          message(
            'Một thư, mọi người nhận thấy địa chỉ của nhau',
            "One letter, everyone sees each other's address",
            '메일 한 통이며 모든 수신자가 서로의 주소를 볼 수 있습니다',
          ),
        )}
      >
        {t(message('Thư nhóm', 'Group letter', '그룹 메일'))}
      </span>
    )
  }
  return <span>{number(run.audienceCount)}</span>
}

/** `withheld` rides under the sent count: it is the other half of "why fewer
 *  left than were filed" on a later wave (G6), and not a failure. */
export function RunSent({ run }: { run: MailRunRow }) {
  const { t, number } = useI18n()
  return (
    <span className="flex flex-col items-end">
      <span>{number(run.sent)}</span>
      {run.withheld > 0 && (
        <span
          className="text-muted-foreground text-[11px]"
          title={t(
            message(
              'Đã trả lời hoặc đã có cuộc gặp sau đợt 1.',
              'Replied or met after wave 1.',
              '웨이브 1 이후 답장했거나 미팅을 했습니다.',
            ),
          )}
        >
          {t(SKIPPED_MAIL_COPY)} {number(run.withheld)}
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
  const { t } = useI18n()
  const canEdit = EDITABLE.includes(run.state)
  const canStop = CANCELLABLE.includes(run.state)
  const editWhy = !canEdit
    ? message(
        'Chỉ lô còn Hẹn giờ mới sửa được.',
        'Only a Scheduled run can be edited.',
        '예약됨 상태의 발송 건만 수정할 수 있습니다.',
      )
    : route
      ? message(
          'Sửa nội dung hoặc giờ gửi',
          'Edit the content or send time',
          '내용 또는 발송 시각 수정',
        )
      : PERMISSION_WHY
  const stopWhy = !canStop
    ? message('Lô đã kết thúc.', 'This run has ended.', '종료된 발송 건입니다.')
    : route
      ? message(
          'Giữ lại những thư chưa gửi',
          'Hold back the unsent letters',
          '보내지 않은 메일을 보류',
        )
      : PERMISSION_WHY

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span title={t(editWhy)}>
        <Button
          size="sm"
          variant="ghost"
          className="pointer-coarse:h-12"
          disabled={!canEdit || !route}
          onClick={onEdit}
        >
          <Icon icon={Pencil} size={14} />
          {t(message('Sửa', 'Edit', '수정'))}
        </Button>
      </span>
      <span title={t(stopWhy)}>
        <Button
          size="sm"
          variant="ghost"
          className="pointer-coarse:h-12"
          disabled={!canStop || !route || busy}
          onClick={() => route && onStop(route)}
        >
          <Icon icon={CircleX} size={14} />
          {t(message('Dừng', 'Stop', '중단'))}
        </Button>
      </span>
    </div>
  )
}
