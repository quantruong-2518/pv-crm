import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Badge,
  Button,
  Checkbox,
  Chip,
  Eye,
  EyeOff,
  Icon,
  Input,
  Kicker,
  Modal,
  SectionTitle,
} from '@pv/ui'
import {
  LEAD_SIDE_LABEL,
  LeadMotion,
  LeadSide,
  MOTION_SIDE,
  ORIGIN_NAME_MAX,
  type LeadOrigin,
  type LeadOriginPatch,
} from '@pv/contracts'
import { isApiError, userMessage, type ApiError } from '@/app/api'
import { toastDone, toastFail } from '@/app/toast'
import {
  leadOriginsQuery,
  useCreateLeadOrigin,
  useMergeLeadOrigin,
  usePatchLeadOrigin,
} from '@/data/lead-origins'
import { useMotionLabel } from '@/data/sales-motions'
import { OriginPicker, type OriginChoice } from '@/components/lead-origin-pickers'

/** Cells and modals of the origin catalog (`pages/lead-origins.tsx`).
 *
 *  One edit modal per origin rather than a menu of four row actions: rename,
 *  re-file, hide and merge all act on the same row and a manager usually does
 *  two of them at once. Every write answers with the catalog re-read — nothing
 *  is painted ahead of the server. */

export function OriginNameCell({ origin }: { origin: LeadOrigin }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-[12.5px] font-semibold">{origin.name}</span>
      <span className="text-muted-foreground truncate font-mono text-[11px]">{origin.key}</span>
    </span>
  )
}

export function MotionChips({ motions }: { motions: readonly LeadMotion[] }) {
  const motionLabel = useMotionLabel()
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {motions.map((m) => (
        <Chip key={m}>{motionLabel(m)}</Chip>
      ))}
    </span>
  )
}

/** Law 16 — a text pill naming the exact state. */
export function OriginStatus({ origin, intoName }: { origin: LeadOrigin; intoName?: string }) {
  if (origin.mergedInto)
    return <Badge tone="draft">Đã gộp vào {intoName ?? origin.mergedInto}</Badge>
  return origin.active ? <Badge tone="success">Đang dùng</Badge> : <Badge tone="draft">Đã ẩn</Badge>
}

const failed = (error: ApiError | null) => (isApiError(error) ? userMessage(error) : undefined)

/** Six boxes in the two halves of `MOTION_SIDE`, the order every picker reads. */
function MotionChecks({
  value,
  onChange,
}: {
  value: readonly LeadMotion[]
  onChange: (next: LeadMotion[]) => void
}) {
  const motionLabel = useMotionLabel()
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {LeadSide.options.map((side) => (
        <div key={side} className="flex flex-col gap-2">
          <Kicker>{LEAD_SIDE_LABEL[side]}</Kicker>
          {LeadMotion.options
            .filter((m) => MOTION_SIDE[m] === side)
            .map((m) => (
              <Checkbox
                key={m}
                checked={value.includes(m)}
                label={motionLabel(m)}
                onChange={(on) => onChange(on ? [...value, m] : value.filter((x) => x !== m))}
              />
            ))}
        </div>
      ))}
    </div>
  )
}

const SEARCH_DELAY_MS = 250

/** The add-origin modal. A name whose key already exists comes back as the
 *  existing row (`created: false`), and the modal says so. Fresh state per
 *  opening comes from the caller changing `key`, not from a reset effect. */
