import { useState, type ReactNode } from 'react'
import { Badge, Button, GlassCard, Icon, Input, Pencil, Select, cn, metaPillVariants } from '@pv/ui'
import { LEAD_NUM, type ConfigBundle, type ConfigEntry, type ConfigEntryPatch } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { message, useI18n } from '@/app/i18n'
import { toastDone } from '@/app/toast'
import { useSalesPeople } from '@/data/directory'
import { useProposeConfigCreate } from '@/data/industries'
import { BADGE_INK } from '@/data/opportunities'
import { useMyConfigProposals, useProposeConfigPatch } from '@/data/sales-config'
import { AddIndustry, IndustryActions } from './sales-config-industry-actions'
import { addsWaiting, byOrd, entryWaiting, industryAddsWaiting } from './sales-config-model'
import { EntryCount, Section, WaitingNote } from './sales-config-section'
import { sentCopy } from './sales-config-copy'

/** 5.20 · categories and their industries (approved canvas, artboard 1). One
 *  card per category: its Sale, its lead count, its
 *  industries as pills with their counts. Industries with no category — the
 *  old free-text tags — wait in their own card until someone moves, renames or
 *  merges them. Every change is a proposal; the stored row shows until approved. */

const NOTE = 'text-muted-foreground m-0 text-[11.5px]'

const UNGROUPED = message('Chưa xếp nhóm', 'Ungrouped', '그룹 미지정')

export function IndustriesSection({ catalog }: { catalog: ConfigBundle | undefined }) {
  const { t, number } = useI18n()
  const categories = [...(catalog?.CATEGORY ?? [])].sort(byOrd)
  const industries = [...(catalog?.INDUSTRY ?? [])].sort(byOrd)
  const loose = industries.filter((i) => (i.parentId ?? null) === null)
  const [open, setOpen] = useState<string | null>(null)
  const looseAdds = industryAddsWaiting(useMyConfigProposals(), null)
  const nameOf = (id: string | null | undefined) =>
    categories.find((c) => c.id === id)?.name ?? t(UNGROUPED)
  /* A grouped industry folds only into its own category; an ungrouped one into any. */
  const targets = (row: ConfigEntry) =>
    industries
      .filter((i) => i.active && i.id !== row.id && (!row.parentId || i.parentId === row.parentId))
      .map((i) => ({ id: i.id, label: `${i.name} · ${nameOf(i.parentId)}` }))

  const pills = (rows: ConfigEntry[], loose: boolean) => (
    <IndustryPills
      rows={rows}
      usage={catalog?.usage.INDUSTRY ?? {}}
      open={open}
      onOpen={setOpen}
      loose={loose}
      actions={(row) => (
        <IndustryActions
          key={row.id}
          industry={row}
          usage={catalog?.usage.INDUSTRY[row.id] ?? 0}
          categories={categories.filter((c) => c.active)}
          others={targets(row)}
          onClose={() => setOpen(null)}
        />
      )}
    />
  )

  return (
    <Section
      at="industries"
      hint={t(
        message(
          `Lead chọn một nhóm ngành và tối đa ${LEAD_NUM.industriesMax} ngành trong nhóm đó. AI chỉ chọn trong danh sách này.`,
          `A lead picks one industry group and up to ${LEAD_NUM.industriesMax} industries in it. AI only picks from this list.`,
          `리드는 산업 분야 1개와 그 안에서 최대 ${LEAD_NUM.industriesMax}개의 업종을 선택합니다. AI도 이 목록에서만 선택합니다.`,
        ),
      )}
      summary={<EntryCount rows={categories} noun="nhóm" />} // i18n-ignore
    >
      <AddCategory />
      {categories.map((c) => (
        <GlassCard
          key={c.id}
          variant="b"
          role="group"
          aria-label={c.name}
          className="flex flex-col gap-3 p-4"
        >
          <CategoryHead
            category={c}
            usage={catalog?.usage.CATEGORY[c.id] ?? 0}
            inUse={industries.some((i) => i.active && i.parentId === c.id)}
          />
          {pills(
            industries.filter((i) => i.parentId === c.id),
            false,
          )}
          {c.active && <AddIndustry parentId={c.id} group={c.name} />}
        </GlassCard>
      ))}
      {loose.length > 0 && (
        <GlassCard
          variant="b"
          role="group"
          aria-label={t(UNGROUPED)}
          className="flex flex-col gap-3 p-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-semibold">{t(UNGROUPED)}</span>
            <Badge tone="warning">{t(message('Cần dọn', 'Needs sorting', '정리 필요'))}</Badge>
            <span className="text-muted-foreground tnum font-num text-[11.5px]">
              {t(
                message(
                  `${number(loose.length)} ngành`,
                  `${number(loose.length)} ${loose.length === 1 ? 'industry' : 'industries'}`,
                  `업종 ${number(loose.length)}개`,
                ),
              )}
            </span>
          </div>
          {pills(loose, true)}
          {looseAdds.map((s, at) => (
            <WaitingNote key={`${at}/${s}`} words={s} />
          ))}
          <p className={NOTE}>
            {t(
              message(
                'Bấm một ngành để chuyển vào nhóm, đổi tên, hoặc gộp vào ngành khác.',
                'Press an industry to move it into a group, rename it, or merge it into another.',
                '업종을 누르면 그룹 이동, 이름 변경, 다른 업종과 병합을 할 수 있습니다.',
              ),
            )}
          </p>
        </GlassCard>
      )}
    </Section>
  )
}

