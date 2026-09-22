import type { Dispatch, SetStateAction } from 'react'
import { Button, GlassCard, Icon, MetaPill, Plus, SectionTitle, Timeline, Trash2 } from '@pv/ui'
import { CAMPAIGN_START_MAX_WAVES } from '@pv/contracts'
import { dmhm } from '@/lib/date'
import { dropCommitted, effectiveWaves, emptyComposerState, type ComposerState } from './wave-draft'

/** THE CHAIN BESIDE THE LETTER BEING WRITTEN, in the two shapes its two doors
 *  can hold.
 *
 *  `WaveTimeline` is the campaign wave drawer, where the chain owns a column of
 *  its own and the spine is worth its width. `WaveStrip` is the MAS modal,
 *  where that column belongs to the preview — so the chain drops under the
 *  compose form as one line per wave. Same data, same actions, same wording;
 *  only the room differs. */
export type WaveChainProps = {
  state: ComposerState
  setState: Dispatch<SetStateAction<ComposerState>>
  /** Waves this subject has ALREADY been sent — what the markers count up from. */
  alreadyFired: number
  nextIndex: number
  showAdd: boolean
  canAdd: boolean
  draftValid: boolean
  onAdd: () => void
}

export function WaveTimeline({
  state,
  setState,
  alreadyFired,
  nextIndex,
  showAdd,
  canAdd,
  draftValid,
  onAdd,
}: WaveChainProps) {
  return (
    <>
      <ChainHeader
        state={state}
        nextIndex={nextIndex}
        showAdd={showAdd}
        canAdd={canAdd}
        onAdd={onAdd}
      />
      <Timeline
        items={[
          ...state.committed.map((wave, index) => ({
            id: wave.localId,
            state: 'next' as const,
            marker: `Đợt ${alreadyFired + index + 1}`,
            title: wave.label,
            meta: <MetaPill>{waveWhen(wave.scheduledAt)}</MetaPill>,
            children: <span className="line-clamp-1">{wave.subject}</span>,
            actions: <DropButton onClick={() => setState((s) => dropCommitted(s, wave.localId))} />,
          })),
          {
            id: 'live-draft',
            state: 'current' as const,
            marker: `Đợt ${nextIndex}`,
            title: state.label.trim() || (
              <span className="text-muted-foreground">(đang soạn…)</span>
            ),
            meta: <MetaPill>{draftLabel(draftValid)}</MetaPill>,
            children: state.subject.trim() ? (
              <span className="line-clamp-1">{state.subject}</span>
            ) : (
              <span className="text-muted-foreground">Chưa có tiêu đề</span>
            ),
            ...(draftTouched(state)
              ? { actions: <DropButton onClick={() => setState(clearDraft)} /> }
              : {}),
          },
        ]}
      />
    </>
  )
}

export function WaveStrip({
  state,
  setState,
  alreadyFired,
  nextIndex,
  showAdd,
  canAdd,
  draftValid,
  onAdd,
}: WaveChainProps) {
  return (
    <GlassCard variant="b" className="flex min-w-0 flex-col gap-3 p-4">
      <ChainHeader
        state={state}
        nextIndex={nextIndex}
        showAdd={showAdd}
        canAdd={canAdd}
        onAdd={onAdd}
      />
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {state.committed.map((wave, index) => (
          <Row
            key={wave.localId}
            marker={`Đợt ${alreadyFired + index + 1}`}
            title={wave.label || wave.subject}
            when={waveWhen(wave.scheduledAt)}
            onDrop={() => setState((s) => dropCommitted(s, wave.localId))}
          />
        ))}
        <Row
          marker={`Đợt ${nextIndex}`}
          title={state.label.trim() || state.subject.trim() || 'Đang soạn…'}
          when={draftLabel(draftValid)}
          {...(draftTouched(state) ? { onDrop: () => setState(clearDraft) } : {})}
        />
      </ul>
    </GlassCard>
  )
}

function Row({
  marker,
  title,
  when,
  onDrop,
}: {
  marker: string
  title: string
  when: string
  onDrop?: () => void
}) {
  return (
    <li className="bg-surface-ink/5 flex min-w-0 items-center gap-3 rounded-sm py-1 pl-3 pr-1">
      <span className="text-muted-foreground w-12 shrink-0 text-[11px]">{marker}</span>
      <span className="min-w-0 flex-1 truncate text-[12.5px]">{title}</span>
      <MetaPill>{when}</MetaPill>
      {onDrop && <DropButton onClick={onDrop} />}
    </li>
  )
}

/** Two panels, two honest titles: without the add button there is no chain and
 *  no ceiling, so printing `1/20` would invent both. */
function ChainHeader({
  state,
  nextIndex,
  showAdd,
  canAdd,
  onAdd,
}: Pick<WaveChainProps, 'state' | 'nextIndex' | 'showAdd' | 'canAdd' | 'onAdd'>) {
  return (
    <div className="flex items-center justify-between gap-2">
      <SectionTitle>
        {showAdd
          ? `Chuỗi đợt · ${effectiveWaves(state).length}/${CAMPAIGN_START_MAX_WAVES}`
          : `Đợt ${nextIndex}`}
      </SectionTitle>
      {showAdd && (
        <Button
          size="sm"
          variant="ghost"
          className="pointer-coarse:h-12"
          onClick={onAdd}
          disabled={!canAdd}
        >
          <Icon icon={Plus} size={14} />
          Thêm đợt
        </Button>
      )}
    </div>
  )
}

function DropButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" className="pointer-coarse:h-12" onClick={onClick}>
      <Icon icon={Trash2} size={14} />
      Xoá
    </Button>
  )
}

const clearDraft = (s: ComposerState): ComposerState => ({
  ...emptyComposerState(),
  committed: s.committed,
})

const draftTouched = (s: ComposerState) =>
  s.label.trim() !== '' || s.subject.trim() !== '' || s.body.trim() !== ''

const waveWhen = (scheduledAt?: string) =>
  scheduledAt ? `Hẹn · ${dmhm(scheduledAt)}` : 'Gửi ngay khi bắt đầu chạy'

const draftLabel = (valid: boolean) =>
  valid ? 'Đang soạn — sẽ gửi' : 'Chưa đủ để gửi — điền tiêu đề và nội dung'
