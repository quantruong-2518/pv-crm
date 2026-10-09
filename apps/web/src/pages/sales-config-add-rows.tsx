import { useState } from 'react'
import { Plus } from '@pv/ui'
import { Button, Icon, Input, Select } from '@pv/ui'
import { OPPORTUNITY_STAGE_LABEL, StageKey } from '@pv/contracts'
import { toastDone } from '@/app/toast'
import { ROLE_LABEL } from '@/data/users'
import { useProposeLossReason, useProposeProduct, useProposeStopReason } from '@/data/sales-config'

/** The three "add one row" forms of the config screen — split out of
 *  `sales-config.tsx` on size alone (`max-lines`). Each sends on its own
 *  rather than joining the deadline batch (5.2 · 5.5): adding a row is a different verb
 *  on a different door (`POST` vs `PATCH`), and a name just typed has no old
 *  value to compare against. */

/** Who gates every proposal — same source `sales-config.tsx` reads, so the two
 *  never name two different roles for one E3 chain. */
const APPROVER = ROLE_LABEL.director

/** 5.4c · add one product to the catalog.
 *
 *  The box clears itself once the send lands, because the next thing typed
 *  is a different row, not an edit of the one just sent. */
export function AddProduct() {
  const [name, setName] = useState('')
  const propose = useProposeProduct()

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Input
        aria-label="Thêm sản phẩm/dịch vụ"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tên sản phẩm hoặc dịch vụ"
        className="min-w-0 flex-1"
      />

      <Button
        size="md"
        disabled={name.trim() === '' || propose.isPending}
        onClick={() =>
          propose.mutate(name.trim(), {
            onSuccess: () => {
              setName('')
              toastDone(`Đã gửi đề nghị thêm mục · chờ ${APPROVER} gật.`)
            },
          })
        }
      >
        <Icon icon={Plus} size={16} />
        Gửi đề nghị
      </Button>
    </div>
  )
}

/** Options for the create form's column picker: the 5 columns plus a clearing
 *  choice (empty value), which sends no `stage` at all — an absent `stage` is
 *  what makes a reason apply everywhere (ADR 0064 §6). */
const LOSS_REASON_STAGE_OPTIONS = [
  { value: '', label: 'Mọi cột' },
  ...StageKey.options.map((key) => ({ value: key, label: OPPORTUNITY_STAGE_LABEL[key] })),
]

/** 5.4b · add one care reason to the catalog, optionally scoped to a column.
 *
 *  Same shape as `AddProduct` above — an OPEN list, its own `POST` door —
 *  plus one more field: the column picker. Left on the clearing option, no
 *  `stage` travels, matching the rule "absent means every column"; picking one
 *  scopes the reason to that column. */
export function AddLossReason() {
  const [name, setName] = useState('')
  const [stage, setStage] = useState('')
  const propose = useProposeLossReason()

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Input
        aria-label="Thêm lý do vào danh sách chăm sóc"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Lý do vào danh sách chăm sóc"
        className="min-w-0 flex-1"
      />
      <Select
        label="Áp dụng ở cột"
        value={stage}
        onChange={setStage}
        options={LOSS_REASON_STAGE_OPTIONS}
      />

      <Button
        size="md"
        disabled={name.trim() === '' || propose.isPending}
        onClick={() =>
          propose.mutate(
            { name: name.trim(), ...(stage === '' ? {} : { stage: stage as StageKey }) },
            {
              onSuccess: () => {
                setName('')
                setStage('')
                toastDone(`Đã gửi đề nghị thêm mục · chờ ${APPROVER} gật.`)
              },
            },
          )
        }
      >
        <Icon icon={Plus} size={16} />
        Gửi đề nghị
      </Button>
    </div>
  )
}

/** 5.4 · add one reason to `EXIT_REASON`, the catalogue shared by both stop
 *  doors (ADR 0070) — the park door and the disqualify door read the same
 *  list, so one row added here opens up on both pickers at once. No stage
 *  picker: unlike `LOSS_REASON`, this list is not scoped to a board column. */
export function AddStopReason() {
  const [name, setName] = useState('')
  const propose = useProposeStopReason()

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Input
        aria-label="Thêm lý do dừng chăm sóc"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Lý do dừng chăm sóc"
        className="min-w-0 flex-1"
      />

      <Button
        size="md"
        disabled={name.trim() === '' || propose.isPending}
        onClick={() =>
          propose.mutate(name.trim(), {
            onSuccess: () => {
              setName('')
              toastDone(`Đã gửi đề nghị thêm mục · chờ ${APPROVER} gật.`)
            },
          })
        }
      >
        <Icon icon={Plus} size={16} />
        Gửi đề nghị
      </Button>
    </div>
  )
}
