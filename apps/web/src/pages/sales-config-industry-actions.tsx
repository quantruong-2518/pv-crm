import { useState } from 'react'
import { Button, Icon, Input, Plus, Select } from '@pv/ui'
import type { ConfigEntry, ConfigEntryPatch } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { useProposeConfigCreate, useProposeIndustryMerge } from '@/data/industries'
import { useMyConfigProposals, useProposeConfigPatch } from '@/data/sales-config'
import { industryAddsWaiting, industryWaiting } from './sales-config-model'
import { WaitingNote } from './sales-config-section'
import { sentCopy } from './sales-config-copy'

/** 5.20 · what one industry pill opens, and the add row under a category.
 *  Split from `sales-config-industries.tsx` on size. Each control sends its own
 *  proposal: a rename, a move, a merge and a switch are four answers an
 *  approver may want to give separately. */

const ROW = 'flex flex-wrap items-end gap-3'

/** The rename box and its send; the text state lives here, apart from the other controls. */
function RenameRow({
  industry,
  busy,
  onSend,
}: {
  industry: ConfigEntry
  busy: boolean
  onSend: (body: ConfigEntryPatch) => void
}) {
  const { t } = useI18n()
  const [name, setName] = useState(industry.name)
  return (
    <div className={ROW}>
      <Input
        aria-label={t(
          message(
            `Tên mới cho ${industry.name}`,
            `New name for ${industry.name}`,
            `${industry.name} 새 이름`,
          ),
        )}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="pointer-coarse:h-12 min-w-40 flex-1"
      />
      <Button
        size="md"
        variant="secondary"
        className="pointer-coarse:h-12"
        disabled={busy || name.trim() === '' || name.trim() === industry.name}
        onClick={() => onSend({ name: name.trim() })}
      >
        {t(message('Đổi tên', 'Rename', '이름 변경'))}
      </Button>
    </div>
  )
}

