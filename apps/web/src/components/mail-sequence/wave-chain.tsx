import type { Dispatch, SetStateAction } from 'react'
import { Button, GlassCard, Icon, MetaPill, Plus, SectionTitle, Timeline, Trash2 } from '@pv/ui'
import { CAMPAIGN_START_MAX_WAVES } from '@pv/contracts'
import { message, translate } from '@/app/i18n'
import { dmhm } from '@/lib/date'
import { dropCommitted, effectiveWaves, emptyComposerState, type ComposerState } from './wave-draft'

const tr = (vi: string, en: string, ko: string) => translate(message(vi, en, ko))

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
            marker: tr(
              `Đợt ${alreadyFired + index + 1}`,
              `Wave ${alreadyFired + index + 1}`,
              `${alreadyFired + index + 1}차`,
            ),
            title: wave.label,
            meta: <MetaPill>{waveWhen(wave.scheduledAt)}</MetaPill>,
            children: <span className="line-clamp-1">{wave.subject}</span>,
            actions: <DropButton onClick={() => setState((s) => dropCommitted(s, wave.localId))} />,
          })),
          {
            id: 'live-draft',
            state: 'current' as const,
            marker: tr(`Đợt ${nextIndex}`, `Wave ${nextIndex}`, `${nextIndex}차`),
            title: state.label.trim() || (
              <span className="text-muted-foreground">
                {tr('(đang soạn…)', '(drafting…)', '(작성 중…)')}
              </span>
            ),
            meta: <MetaPill>{draftLabel(draftValid)}</MetaPill>,
            children: state.subject.trim() ? (
              <span className="line-clamp-1">{state.subject}</span>
            ) : (
              <span className="text-muted-foreground">
                {tr('Chưa có tiêu đề', 'No subject yet', '제목 없음')}
              </span>
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
            marker={tr(
              `Đợt ${alreadyFired + index + 1}`,
              `Wave ${alreadyFired + index + 1}`,
              `${alreadyFired + index + 1}차`,
            )}
            title={wave.label || wave.subject}
            when={waveWhen(wave.scheduledAt)}
            onDrop={() => setState((s) => dropCommitted(s, wave.localId))}
          />
        ))}
        <Row
          marker={tr(`Đợt ${nextIndex}`, `Wave ${nextIndex}`, `${nextIndex}차`)}
          title={
            state.label.trim() || state.subject.trim() || tr('Đang soạn…', 'Drafting…', '작성 중…')
          }
          when={draftLabel(draftValid)}
          {...(draftTouched(state) ? { onDrop: () => setState(clearDraft) } : {})}
        />
      </ul>
      {/* G6 as decision 3 reads it: "met" is a meeting recorded on the lead —
          the board's booking wording predates the Calendly retirement. */}
      <p className="text-muted-foreground m-0 text-[11.5px] leading-[1.5]">
        {tr(
          'Từ đợt 2, những người đã trả lời email hoặc có cuộc gặp sau đợt 1 sẽ tự động bị loại.',
          'From wave 2 onward, recipients who replied or met with your team after wave 1 are automatically excluded.',
          '2차부터 1차 발송 후 답장을 했거나 미팅을 진행한 수신자는 자동으로 제외됩니다.',
        )}
      </p>
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
          ? tr(
              `Chuỗi đợt · ${effectiveWaves(state).length}/${CAMPAIGN_START_MAX_WAVES}`,
              `Wave sequence · ${effectiveWaves(state).length}/${CAMPAIGN_START_MAX_WAVES}`,
              `발송 차수 · ${effectiveWaves(state).length}/${CAMPAIGN_START_MAX_WAVES}`,
            )
          : tr(`Đợt ${nextIndex}`, `Wave ${nextIndex}`, `${nextIndex}차`)}
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
          {tr('Thêm đợt', 'Add wave', '차수 추가')}
        </Button>
      )}
    </div>
  )
}

function DropButton({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" className="pointer-coarse:h-12" onClick={onClick}>
      <Icon icon={Trash2} size={14} />
      {tr('Xoá', 'Remove', '삭제')}
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
  scheduledAt
    ? tr(
        `Hẹn · ${dmhm(scheduledAt)}`,
        `Scheduled · ${dmhm(scheduledAt)}`,
        `예약 · ${dmhm(scheduledAt)}`,
      )
    : tr('Gửi ngay khi bắt đầu chạy', 'Send when the campaign starts', '캠페인 시작 시 발송')

const draftLabel = (valid: boolean) =>
  valid
    ? tr('Đang soạn, sẽ gửi', 'Drafted and ready to send', '작성 완료, 발송 준비됨')
    : tr(
        'Chưa đủ để gửi. Điền tiêu đề và nội dung.',
        'Not ready to send. Add a subject and message.',
        '발송 준비가 되지 않았습니다. 제목과 내용을 입력하세요.',
      )
