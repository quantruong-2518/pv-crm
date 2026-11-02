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
  Select,
} from '@pv/ui'
import {
  LeadMotion,
  LeadSide,
  MOTION_SIDE,
  ORIGIN_NAME_MAX,
  type LeadOrigin,
  type LeadOriginPatch,
} from '@pv/contracts'
import { isApiError, userMessage, type ApiError } from '@/app/api'
import { message, translate, useI18n } from '@/app/i18n'
import { toastDone, toastFail } from '@/app/toast'
import { leadSideText } from '@/data/lead-copy'
import {
  leadOriginsQuery,
  useCreateLeadOrigin,
  useMergeLeadOrigin,
  usePatchLeadOrigin,
} from '@/data/lead-origins'
import { useMotionLabel } from '@/data/sales-motions'
import { OriginPicker, type OriginChoice } from '@/components/lead-origin-pickers'
import { FilterMenu } from '@/components/table-bits'

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

const ANY_MOTION = 'all'

/** The filter popover of the catalog: one approach, or the hidden sources too. */
export function OriginFilterMenu({
  motion,
  onMotion,
  showHidden,
  onShowHidden,
}: {
  motion: LeadMotion | undefined
  onMotion: (next: LeadMotion | undefined) => void
  showHidden: boolean
  onShowHidden: (next: boolean) => void
}) {
  const { t } = useI18n()
  const motionLabel = useMotionLabel()
  return (
    <FilterMenu
      label={t(message('Bộ lọc nguồn lead', 'Lead source filters', '리드 유입 경로 필터'))}
      active={(motion ? 1 : 0) + (showHidden ? 1 : 0)}
    >
      <Select
        label={t(message('Phương án tiếp cận', 'Approach', '접근 방식'))}
        value={motion ?? ANY_MOTION}
        neutralValue={ANY_MOTION}
        onChange={(v) => onMotion(v === ANY_MOTION ? undefined : (v as LeadMotion))}
        className="w-full max-w-none"
        options={[
          {
            value: ANY_MOTION,
            label: t(message('Tất cả phương án', 'All approaches', '모든 접근 방식')),
          },
          ...LeadMotion.options.map((m) => ({ value: m, label: motionLabel(m) })),
        ]}
      />
      <Checkbox
        checked={showHidden}
        onChange={onShowHidden}
        label={t(message('Hiển thị nguồn đã ẩn', 'Show hidden sources', '숨긴 유입 경로 표시'))}
      />
    </FilterMenu>
  )
}

