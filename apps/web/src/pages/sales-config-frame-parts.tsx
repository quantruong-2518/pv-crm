import { useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Badge,
  Button,
  Icon,
  Input,
  MetaPill,
  Pencil,
  Plus,
  Select,
  type SelectOption,
} from '@pv/ui'
import type { ConfigEntry, StateAddress, StepTemplate, StepTemplatePatch } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { toastDone } from '@/app/toast'
import { BADGE_INK } from '@/data/opportunities'
import { useProposeFrame } from '@/data/step-frame'
import { ROLE_LABEL } from '@/data/users'
import { byOrd, isDays } from './sales-config-model'

/** Rows of the journey frame's template list (`sales-config-frame.tsx`).
 *
 *  Same rules as every list on the config screen: no hard delete (off is the
 *  only one), every add, edit, switch or move goes to the approval inbox, and
 *  the row keeps showing the stored value until the director approves. */

export const FRAME_SENT = `Đã gửi đề nghị · chờ ${ROLE_LABEL.director} duyệt.`

/** The trigger is the control a finger lands on, and `Select` sizes it itself. */
const SELECT_TOUCH = 'pointer-coarse:[&>button]:h-12'

const DAYS_BOX = 'pointer-coarse:h-12 tnum h-10 w-24'

const NO_KIND = ''

/** Live kinds, plus `keep` when it has been switched off since — a select
 *  whose value is not among its options prints a bare id. */
function kindOptions(kinds: ConfigEntry[], keep?: string): SelectOption[] {
  return [...kinds]
    .filter((k) => k.active || k.id === keep)
    .sort(byOrd)
    .map((k) => ({ value: k.id, label: k.name }))
}

const daysOk = (days: string) => days.trim() === '' || isDays(days)

/** One template: name, kind, default due, state — and for a proposer edit,
 *  switch and move. A move sends the state's FULL id list in its new order
 *  (`ids` includes switched-off rows), the only shape the order door checks. */