export function AddOriginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('')
  const [motions, setMotions] = useState<LeadMotion[]>([])
  const [settled, setSettled] = useState('')
  const create = useCreateLeadOrigin()

  useEffect(() => {
    const timer = setTimeout(() => setSettled(name.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [name])

  const { data: hits } = useQuery({
    ...leadOriginsQuery({ q: settled, includeInactive: true }),
    enabled: open && settled !== '',
  })
  const exact = settled === '' ? undefined : hits?.exact

  const canSave = name.trim() !== '' && motions.length > 0 && !create.isPending
  const submit = () =>
    create.mutate(
      { name: name.trim(), motions },
      {
        onSuccess: ({ origin, created }) => {
          toastDone(
            created
              ? `Đã thêm nguồn “${origin.name}”`
              : `“${origin.name}” đã có sẵn — không thêm bản thứ hai`,
          )
          onClose()
        },
      },
    )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Thêm nguồn"
      subtitle="Nguồn là nơi lead đến từ — LinkedIn, Apollo, một đối tác. Chọn những phương án tiếp cận được dùng nguồn này."
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {failed(create.error) && (
            <span role="alert" className="text-destructive-foreground mr-auto text-[11.5px]">
              {failed(create.error)}
            </span>
          )}
          <Button size="lg" variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button size="lg" disabled={!canSave} onClick={submit}>
            Thêm nguồn
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">Tên nguồn</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={ORIGIN_NAME_MAX}
            autoFocus
          />
          {exact && (
            <span className="text-warning text-[11.5px]">
              Đã có nguồn “{exact.name}” — thêm sẽ dùng lại nguồn đó.
            </span>
          )}
        </label>
        <MotionChecks value={motions} onChange={setMotions} />
      </div>
    </Modal>
  )
}

/** Rename · re-file · hide/show · merge — `lead-origin.manage` only. `Modal`
 *  keeps the last body through its exit, so `null` simply closes it. */
export function EditOriginModal({
  origin,
  onClose,
}: {
  origin: LeadOrigin | null
  onClose: () => void
}) {
  return (
    <Modal
      open={origin !== null}
      onClose={onClose}
      title={origin?.name ?? ''}
      subtitle={origin ? `${origin.id} · ${origin.leadCount} lead` : undefined}
      footer={
        <div className="flex justify-end">
          <Button size="lg" variant="ghost" onClick={onClose}>
            Đóng
          </Button>
        </div>
      }
    >
      {origin && <EditOriginBody key={origin.id} origin={origin} onDone={onClose} />}
    </Modal>
  )
}

function EditOriginBody({ origin, onDone }: { origin: LeadOrigin; onDone: () => void }) {
  const [name, setName] = useState(origin.name)
  const [motions, setMotions] = useState<LeadMotion[]>(origin.motions)
  const [target, setTarget] = useState<OriginChoice | null>(null)
  const patch = usePatchLeadOrigin()
  const merge = useMergeLeadOrigin()

  const renamed = name.trim() !== '' && name.trim() !== origin.name
  const refiled =
    motions.length > 0 &&
    (motions.length !== origin.motions.length || motions.some((m) => !origin.motions.includes(m)))
  const send = (body: LeadOriginPatch, done: string) =>
    patch.mutate({ id: origin.id, body }, { onSuccess: () => toastDone(done) })
  const refusal = failed(patch.error) ?? failed(merge.error)

  return (
    <fieldset disabled={patch.isPending || merge.isPending} className="flex flex-col gap-6">
      {refusal && (
        <p role="alert" className="text-destructive-foreground text-[11.5px] leading-[1.5]">
          {refusal}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle size="sm">Đổi tên</SectionTitle>
        <div className="flex flex-wrap items-end gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={ORIGIN_NAME_MAX}
            aria-label="Tên nguồn"
            className="min-w-0 flex-1"
          />
          <Button
            size="lg"
            disabled={!renamed}
            onClick={() => send({ name: name.trim() }, 'Đã đổi tên nguồn')}
          >
            Lưu tên
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle size="sm" hint="Nguồn chỉ hiện ở ô chọn của những phương án được tích.">
          Phương án tiếp cận
        </SectionTitle>
        <MotionChecks value={motions} onChange={setMotions} />
        <div>
          <Button
            size="lg"
            disabled={!refiled}
            onClick={() => send({ motions }, 'Đã sửa phương án tiếp cận của nguồn')}
          >
            Lưu phương án
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle
          size="sm"
          hint="Ẩn thì nguồn thôi hiện ở ô chọn. Lead đang mang nguồn này giữ nguyên."
        >
          {origin.active ? 'Ẩn nguồn' : 'Hiện lại nguồn'}
        </SectionTitle>
        <div>
          <Button
            size="lg"
            variant="secondary"
            onClick={() =>
              send({ active: !origin.active }, origin.active ? 'Đã ẩn nguồn' : 'Đã hiện lại nguồn')
            }
          >
            <Icon icon={origin.active ? EyeOff : Eye} size={16} />
            {origin.active ? 'Ẩn nguồn' : 'Hiện lại'}
          </Button>
        </div>
      </section>

      <MergeSection
        origin={origin}
        target={target}
        onTarget={setTarget}
        merge={merge}
        onDone={onDone}
      />
    </fieldset>
  )
}

function MergeSection({
  origin,
  target,
  onTarget,
  merge,
  onDone,
}: {
  origin: LeadOrigin
  target: OriginChoice | null
  onTarget: (choice: OriginChoice | null) => void
  merge: ReturnType<typeof useMergeLeadOrigin>
  onDone: () => void
}) {
  const into = target?.id
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle
        size="sm"
        hint="Dùng khi hai tên cùng chỉ một nơi, ví dụ “Linkedin” và “LinkedIn Ads”."
      >
        Gộp vào nguồn khác
      </SectionTitle>
      <OriginPicker
        label="Gộp vào"
        value={target}
        onChange={onTarget}
        onClear={() => onTarget(null)}
        exclude={origin.id}
        allowCreate={false}
        placeholder="Chọn nguồn đang dùng"
      />
      {target && into && (
        <div className="flex flex-col gap-3">
          <p className="text-glass-foreground text-[11.5px] leading-[1.7]">
            {origin.leadCount} lead đang mang “{origin.name}” sẽ chuyển sang “{target.name}”. Tên “
            {origin.name}” thành tên gọi khác của “{target.name}”, và “{origin.name}” thôi hiện ở ô
            chọn.
          </p>
          <div>
            <Button
              size="lg"
              variant="destructive"
              onClick={() =>
                merge.mutate(
                  { id: origin.id, into },
                  {
                    onSuccess: ({ movedLeads, into: kept }) => {
                      toastDone(`Đã gộp vào “${kept.name}”`, `${movedLeads} lead đã chuyển nguồn`)
                      onDone()
                    },
                    onError: (error) => toastFail('Không gộp được', failed(error)),
                  },
                )
              }
            >
              Gộp vào “{target.name}”
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