/** Law 16 — a text pill naming the exact state. */
export function OriginStatus({ origin, intoName }: { origin: LeadOrigin; intoName?: string }) {
  const { t } = useI18n()
  if (origin.mergedInto) {
    const into = intoName ?? origin.mergedInto
    return (
      <Badge tone="draft">
        {t(message(`Đã gộp vào ${into}`, `Merged into ${into}`, `${into}에 병합됨`))}
      </Badge>
    )
  }
  return origin.active ? (
    <Badge tone="success">{t(message('Đang dùng', 'In use', '사용 중'))}</Badge>
  ) : (
    <Badge tone="draft">{t(message('Đã ẩn', 'Hidden', '숨김'))}</Badge>
  )
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
  const { lang } = useI18n()
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {LeadSide.options.map((side) => (
        <div key={side} className="flex flex-col gap-2">
          <Kicker>{leadSideText(side, lang)}</Kicker>
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
  const { t } = useI18n()
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
          const done = created
            ? message(
                `Đã thêm nguồn “${origin.name}”`,
                `Added source “${origin.name}”`,
                `유입 경로 “${origin.name}”을(를) 추가했습니다`,
              )
            : message(
                `“${origin.name}” đã có sẵn`,
                `“${origin.name}” already exists`,
                `“${origin.name}”은(는) 이미 있습니다`,
              )
          toastDone(translate(done))
          onClose()
        },
      },
    )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(message('Thêm nguồn', 'Add source', '유입 경로 추가'))}
      subtitle={t(
        message(
          'Nguồn là nơi lead đến từ. Chọn phương án tiếp cận dùng nguồn này.',
          'The source is where a lead comes from. Choose the approaches that use it.',
          '유입 경로는 리드가 들어온 곳입니다. 이 경로를 사용하는 접근 방식을 선택하세요.',
        ),
      )}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {failed(create.error) && (
            <span role="alert" className="text-destructive-foreground mr-auto text-[11.5px]">
              {failed(create.error)}
            </span>
          )}
          <Button size="lg" variant="ghost" onClick={onClose}>
            {t(message('Huỷ', 'Cancel', '취소'))}
          </Button>
          <Button size="lg" disabled={!canSave} onClick={submit}>
            {t(message('Thêm nguồn', 'Add source', '유입 경로 추가'))}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <label className="flex flex-col gap-2">
          <span className="text-muted-foreground text-[11px]">
            {t(message('Tên nguồn', 'Source name', '유입 경로 이름'))}
          </span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={ORIGIN_NAME_MAX}
            autoFocus
          />
          {exact && (
            <span className="text-warning text-[11.5px]">
              {t(
                message(
                  `Đã có nguồn “${exact.name}”. Thêm sẽ dùng lại nguồn đó.`,
                  `Source “${exact.name}” already exists. Adding will reuse it.`,
                  `유입 경로 “${exact.name}”이(가) 이미 있습니다. 추가하면 기존 경로를 사용합니다.`,
                ),
              )}
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
  const { t } = useI18n()
  return (
    <Modal
      open={origin !== null}
      onClose={onClose}
      title={origin?.name ?? ''}
      subtitle={
        origin
          ? `${origin.id} · ${t(message(`${origin.leadCount} lead`, `${origin.leadCount} ${origin.leadCount === 1 ? 'lead' : 'leads'}`, `리드 ${origin.leadCount}개`))}`
          : undefined
      }
      footer={
        <div className="flex justify-end">
          <Button size="lg" variant="ghost" onClick={onClose}>
            {t(message('Đóng', 'Close', '닫기'))}
          </Button>
        </div>
      }
    >
      {origin && <EditOriginBody key={origin.id} origin={origin} onDone={onClose} />}
    </Modal>
  )
}

function EditOriginBody({ origin, onDone }: { origin: LeadOrigin; onDone: () => void }) {
  const { t } = useI18n()
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
        <SectionTitle size="sm">{t(message('Đổi tên', 'Rename', '이름 변경'))}</SectionTitle>
        <div className="flex flex-wrap items-end gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={ORIGIN_NAME_MAX}
            aria-label={t(message('Tên nguồn', 'Source name', '유입 경로 이름'))}
            className="min-w-0 flex-1"
          />
          <Button
            size="lg"
            disabled={!renamed}
            onClick={() =>
              send(
                { name: name.trim() },
                t(message('Đã đổi tên nguồn', 'Source renamed', '유입 경로 이름을 변경했습니다')),
              )
            }
          >
            {t(message('Lưu tên', 'Save name', '이름 저장'))}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle
          size="sm"
          hint={t(
            message(
              'Nguồn chỉ hiện ở ô chọn của những phương án được tích.',
              'The source only appears in the picker of the approaches you tick.',
              '선택한 접근 방식의 선택 상자에만 이 경로가 표시됩니다.',
            ),
          )}
        >
          {t(message('Phương án tiếp cận', 'Approach', '접근 방식'))}
        </SectionTitle>
        <MotionChecks value={motions} onChange={setMotions} />
        <div>
          <Button
            size="lg"
            disabled={!refiled}
            onClick={() =>
              send(
                { motions },
                t(
                  message(
                    'Đã sửa phương án tiếp cận của nguồn',
                    'Source approaches updated',
                    '유입 경로의 접근 방식을 수정했습니다',
                  ),
                ),
              )
            }
          >
            {t(message('Lưu phương án', 'Save approaches', '접근 방식 저장'))}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle
          size="sm"
          hint={t(
            message(
              'Ẩn thì không chọn được nguồn này nữa. Lead đang dùng nguồn này giữ nguyên.',
              'A hidden source can no longer be picked. Leads already using it stay as they are.',
              '숨기면 이 경로를 더 이상 선택할 수 없습니다. 이미 사용 중인 리드는 그대로 유지됩니다.',
            ),
          )}
        >
          {origin.active
            ? t(message('Ẩn nguồn', 'Hide source', '유입 경로 숨기기'))
            : t(message('Hiện lại nguồn', 'Show source again', '유입 경로 다시 표시'))}
        </SectionTitle>
        <div>
          <Button
            size="lg"
            variant="secondary"
            onClick={() =>
              send(
                { active: !origin.active },
                origin.active
                  ? t(message('Đã ẩn nguồn', 'Source hidden', '유입 경로를 숨겼습니다'))
                  : t(
                      message(
                        'Đã hiện lại nguồn',
                        'Source shown again',
                        '유입 경로를 다시 표시했습니다',
                      ),
                    ),
              )
            }
          >
            <Icon icon={origin.active ? EyeOff : Eye} size={16} />
            {origin.active
              ? t(message('Ẩn nguồn', 'Hide source', '유입 경로 숨기기'))
              : t(message('Hiện lại', 'Show again', '다시 표시'))}
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
  const { t } = useI18n()
  const into = target?.id
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle
        size="sm"
        hint={t(
          message(
            'Dùng khi hai tên cùng chỉ một nơi, ví dụ “Linkedin” và “LinkedIn Ads”.',
            'Use when two names mean the same place, such as “Linkedin” and “LinkedIn Ads”.',
            '두 이름이 같은 곳을 가리킬 때 사용합니다. 예: “Linkedin”과 “LinkedIn Ads”.',
          ),
        )}
      >
        {t(message('Gộp vào nguồn khác', 'Merge into another source', '다른 유입 경로에 병합'))}
      </SectionTitle>
      <OriginPicker
        label={t(message('Gộp vào', 'Merge into', '병합 대상'))}
        value={target}
        onChange={onTarget}
        onClear={() => onTarget(null)}
        exclude={origin.id}
        allowCreate={false}
        placeholder={t(
          message('Chọn nguồn đang dùng', 'Pick a source in use', '사용 중인 유입 경로 선택'),
        )}
      />
      {target && into && (
        <div className="flex flex-col gap-3">
          <p className="text-glass-foreground text-[11.5px] leading-[1.7]">
            {t(
              message(
                `${origin.leadCount} lead đang mang “${origin.name}” sẽ chuyển sang “${target.name}”. “${origin.name}” thành tên gọi khác của “${target.name}” và không còn để chọn.`,
                `${origin.leadCount} ${origin.leadCount === 1 ? 'lead' : 'leads'} with “${origin.name}” will move to “${target.name}”. “${origin.name}” becomes another name for “${target.name}” and can no longer be picked.`,
                `“${origin.name}” 리드 ${origin.leadCount}개가 “${target.name}”(으)로 이동합니다. “${origin.name}”은(는) “${target.name}”의 다른 이름이 되며 더 이상 선택할 수 없습니다.`,
              ),
            )}
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
                      toastDone(
                        t(
                          message(
                            `Đã gộp vào “${kept.name}”`,
                            `Merged into “${kept.name}”`,
                            `“${kept.name}”에 병합했습니다`,
                          ),
                        ),
                        t(
                          message(
                            `${movedLeads} lead đã chuyển nguồn`,
                            `${movedLeads} ${movedLeads === 1 ? 'lead' : 'leads'} moved to the new source`,
                            `리드 ${movedLeads}개의 유입 경로를 옮겼습니다`,
                          ),
                        ),
                      )
                      onDone()
                    },
                    onError: (error) =>
                      toastFail(
                        t(message('Không gộp được', 'Could not merge', '병합하지 못했습니다')),
                        failed(error),
                      ),
                  },
                )
              }
            >
              {t(
                message(
                  `Gộp vào “${target.name}”`,
                  `Merge into “${target.name}”`,
                  `“${target.name}”에 병합`,
                ),
              )}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
