import { useState } from 'react'
import { UserRoundPlus } from '@pv/ui'
import type { OpportunityProfileResponse, RoleId } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { PRESALES_LANE } from '@/data/opportunities'
import { usePresalesOwners } from '@/data/opportunity-presales'
import { SellerModal } from './seller-modal'

/** The Presales lane's assign act (ADR 0160 §5): replaces the whole lane, like
 *  the Sale one, but the modal asks for no primary and no reason. Controlled
 *  only — the deal rail's owner row holds the door. */

const isPresales = (roleIds: readonly RoleId[]) => roleIds.includes('presales')
const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id))

export function AssignPresalesModal({
  op,
  open,
  onClose,
}: {
  op: Pick<OpportunityProfileResponse, 'code' | 'owners'>
  open: boolean
  onClose: () => void
}) {
  const { t } = useI18n()
  /* `null` = untouched, so the modal opens on the lane as it stands. */
  const [picked, setPicked] = useState<string[] | null>(null)
  const assign = usePresalesOwners(op.code)
  const lane = op.owners.filter((o) => o.role === 'PRESALES')
  const current = lane.map((o) => o.id)
  const people = picked ?? current
  const unchanged = sameSet(people, current)
  const label =
    current.length > 0
      ? t(message('Đổi Presales', 'Change presales', '프리세일즈 변경'))
      : t(message('Giao Presales', 'Assign presales', '프리세일즈 지정'))
  const [head, tail] = t(
    message(
      'Danh sách dưới đây thay toàn bộ Presales của {code}.',
      'The list below replaces all presales on {code}.',
      '{code}의 프리세일즈 전체를 아래 목록으로 교체합니다.',
    ),
  ).split('{code}')

  const close = () => {
    onClose()
    setPicked(null)
    assign.reset()
  }
  const submit = () => {
    if (unchanged) return
    assign.mutate(
      { presalesOwners: people },
      {
        onSuccess: () => {
          toastDone(
            t(
              message(
                `Đã cập nhật Presales ${op.code}.`,
                `Presales of ${op.code} updated.`,
                `${op.code}의 프리세일즈를 업데이트했습니다.`,
              ),
            ),
          )
          close()
        },
      },
    )
  }

  return (
    <SellerModal
      open={open}
      onClose={close}
      title={label}
      subtitle={
        <>
          {head}
          <span className="font-mono">{op.code}</span>
          {tail}
        </>
      }
      fieldLabel={t(message(PRESALES_LANE.label, 'Presales', '프리세일즈'))}
      fieldHint={t(
        message(
          'Chỉ người vai Presales.',
          'Only people with the Presales role.',
          '프리세일즈 역할만 선택할 수 있습니다.',
        ),
      )}
      sellers={people}
      onChange={setPicked}
      names={new Map(lane.map((o) => [o.id, o.name]))}
      pool={isPresales}
      noMore={t(
        message(
          'Không còn Presales nào để thêm.',
          'No more presales to add.',
          '추가할 프리세일즈가 없습니다.',
        ),
      )}
      note={
        unchanged
          ? t(message('Chưa có gì thay đổi.', 'Nothing has changed.', '변경된 내용이 없습니다.'))
          : ''
      }
      error={assign.error}
      busy={assign.isPending}
      submitDisabled={unchanged}
      icon={UserRoundPlus}
      submitLabel={label}
      busyLabel={t(message('Đang lưu…', 'Saving…', '저장 중…'))}
      onSubmit={submit}
    />
  )
}
