import type { ReactNode } from 'react'
import { AiMark, Button, Checkbox, Icon } from '@pv/ui'
import { message, useI18n } from '@/app/i18n'
import { commAiBasis, type CommAiReportState } from '@/data/comm-ai-report'
import { commAiStepLine } from '@/data/comm-ai-steps'

/** The one AI block above a comm's form (ADR 0132): ask, wait, and the suggestions'
 *  one press. It only proposes: `onFill` is the person's press, and the report's parts
 *  reach the fields through it alone (law 9). The same block holds every state, so a
 *  retry or a new ask never lands in a second place. */

export const FILL_DRAFT = message('Điền vào ô', 'Fill in', '입력란에 채우기')

const TOUCH = 'pointer-coarse:h-12'
/** File names in the basis line have no break to wrap on. */
const DIM = 'text-on-tint-primary-muted wrap-break-word m-0 text-[12px] leading-[1.5]'

export function CommAiBlock({
  ai,
  note,
  waiting,
  onFill,
}: {
  ai: CommAiReportState
  /** The note box now: the press asks about what is typed, not what was saved. */
  note: string
  /** The form still holds a part the suggestions can fill. */
  waiting: boolean
  onFill: () => void
}) {
  const { t, lang } = useI18n()
  const { stage } = ai
  const needTick = ai.needsNotice && !ai.notice
  const start = () => ai.ask('summary', note)
  const askable = ai.canAsk && !needTick
  const view =
    stage === 'running' || stage === 'error'
      ? stage
      : waiting
        ? 'ready'
        : stage === 'ready' && ai.taken.length > 0
          ? 'committed'
          : 'idle'
  if (view === 'idle' && !ai.canAsk) return null

  /* Three languages: an attestation must be readable by whoever gives it. */
  const consent = ai.needsNotice &&
    (view === 'idle' || view === 'error' || view === 'committed') && (
      <Checkbox
        className="pointer-coarse:min-h-12 -mx-3"
        wrap
        checked={ai.notice}
        onChange={ai.setNotice}
        label={t(
          message(
            'Tôi xác nhận mọi người trong ghi âm đã được báo trước',
            'I confirm everyone on the recording was told beforehand',
            '녹음에 포함된 모든 사람에게 미리 알렸음을 확인합니다',
          ),
        )}
      />
    )

  if (view === 'committed') {
    return (
      <Shell consent={needTick && consent}>
        <p className={`${DIM} flex-1`}>
          {t(
            message(
              'Đã điền vào ô. Kiểm tra lại trước khi xác nhận.',
              'Filled in. Review before you confirm.',
              '입력했습니다. 확인하기 전에 검토해 주세요.',
            ),
          )}
        </p>
        {ai.canAsk && (
          <Button
            type="button"
            variant="ghost"
            className={TOUCH}
            disabled={needTick}
            onClick={start}
          >
            {t(message('Tạo lại', 'Regenerate', '다시 생성'))}
          </Button>
        )}
      </Shell>
    )
  }

  if (view === 'running') {
    return (
      <Shell>
        <Running ai={ai} />
      </Shell>
    )
  }

  if (view === 'error') {
    return (
      <Shell consent={consent}>
        <p role="alert" className="text-on-tint-destructive m-0 flex-1 text-[13px] leading-[1.5]">
          {ai.error}
        </p>
        <Button
          type="button"
          variant="secondary"
          className={TOUCH}
          disabled={ai.asking !== null || (!ai.retry && !askable)}
          onClick={ai.retry ?? start}
        >
          {t(message('Thử lại', 'Retry', '다시 시도'))}
        </Button>
      </Shell>
    )
  }

  return (
    <Shell consent={consent}>
      <strong className="text-on-tint-primary min-w-0 flex-1 text-[14px] font-semibold leading-[1.5]">
        {t(
          ai.needsNotice
            ? message('Từ ghi âm và ghi chú', 'From the recording and notes', '녹음과 메모 기반')
            : message('Từ ghi chú', 'From the notes', '메모 기반'),
        )}
      </strong>
      {view === 'idle' ? (
        <Button
          type="button"
          variant="secondary"
          className={TOUCH}
          disabled={!askable}
          onClick={start}
        >
          {t(message('Tạo gợi ý', 'Generate suggestions', '제안 생성'))}
        </Button>
      ) : (
        <div className="flex flex-wrap gap-2">
          {/* The phone's primary is the sticky bar's: one filled button on screen. */}
          <Button type="button" className={`${TOUCH} max-lg:hidden`} onClick={onFill}>
            {t(FILL_DRAFT)}
          </Button>
          <Button type="button" variant="ghost" className={TOUCH} onClick={ai.dismissDraft}>
            {t(message('Bỏ gợi ý', 'Discard suggestions', '제안 버리기'))}
          </Button>
        </div>
      )}
      {view === 'ready' && ai.sources && (
        <p className={`${DIM} basis-full`}>
          {t(message('Căn cứ', 'Basis', '근거'))}:{' '}
          {commAiBasis(ai.sources, t(ai.words.note), lang, { files: 'count' })}
        </p>
      )}
    </Shell>
  )
}

/** The consent sits above the row that starts the press: the box comes first. */
function Shell({ consent, children }: { consent?: ReactNode; children: ReactNode }) {
  return (
    <section className="glass-ai flex flex-col gap-3 rounded-lg px-5 py-4">
      {consent}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Icon icon={AiMark} size={16} className="shrink-0" />
        {children}
      </div>
    </section>
  )
}

/** A recording runs as a job whose steps are counted; a note alone is one call. */
function Running({ ai }: { ai: CommAiReportState }) {
  const { t } = useI18n()
  const { progress } = ai
  return (
    <p role="status" className="text-on-tint-primary tnum m-0 flex-1 text-[13px] leading-[1.5]">
      {progress
        ? t(commAiStepLine(progress.step, progress.queued))
        : t(message('AI đang đọc.', 'AI is reading.', 'AI가 읽는 중입니다.'))}
    </p>
  )
}