export function TemplateRow({
  template,
  kinds,
  ids,
  at,
}: {
  template: StepTemplate
  kinds: ConfigEntry[]
  ids: string[]
  at: number
}) {
  const canPropose = useCan('config.propose')
  const propose = useProposeFrame()
  const [editing, setEditing] = useState(false)
  const sent = {
    onSuccess: () => {
      setEditing(false)
      toastDone(FRAME_SENT)
    },
  }
  const move = (to: number) => {
    const next = [...ids]
    next.splice(to, 0, ...next.splice(at, 1))
    propose.mutate({ door: 'order', body: { address: template.address, ids: next } }, sent)
  }
  const kindName = kinds.find((k) => k.id === template.kindId)?.name ?? template.kindId

  return (
    <div className="flex flex-col gap-2">
      {editing ? (
        <TemplateEdit
          template={template}
          kinds={kinds}
          busy={propose.isPending}
          onSend={(body) => propose.mutate({ door: 'patch', id: template.id, body }, sent)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span className="min-w-0 flex-1 basis-48 break-words text-[12.5px] font-medium">
            {template.name}
          </span>
          <MetaPill>{kindName}</MetaPill>
          <span className="text-muted-foreground tnum font-num text-[11px]">
            {template.dueDays === undefined ? 'Chưa đặt hạn' : `${template.dueDays} ngày`}
          </span>
          <Badge
            tone={template.active ? 'success' : 'draft'}
            className={template.active ? undefined : BADGE_INK}
          >
            {template.active ? 'Đang bật' : 'Đã tắt'}
          </Badge>
          {canPropose && (
            <div className="ml-auto flex flex-wrap items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Đưa “${template.name}” lên`}
                className="pointer-coarse:h-12 pointer-coarse:w-12 w-8 px-0"
                disabled={at === 0 || propose.isPending}
                onClick={() => move(at - 1)}
              >
                <Icon icon={ArrowUp} size={16} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Đưa “${template.name}” xuống`}
                className="pointer-coarse:h-12 pointer-coarse:w-12 w-8 px-0"
                disabled={at === ids.length - 1 || propose.isPending}
                onClick={() => move(at + 1)}
              >
                <Icon icon={ArrowDown} size={16} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="pointer-coarse:h-12"
                onClick={() => setEditing(true)}
              >
                <Icon icon={Pencil} size={16} />
                Sửa
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="pointer-coarse:h-12"
                disabled={propose.isPending}
                onClick={() =>
                  propose.mutate(
                    { door: 'patch', id: template.id, body: { active: !template.active } },
                    sent,
                  )
                }
              >
                {template.active ? 'Tắt' : 'Bật'}
              </Button>
            </div>
          )}
        </div>
      )}
      {propose.error && (
        <p role="alert" className="text-warning m-0 text-[11.5px]">
          {userMessage(propose.error)}
        </p>
      )}
    </div>
  )
}

/** Mounted when edit opens, so its boxes seed from the stored row every time. Sends
 *  only what differs; an emptied due goes as `null`, the door's "clear". */
function TemplateEdit({
  template,
  kinds,
  busy,
  onSend,
  onCancel,
}: {
  template: StepTemplate
  kinds: ConfigEntry[]
  busy: boolean
  onSend: (patch: StepTemplatePatch) => void
  onCancel: () => void
}) {
  const stored = template.dueDays === undefined ? '' : String(template.dueDays)
  const [name, setName] = useState(template.name)
  const [kindId, setKindId] = useState(template.kindId)
  const [days, setDays] = useState(stored)

  const patch: StepTemplatePatch = {
    ...(name.trim() !== template.name && { name: name.trim() }),
    ...(kindId !== template.kindId && { kindId }),
    ...(days.trim() !== stored && { dueDays: days.trim() === '' ? null : Number(days) }),
  }
  const ready = name.trim() !== '' && daysOk(days) && Object.keys(patch).length > 0 && !busy

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <Input
        value={name}
        aria-label={`Tên mới cho ${template.name}`}
        className="pointer-coarse:h-12 min-w-0 flex-1 basis-48"
        onChange={(e) => setName(e.target.value)}
      />
      <Select
        label="Loại bước"
        hideLabel
        className={SELECT_TOUCH}
        value={kindId}
        neutralValue={kindId}
        options={kindOptions(kinds, template.kindId)}
        onChange={setKindId}
      />
      <Input
        value={days}
        aria-label={`Hạn mặc định của ${template.name}, tính bằng ngày`}
        placeholder="số ngày"
        inputMode="numeric"
        invalid={!daysOk(days)}
        className={DAYS_BOX}
        onChange={(e) => setDays(e.target.value)}
      />
      <Button
        size="sm"
        className="pointer-coarse:h-12"
        disabled={!ready}
        onClick={() => onSend(patch)}
      >
        Gửi đề nghị
      </Button>
      <Button size="sm" variant="ghost" className="pointer-coarse:h-12" onClick={onCancel}>
        Huỷ
      </Button>
    </div>
  )
}

/** A new template lands last in its state, switched on — the server makes
 *  `ord` and `active`. Hidden from a reader who could not send it. */
export function AddTemplate({ address, kinds }: { address: StateAddress; kinds: ConfigEntry[] }) {
  const canPropose = useCan('config.propose')
  const propose = useProposeFrame()
  const [name, setName] = useState('')
  const [kindId, setKindId] = useState(NO_KIND)
  const [days, setDays] = useState('')
  if (!canPropose) return null

  const ready = name.trim() !== '' && kindId !== NO_KIND && daysOk(days) && !propose.isPending

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <Input
        value={name}
        aria-label="Tên bước mới"
        placeholder="Thêm bước tiếp theo"
        className="pointer-coarse:h-12 min-w-0 flex-1 basis-48"
        onChange={(e) => setName(e.target.value)}
      />
      <Select
        label="Loại bước"
        hideLabel
        className={SELECT_TOUCH}
        value={kindId}
        neutralValue={NO_KIND}
        options={[{ value: NO_KIND, label: 'Chọn loại bước' }, ...kindOptions(kinds)]}
        onChange={setKindId}
      />
      <Input
        value={days}
        aria-label="Hạn mặc định của bước mới, tính bằng ngày"
        placeholder="số ngày"
        inputMode="numeric"
        invalid={!daysOk(days)}
        className={DAYS_BOX}
        onChange={(e) => setDays(e.target.value)}
      />
      <Button
        size="md"
        className="pointer-coarse:h-12"
        disabled={!ready}
        onClick={() =>
          propose.mutate(
            {
              door: 'create',
              body: {
                address,
                name: name.trim(),
                kindId,
                ...(days.trim() !== '' && { dueDays: Number(days) }),
              },
            },
            {
              onSuccess: () => {
                setName('')
                setKindId(NO_KIND)
                setDays('')
                toastDone(FRAME_SENT)
              },
            },
          )
        }
      >
        <Icon icon={Plus} size={16} />
        Gửi đề nghị
      </Button>
      {propose.error && (
        <p role="alert" className="text-warning m-0 w-full text-[11.5px]">
          {userMessage(propose.error)}
        </p>
      )}
    </div>
  )
}
