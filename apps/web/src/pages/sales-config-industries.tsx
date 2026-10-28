import { useState, type ReactNode } from 'react'
import { Badge, Button, GlassCard, Icon, Input, Pencil, Select, cn, metaPillVariants } from '@pv/ui'
import { LEAD_NUM, type ConfigBundle, type ConfigEntry, type ConfigEntryPatch } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { toastDone } from '@/app/toast'
import { useSalesPeople } from '@/data/directory'
import { useProposeConfigCreate } from '@/data/industries'
import { BADGE_INK } from '@/data/opportunities'
import { useMyConfigProposals, useProposeConfigPatch } from '@/data/sales-config'
import { AddIndustry, IndustryActions } from './sales-config-industry-actions'
import { addsWaiting, byOrd, entryWaiting, industryAddsWaiting } from './sales-config-model'
import { EntryCount, SENT, Section, WaitingNote } from './sales-config-section'

/** 5.20 · categories and their industries (approved canvas, artboard 1). One
 *  card per category: its Sale, its lead count, its
 *  industries as pills with their counts. Industries with no category — the
 *  old free-text tags — wait in their own card until someone moves, renames or
 *  merges them. Every change is a proposal; the stored row shows until approved. */

const NOTE = 'text-muted-foreground m-0 text-[11.5px]'

export function IndustriesSection({ catalog }: { catalog: ConfigBundle | undefined }) {
  const categories = [...(catalog?.CATEGORY ?? [])].sort(byOrd)
  const industries = [...(catalog?.INDUSTRY ?? [])].sort(byOrd)
  const loose = industries.filter((i) => (i.parentId ?? null) === null)
  const [open, setOpen] = useState<string | null>(null)
  const looseAdds = industryAddsWaiting(useMyConfigProposals(), null)
  const nameOf = (id: string | null | undefined) =>
    categories.find((c) => c.id === id)?.name ?? 'Chưa xếp nhóm'
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
      hint={`Lead chọn một nhóm ngành và tối đa ${LEAD_NUM.industriesMax} ngành trong nhóm đó. AI chỉ chọn trong danh sách này.`}
      summary={<EntryCount rows={categories} noun="nhóm" />}
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
          aria-label="Chưa xếp nhóm"
          className="flex flex-col gap-3 p-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-semibold">Chưa xếp nhóm</span>
            <Badge tone="warning">Cần dọn</Badge>
            <span className="text-muted-foreground tnum font-num text-[11.5px]">
              {loose.length} ngành
            </span>
          </div>
          {pills(loose, true)}
          {looseAdds.map((s, at) => (
            <WaitingNote key={`${at}/${s}`} words={s} />
          ))}
          <p className={NOTE}>
            Bấm một ngành để chuyển vào nhóm, đổi tên, hoặc gộp vào ngành khác.
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
  const canPropose = useCan('config.propose')
  const opened = rows.find((r) => r.id === open)
  if (rows.length === 0) return <p className={NOTE}>Chưa có ngành nào.</p>
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
              {!r.active && <span>· đã tắt</span>}
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
  const canPropose = useCan('config.propose')
  const sales = useSalesPeople()
  const waiting = entryWaiting(useMyConfigProposals(), 'CATEGORY', c.id)
  const patch = useProposeConfigPatch()
  const [draft, setDraft] = useState<{ name: string; ownerId: string } | null>(null)
  const owner = sales.find((a) => a.id === c.ownerId)?.name ?? 'chưa có'
  const send = (body: ConfigEntryPatch) =>
    patch.mutate(
      { list: 'CATEGORY', id: c.id, patch: body },
      { onSuccess: () => (setDraft(null), toastDone(SENT)) },
    )

  if (draft !== null) {
    const body: ConfigEntryPatch = {
      ...(draft.name.trim() !== c.name ? { name: draft.name.trim() } : {}),
      ...(draft.ownerId !== (c.ownerId ?? '') ? { ownerId: draft.ownerId || null } : {}),
    }
    return (
      <div className="flex flex-wrap items-end gap-3">
        <Input
          aria-label={`Tên mới cho ${c.name}`}
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
          Gửi đề nghị
        </Button>
        <Button
          size="md"
          variant="ghost"
          className="pointer-coarse:h-12"
          onClick={() => setDraft(null)}
        >
          Huỷ
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
            Đã tắt
          </Badge>
        )}
        <span className="text-muted-foreground tnum font-num text-[11.5px]">
          {usage} lead · Sale phụ trách: {owner}
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
              Sửa
            </Button>
            {!(c.active && inUse) && (
              <Button
                size="sm"
                variant="ghost"
                className="pointer-coarse:h-12"
                disabled={patch.isPending}
                onClick={() => send({ active: !c.active })}
              >
                {c.active ? 'Tắt' : 'Bật'}
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
  const sales = useSalesPeople()
  return (
    <Select
      label="Sale phụ trách"
      size="lg"
      value={value}
      onChange={onChange}
      options={[
        { value: '', label: 'Chưa có Sale phụ trách' },
        ...sales.map((a) => ({ value: a.id, label: a.name })),
      ]}
    />
  )
}

/** Add a category: its name and, optionally, its Sale. */
function AddCategory() {
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
          Thêm nhóm ngành
        </Button>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <Input
            aria-label="Tên nhóm ngành mới"
            placeholder="Tên nhóm ngành"
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
                { onSuccess: () => (setDraft(null), toastDone(SENT)) },
              )
            }
          >
            Gửi đề nghị
          </Button>
          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12"
            onClick={() => setDraft(null)}
          >
            Huỷ
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