/** Pills with their lead counts; a press opens the industry's actions below. */
function IndustryPills({
  rows,
  usage,
  open,
  onOpen,
  loose,
  actions,
}: {
  rows: ConfigEntry[]
  usage: Record<string, number>
  open: string | null
  onOpen: (id: string | null) => void
  loose: boolean
  actions: (row: ConfigEntry) => ReactNode
}) {
  const { t } = useI18n()
  const canPropose = useCan('config.propose')
  const opened = rows.find((r) => r.id === open)
  if (rows.length === 0)
    return (
      <p className={NOTE}>
        {t(message('Chưa có ngành nào.', 'No industries yet.', '등록된 업종이 없습니다.'))}
      </p>
    )
  return (
    <>
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {rows.map((r) => {
          /* Grouped and active: the canvas's neutral pill, count in the muted ink. */
          const look = !r.active
            ? metaPillVariants({ tone: 'muted' })
            : loose
              ? metaPillVariants({ tone: 'warning' })
              : cn(metaPillVariants(), 'bg-secondary text-secondary-foreground')
          const body = (
            <>
              <span>{r.name}</span>
              <b
                className={cn(
                  'tnum font-num font-semibold',
                  r.active && !loose && 'text-muted-foreground',
                )}
              >
                {usage[r.id] ?? 0}
              </b>
              {!r.active && <span>· {t(message('đã tắt', 'off', '꺼짐'))}</span>}
            </>
          )
          return (
            <li key={r.id}>
              {canPropose ? (
                <button
                  type="button"
                  aria-expanded={open === r.id}
                  onClick={() => onOpen(open === r.id ? null : r.id)}
                  className={cn(
                    look,
                    'motion-std pointer-coarse:min-h-12 focus-visible:outline-ring text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2',
                    open === r.id && 'shadow-[0_0_0_2px_var(--ring)]',
                  )}
                >
                  {body}
                </button>
              ) : (
                <span className={cn(look, 'text-[13px]')}>{body}</span>
              )}
            </li>
          )
        })}
      </ul>
      {opened && actions(opened)}
    </>
  )
}

