import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, GlassCard, Icon, Input, Pencil, Plus } from '@pv/ui'
import type { ConfigEntry, ConfigList } from '@pv/contracts'
import { userMessage } from '@/app/api'
import { useCan } from '@/app/auth'
import { toastDone } from '@/app/toast'
import { BADGE_INK } from '@/data/opportunities'
import {
  salesCatalogQuery,
  useMyConfigProposals,
  useProposeCommEntry,
  useProposeConfigPatch,
} from '@/data/sales-config'
import { byOrd, entryWaiting } from './sales-config-model'
import { SENT, WaitingAdds, WaitingNote } from './sales-config-section'

/** Config sections for the comm confirm form (ADR 0074): evaluation questions
 *  with their answers, and the flat name lists — next-step kinds and contract
 *  kinds. Mounted from `sales-config-lead.tsx` and `sales-config-deal.tsx`.
 *  `EntryRow` is also the config screen's generic catalog row.
 *
 *  Same rules as every list on the config screen: no hard delete (a row with
 *  answers on it can only be switched off), every add, rename or switch goes
 *  to the approval inbox, and the screen keeps showing the stored row until it
 *  is approved. A done comm keeps the words it was confirmed with, so a rename
 *  here never rewrites history. */

export function CommCriteriaConfig() {
  const { data: catalog } = useQuery(salesCatalogQuery)
  const criteria = [...(catalog?.COMM_CRITERION ?? [])].sort(byOrd)
  const answers = catalog?.COMM_ANSWER ?? []

  return (
    <div className="flex flex-col gap-4">
      {criteria.map((c) => (
        /* Law 8 · a list sits on glass-b. */
        <GlassCard key={c.id} variant="b" className="flex flex-col gap-3 p-4">
          <EntryRow
            entry={c}
            list="COMM_CRITERION"
            usage={catalog?.usage.COMM_CRITERION[c.id] ?? 0}
            unit="lượt trả lời"
          />
          <ul className="flex flex-col gap-2 pl-4">
            {answers
              .filter((a) => a.criterionId === c.id)
              .sort(byOrd)
              .map((a) => (
                <li key={a.id}>
                  <EntryRow
                    entry={a}
                    list="COMM_ANSWER"
                    usage={catalog?.usage.COMM_ANSWER[a.id] ?? 0}
                    unit="lượt chọn"
                  />
                </li>
              ))}
          </ul>
          <AddEntry list="COMM_ANSWER" criterionId={c.id} placeholder="Thêm câu trả lời" />
        </GlassCard>
      ))}

      <AddEntry list="COMM_CRITERION" placeholder="Thêm câu hỏi đánh giá" />
    </div>
  )
}

/** A flat catalog: one row per entry, then the add box. Serves every list
 *  that is only a name list (no stage, no parent). */
export function FlatListConfig({
  list,
  unit,
  addLabel,
}: {
  list: 'STEP_KIND' | 'CONTRACT_KIND'
  unit: string
  addLabel: string
}) {
  const { data: catalog } = useQuery(salesCatalogQuery)
  const kinds = [...(catalog?.[list] ?? [])].sort(byOrd)

  return (
    <div className="flex flex-col gap-4">
      {kinds.length === 0 ? (
        <p className="text-muted-foreground text-[11.5px]">Chưa có loại nào.</p>
      ) : (
        <GlassCard variant="b" className="p-4">
          <ul className="flex flex-col gap-2">
            {kinds.map((k) => (
              <li key={k.id}>
                <EntryRow
                  entry={k}
                  list={list}
                  usage={catalog?.usage[list][k.id] ?? 0}
                  unit={unit}
                />
              </li>
            ))}
          </ul>
        </GlassCard>
      )}
      <AddEntry list={list} placeholder={addLabel} />
    </div>
  )
}

/** One entry: code, name, state, how many rows lean on it, rename and switch. */
export function EntryRow({
  entry,
  list,
  usage,
  unit,
  extra,
}: {
  entry: ConfigEntry
  list: ConfigList
  usage: number
  unit: string
  /** One more fact about the row, drawn before the state badge. */
  extra?: ReactNode
}) {
  const canPropose = useCan('config.propose')
  const waiting = entryWaiting(useMyConfigProposals(), list, entry.id)
  const patch = useProposeConfigPatch()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(entry.name)
  const send = (body: { name: string } | { active: boolean }) =>
    patch.mutate(
      { list, id: entry.id, patch: body },
      {
        onSuccess: () => {
          setEditing(false)
          toastDone(SENT)
        },
      },
    )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="text-muted-foreground font-mono text-[11px]">{entry.id}</span>
        {editing ? (
          <Input
            value={name}
            aria-label={`Tên mới cho ${entry.name}`}
            className="pointer-coarse:h-12 min-w-40 flex-1"
            onChange={(e) => setName(e.target.value)}
          />
        ) : (
          <span className="min-w-40 flex-1 break-words text-[12.5px] font-medium">
            {entry.name}
          </span>
        )}
        {extra}
        <Badge
          tone={entry.active ? 'success' : 'draft'}
          className={entry.active ? undefined : BADGE_INK}
        >
          {entry.active ? 'Đang bật' : 'Đã tắt'}
        </Badge>
        <span className="text-muted-foreground tnum font-num text-[11px]">
          {usage} {unit}
        </span>
        {canPropose &&
          (editing ? (
            <>
              <Button
                size="sm"
                className="pointer-coarse:h-12"
                disabled={name.trim() === '' || name.trim() === entry.name || patch.isPending}
                onClick={() => send({ name: name.trim() })}
              >
                Gửi đề nghị
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="pointer-coarse:h-12"
                onClick={() => {
                  setEditing(false)
                  setName(entry.name)
                }}
              >
                Huỷ
              </Button>
            </>
          ) : (
            <>
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
                disabled={patch.isPending}
                onClick={() => send({ active: !entry.active })}
              >
                {entry.active ? 'Tắt' : 'Bật'}
              </Button>
            </>
          ))}
      </div>
      <WaitingNote words={waiting} />
      {patch.error && (
        <p role="alert" className="text-destructive-foreground m-0 text-[11.5px]">
          {userMessage(patch.error)}
        </p>
      )}
    </div>
  )
}

/** Add one row to any catalog; hidden from a reader without `config.propose`. */
export function AddEntry({
  list,
  criterionId,
  placeholder,
}: {
  list: ConfigList
  criterionId?: string
  placeholder: string
}) {
  const canPropose = useCan('config.propose')
  const propose = useProposeCommEntry()
  const [name, setName] = useState('')
  if (!canPropose) return null

  return (
    <div className="flex flex-wrap items-end gap-3">
      <WaitingAdds list={list} {...(criterionId ? { criterionId } : {})} />
      <Input
        aria-label={placeholder}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        className="pointer-coarse:h-12 min-w-0 flex-1"
      />
      <Button
        size="md"
        className="pointer-coarse:h-12"
        disabled={name.trim() === '' || propose.isPending}
        onClick={() =>
          propose.mutate(
            { list, name: name.trim(), ...(criterionId ? { criterionId } : {}) },
            {
              onSuccess: () => {
                setName('')
                toastDone(SENT)
              },
            },
          )
        }
      >
        <Icon icon={Plus} size={16} />
        Gửi đề nghị
      </Button>
      {propose.error && (
        <p role="alert" className="text-destructive-foreground m-0 w-full text-[11.5px]">
          {userMessage(propose.error)}
        </p>
      )}
    </div>
  )
}
