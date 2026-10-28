import { useState } from 'react'
import { Button, Icon, Input, Plus, Select } from '@pv/ui'
import type { ConfigEntry, ConfigEntryPatch } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { toastDone } from '@/app/toast'
import { useProposeConfigCreate, useProposeIndustryMerge } from '@/data/industries'
import { useMyConfigProposals, useProposeConfigPatch } from '@/data/sales-config'
import { industryAddsWaiting, industryWaiting } from './sales-config-model'
import { SENT, WaitingNote } from './sales-config-section'

/** 5.20 · what one industry pill opens, and the add row under a category.
 *  Split from `sales-config-industries.tsx` on size. Each control sends its own
 *  proposal: a rename, a move, a merge and a switch are four answers an
 *  approver may want to give separately. */

const ROW = 'flex flex-wrap items-end gap-3'

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
  const canPropose = useCan('config.propose')
  const waiting = industryWaiting(useMyConfigProposals(), industry.id)
  const patch = useProposeConfigPatch()
  const merge = useProposeIndustryMerge()
  const [name, setName] = useState(industry.name)
  const [to, setTo] = useState('')
  const [into, setInto] = useState('')
  const busy = patch.isPending || merge.isPending
  const send = (body: ConfigEntryPatch) =>
    patch.mutate({ list: 'INDUSTRY', id: industry.id, patch: body }, { onSuccess: onSent })
  const onSent = () => {
    toastDone(SENT)
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
            · {usage} lead
          </span>
        </span>
        <Button size="sm" variant="ghost" className="pointer-coarse:h-12" onClick={onClose}>
          Đóng
        </Button>
      </div>
      {canPropose && (
        <>
          <div className={ROW}>
            <Input
              aria-label={`Tên mới cho ${industry.name}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="pointer-coarse:h-12 min-w-40 flex-1"
            />
            <Button
              size="md"
              variant="secondary"
              className="pointer-coarse:h-12"
              disabled={busy || name.trim() === '' || name.trim() === industry.name}
              onClick={() => send({ name: name.trim() })}
            >
              Đổi tên
            </Button>
          </div>
          <div className={ROW}>
            <Select
              label="Chuyển sang nhóm"
              size="lg"
              value={to}
              onChange={setTo}
              options={[
                { value: '', label: 'Chọn nhóm ngành' },
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
              Chuyển nhóm
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <div className={ROW}>
              <Select
                label="Gộp vào ngành"
                size="lg"
                value={into}
                onChange={setInto}
                options={[
                  { value: '', label: 'Chọn ngành' },
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
                Gộp
              </Button>
            </div>
            <span className="text-muted-foreground text-[11.5px]">
              Mọi lead mang ngành này chuyển sang ngành được chọn.
            </span>
          </div>
          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12 self-start"
            disabled={busy}
            onClick={() => send({ active: !industry.active })}
          >
            {industry.active ? 'Tắt ngành' : 'Bật ngành'}
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
          Thêm ngành
        </Button>
      ) : (
        <div className={ROW}>
          <Input
            aria-label={`Tên ngành mới trong nhóm ${group}`}
            placeholder="Tên ngành"
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
                { onSuccess: () => (setName(null), toastDone(SENT)) },
              )
            }
          >
            Gửi đề nghị
          </Button>
          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12"
            onClick={() => setName(null)}
          >
            Huỷ
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