/** Name, lead count and Sale of one category, with rename, Sale change and switch. */
function CategoryHead({
  category: c,
  usage,
  inUse,
}: {
  category: ConfigEntry
  usage: number
  /** Active industries still in it: switching it off is refused, so the button is hidden. */
  inUse: boolean
}) {
  const { t, number } = useI18n()
  const canPropose = useCan('config.propose')
  const sales = useSalesPeople()
  const waiting = entryWaiting(useMyConfigProposals(), 'CATEGORY', c.id)
  const patch = useProposeConfigPatch()
  const [draft, setDraft] = useState<{ name: string; ownerId: string } | null>(null)
  const owner = sales.find((a) => a.id === c.ownerId)?.name ?? t(message('chưa có', 'none', '없음'))
  const send = (body: ConfigEntryPatch) =>
    patch.mutate(
      { list: 'CATEGORY', id: c.id, patch: body },
      { onSuccess: () => (setDraft(null), toastDone(sentCopy())) },
    )

  if (draft !== null) {
    const body: ConfigEntryPatch = {
      ...(draft.name.trim() !== c.name ? { name: draft.name.trim() } : {}),
      ...(draft.ownerId !== (c.ownerId ?? '') ? { ownerId: draft.ownerId || null } : {}),
    }
    return (
      <div className="flex flex-wrap items-end gap-3">
        <Input
          aria-label={t(
            message(`Tên mới cho ${c.name}`, `New name for ${c.name}`, `${c.name} 새 이름`),
          )}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          className="pointer-coarse:h-12 min-w-40 flex-1"
        />
        <OwnerSelect
          value={draft.ownerId}
          onChange={(ownerId) => setDraft({ ...draft, ownerId })}
        />
        <Button
          size="md"
          className="pointer-coarse:h-12"
          disabled={patch.isPending || draft.name.trim() === '' || Object.keys(body).length === 0}
          onClick={() => send(body)}
        >
          {t(message('Gửi đề nghị', 'Submit proposal', '변경 제안'))}
        </Button>
        <Button
          size="md"
          variant="ghost"
          className="pointer-coarse:h-12"
          onClick={() => setDraft(null)}
        >
          {t(message('Huỷ', 'Cancel', '취소'))}
        </Button>
        {patch.error && (
          <p role="alert" className="text-destructive-foreground m-0 w-full text-[11.5px]">
            {userMessage(patch.error)}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1 break-words text-[13px] font-semibold">{c.name}</span>
        {!c.active && (
          <Badge tone="draft" className={BADGE_INK}>
            {t(message('Đã tắt', 'Off', '꺼짐'))}
          </Badge>
        )}
        <span className="text-muted-foreground tnum font-num text-[11.5px]">
          {t(
            message(
              `${number(usage)} lead · Sale phụ trách: ${owner}`,
              `${number(usage)} ${usage === 1 ? 'lead' : 'leads'} · Salesperson in charge: ${owner}`,
              `리드 ${number(usage)}건 · 담당 영업: ${owner}`,
            ),
          )}
        </span>
        {canPropose && (
          <>
            <Button
              size="sm"
              variant="ghost"
              className="pointer-coarse:h-12"
              onClick={() => setDraft({ name: c.name, ownerId: c.ownerId ?? '' })}
            >
              <Icon icon={Pencil} size={16} />
              {t(message('Sửa', 'Edit', '수정'))}
            </Button>
            {!(c.active && inUse) && (
              <Button
                size="sm"
                variant="ghost"
                className="pointer-coarse:h-12"
                disabled={patch.isPending}
                onClick={() => send({ active: !c.active })}
              >
                {c.active
                  ? t(message('Tắt', 'Turn off', '끄기'))
                  : t(message('Bật', 'Turn on', '켜기'))}
              </Button>
            )}
          </>
        )}
      </div>
      <WaitingNote words={waiting} />
    </div>
  )
}

function OwnerSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t } = useI18n()
  const sales = useSalesPeople()
  return (
    <Select
      label={t(message('Sale phụ trách', 'Salesperson in charge', '담당 영업'))}
      size="lg"
      value={value}
      onChange={onChange}
      options={[
        {
          value: '',
          label: t(message('Chưa có Sale phụ trách', 'No salesperson in charge', '담당 영업 없음')),
        },
        ...sales.map((a) => ({ value: a.id, label: a.name })),
      ]}
    />
  )
}

/** Add a category: its name and, optionally, its Sale. */
function AddCategory() {
  const { t } = useI18n()
  const canPropose = useCan('config.propose')
  const propose = useProposeConfigCreate()
  const adds = addsWaiting(useMyConfigProposals(), 'CATEGORY')
  const [draft, setDraft] = useState<{ name: string; ownerId: string } | null>(null)
  if (!canPropose) return null

  return (
    <div className="flex flex-col gap-2">
      {draft === null ? (
        <Button
          size="md"
          className="pointer-coarse:h-12 self-start"
          onClick={() => setDraft({ name: '', ownerId: '' })}
        >
          {t(message('Thêm nhóm ngành', 'Add industry group', '산업 분야 추가'))}
        </Button>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <Input
            aria-label={t(
              message('Tên nhóm ngành mới', 'New industry group name', '새 산업 분야 이름'),
            )}
            placeholder={t(message('Tên nhóm ngành', 'Industry group name', '산업 분야 이름'))}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="pointer-coarse:h-12 min-w-40 flex-1"
          />
          <OwnerSelect
            value={draft.ownerId}
            onChange={(ownerId) => setDraft({ ...draft, ownerId })}
          />
          <Button
            size="md"
            className="pointer-coarse:h-12"
            disabled={draft.name.trim() === '' || propose.isPending}
            onClick={() =>
              propose.mutate(
                {
                  list: 'CATEGORY',
                  body: {
                    name: draft.name.trim(),
                    ...(draft.ownerId ? { ownerId: draft.ownerId } : {}),
                  },
                },
                { onSuccess: () => (setDraft(null), toastDone(sentCopy())) },
              )
            }
          >
            {t(message('Gửi đề nghị', 'Submit proposal', '변경 제안'))}
          </Button>
          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12"
            onClick={() => setDraft(null)}
          >
            {t(message('Huỷ', 'Cancel', '취소'))}
          </Button>
        </div>
      )}
      {adds.map((s, at) => (
        <WaitingNote key={`${at}/${s}`} words={s} />
      ))}
      {propose.error && (
        <p role="alert" className="text-destructive-foreground m-0 text-[11.5px]">
          {userMessage(propose.error)}
        </p>
      )}
    </div>
  )
}