/** Rename, move to a category, merge into another industry, switch off or on. */
export function IndustryActions({
  industry,
  usage,
  categories,
  others,
  onClose,
}: {
  industry: ConfigEntry
  usage: number
  /** Active categories, the industry's own included. */
  categories: ConfigEntry[]
  /** Active industries it may be merged into, named with their category. */
  others: { id: string; label: string }[]
  onClose: () => void
}) {
  const { t, number } = useI18n()
  const canPropose = useCan('config.propose')
  const waiting = industryWaiting(useMyConfigProposals(), industry.id)
  const patch = useProposeConfigPatch()
  const merge = useProposeIndustryMerge()
  const [to, setTo] = useState('')
  const [into, setInto] = useState('')
  const busy = patch.isPending || merge.isPending
  const send = (body: ConfigEntryPatch) =>
    patch.mutate({ list: 'INDUSTRY', id: industry.id, patch: body }, { onSuccess: onSent })
  const onSent = () => {
    toastDone(sentCopy())
    onClose()
  }
  const moveTo = categories.filter((c) => c.id !== industry.parentId)
  const error = patch.error ?? merge.error

  return (
    <div className="bg-surface-ink/5 flex flex-col gap-4 rounded-md p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] font-semibold">
          {industry.name}
          <span className="text-muted-foreground tnum font-num text-[11.5px] font-normal">
            {' '}
            ·{' '}
            {t(
              message(
                `${number(usage)} lead`,
                `${number(usage)} ${usage === 1 ? 'lead' : 'leads'}`,
                `리드 ${number(usage)}건`,
              ),
            )}
          </span>
        </span>
        <Button size="sm" variant="ghost" className="pointer-coarse:h-12" onClick={onClose}>
          {t(message('Đóng', 'Close', '닫기'))}
        </Button>
      </div>
      {canPropose && (
        <>
          <RenameRow industry={industry} busy={busy} onSend={send} />
          <div className={ROW}>
            <Select
              label={t(message('Chuyển sang nhóm', 'Move to group', '그룹으로 이동'))}
              size="lg"
              value={to}
              onChange={setTo}
              options={[
                {
                  value: '',
                  label: t(
                    message('Chọn nhóm ngành', 'Choose an industry group', '산업 분야 선택'),
                  ),
                },
                ...moveTo.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <Button
              size="md"
              variant="secondary"
              className="pointer-coarse:h-12"
              disabled={busy || to === ''}
              onClick={() => send({ parentId: to })}
            >
              {t(message('Chuyển nhóm', 'Move', '그룹 이동'))}
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <div className={ROW}>
              <Select
                label={t(message('Gộp vào ngành', 'Merge into industry', '다른 업종에 병합'))}
                size="lg"
                value={into}
                onChange={setInto}
                options={[
                  { value: '', label: t(message('Chọn ngành', 'Choose an industry', '업종 선택')) },
                  ...others.map((o) => ({ value: o.id, label: o.label })),
                ]}
              />
              <Button
                size="md"
                variant="secondary"
                className="pointer-coarse:h-12"
                disabled={busy || into === ''}
                onClick={() =>
                  merge.mutate({ sourceId: industry.id, targetId: into }, { onSuccess: onSent })
                }
              >
                {t(message('Gộp', 'Merge', '병합'))}
              </Button>
            </div>
            <span className="text-muted-foreground text-[11.5px]">
              {t(
                message(
                  'Mọi lead mang ngành này chuyển sang ngành được chọn.',
                  'Every lead with this industry moves to the chosen industry.',
                  '이 업종의 모든 리드가 선택한 업종으로 옮겨집니다.',
                ),
              )}
            </span>
          </div>
          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12 self-start"
            disabled={busy}
            onClick={() => send({ active: !industry.active })}
          >
            {industry.active
              ? t(message('Tắt ngành', 'Turn industry off', '업종 끄기'))
              : t(message('Bật ngành', 'Turn industry on', '업종 켜기'))}
          </Button>
        </>
      )}
      <WaitingNote words={waiting} />
      {error && (
        <p role="alert" className="text-destructive-foreground m-0 text-[11.5px]">
          {userMessage(error)}
        </p>
      )}
    </div>
  )
}

/** Add an industry under one category: a ghost button that opens a name box. */
export function AddIndustry({ parentId, group }: { parentId: string; group: string }) {
  const { t } = useI18n()
  const canPropose = useCan('config.propose')
  const propose = useProposeConfigCreate()
  const adds = industryAddsWaiting(useMyConfigProposals(), parentId)
  const [name, setName] = useState<string | null>(null)
  if (!canPropose) return null

  return (
    <div className="flex flex-col gap-2">
      {adds.map((sentence, at) => (
        <WaitingNote key={`${at}/${sentence}`} words={sentence} />
      ))}
      {name === null ? (
        <Button
          size="sm"
          variant="ghost"
          className="pointer-coarse:h-12 self-start"
          onClick={() => setName('')}
        >
          <Icon icon={Plus} size={16} />
          {t(message('Thêm ngành', 'Add industry', '업종 추가'))}
        </Button>
      ) : (
        <div className={ROW}>
          <Input
            aria-label={t(
              message(
                `Tên ngành mới trong nhóm ${group}`,
                `New industry name in ${group}`,
                `${group} 그룹의 새 업종 이름`,
              ),
            )}
            placeholder={t(message('Tên ngành', 'Industry name', '업종 이름'))}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="pointer-coarse:h-12 min-w-40 flex-1"
          />
          <Button
            size="md"
            className="pointer-coarse:h-12"
            disabled={name.trim() === '' || propose.isPending}
            onClick={() =>
              propose.mutate(
                { list: 'INDUSTRY', body: { name: name.trim(), parentId } },
                { onSuccess: () => (setName(null), toastDone(sentCopy())) },
              )
            }
          >
            {t(message('Gửi đề nghị', 'Submit proposal', '변경 제안'))}
          </Button>
          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12"
            onClick={() => setName(null)}
          >
            {t(message('Huỷ', 'Cancel', '취소'))}
          </Button>
        </div>
      )}
      {propose.error && (
        <p role="alert" className="text-destructive-foreground m-0 text-[11.5px]">
          {userMessage(propose.error)}
        </p>
      )}
    </div>
  )
}
