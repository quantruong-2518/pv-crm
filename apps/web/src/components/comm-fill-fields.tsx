import { useId, type ReactNode } from 'react'
import { AiMark, Button, Icon, Input, Textarea, cn } from '@pv/ui'
import { DEBRIEF_SUMMARY_MAX, DEBRIEF_TITLE_MAX, type DebriefView } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { STEP_LABEL } from '@/components/comm-next-step-fields'
import { commNoun } from '@/data/comm-record-detail'

/** The title and the note of a comm's fill form. While AI suggestions wait, the text
 *  shows in a dim block under the box, empty or not. The placeholder stays the hint
 *  and nothing is typed into the box until the press. */

/** The label row; with a preview under it, the AI mark beside it and a small drop button. */
export function FieldHead({
  htmlFor,
  id,
  label,
  previewing = false,
  onDrop,
}: {
  htmlFor?: string
  id?: string
  label: string
  /** A section whose own preview sits right under its heading carries the mark and the drop here. */
  previewing?: boolean
  onDrop?: () => void
}) {
  const { t } = useI18n()
  const body = (
    <>
      {label}
      {previewing && <Icon icon={AiMark} size={16} />}
    </>
  )
  const cls = 'inline-flex items-center gap-2'
  return (
    <div
      className={cn(
        'flex min-h-8 items-center justify-between gap-3',
        previewing && 'pointer-coarse:min-h-12',
      )}
    >
      {htmlFor ? (
        <label htmlFor={htmlFor} className={cn(STEP_LABEL, cls)}>
          {body}
        </label>
      ) : (
        <h2 id={id} className={cn(STEP_LABEL, cls)}>
          {body}
        </h2>
      )}
      {previewing && onDrop && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="pointer-coarse:h-12"
          aria-label={t(
            message(
              `Bỏ gợi ý AI: ${label}`,
              `Drop the AI suggestion: ${label}`,
              `AI 제안 버리기: ${label}`,
            ),
          )}
          onClick={onDrop}
        >
          {t(message('Bỏ', 'Drop', '버리기'))}
        </Button>
      )}
    </div>
  )
}

/** The suggestion under its box: the AI mark, what it would do, its own drop, then the
 *  text, which scrolls when long. Dim ink: it is not the person's text yet. */
function DraftPreview({
  caption,
  label,
  onDrop,
  children,
}: {
  caption: string
  label: string
  onDrop: () => void
  children: ReactNode
}) {
  const { t } = useI18n()
  return (
    <div className="bg-muted flex min-w-0 flex-col gap-2 rounded-md p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground m-0 flex min-w-0 items-center gap-2 text-[12px]">
          <Icon icon={AiMark} size={16} className="shrink-0" />
          {caption}
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="pointer-coarse:h-12"
          aria-label={t(
            message(
              `Bỏ gợi ý AI: ${label}`,
              `Drop the AI suggestion: ${label}`,
              `AI 제안 버리기: ${label}`,
            ),
          )}
          onClick={onDrop}
        >
          {t(message('Bỏ', 'Drop', '버리기'))}
        </Button>
      </div>
      <p className="text-muted-foreground wrap-break-word m-0 max-h-48 overflow-y-auto whitespace-pre-line text-[14px] leading-[1.6]">
        {children}
      </p>
    </div>
  )
}

export function FillTitle({
  title,
  onTitle,
  preview,
  onDrop,
}: {
  title: string
  onTitle: (title: string) => void
  /** The suggestion's title; undefined when none lands here. */
  preview: string | undefined
  onDrop: () => void
}) {
  const { t } = useI18n()
  const id = useId()
  const label = t(message('Tiêu đề', 'Title', '제목'))
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <FieldHead htmlFor={id} label={label} />
      <Input
        id={id}
        value={title}
        maxLength={DEBRIEF_TITLE_MAX}
        placeholder={t(
          message(
            'Ví dụ: Chốt lịch khảo sát nhà xưởng',
            'For example: Schedule a factory visit',
            '예: 공장 방문 일정 확정',
          ),
        )}
        className="h-12 text-[14px]"
        onChange={(e) => onTitle(e.target.value)}
      />
      {preview !== undefined && (
        <DraftPreview
          caption={t(message('Sẽ điền:', 'Will fill:', '입력할 내용:'))}
          label={label}
          onDrop={onDrop}
        >
          {preview}
        </DraftPreview>
      )}
    </div>
  )
}

export function FillNote({
  record,
  summary,
  onSummary,
  noteWord,
  preview,
  onDrop,
  onRestore,
}: {
  record: DebriefView
  summary: string
  onSummary: (summary: string) => void
  /** What the form calls the box inside a sentence. */
  noteWord: string
  preview: string | undefined
  onDrop: () => void
  /** Given while a taken summary can still be walked back. */
  onRestore: (() => void) | undefined
}) {
  const { t, number } = useI18n()
  const id = useId()
  const empty = summary.trim() === ''
  const label = t(
    message(
      `Ghi chú ${commNoun(record.channel, 'vi')}`,
      `${commNoun(record.channel, 'en')} notes`,
      `${commNoun(record.channel, 'ko')} 메모`,
    ),
  )
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <FieldHead htmlFor={id} label={label} />
      <Textarea
        id={id}
        rows={6}
        autoGrow
        value={summary}
        maxLength={DEBRIEF_SUMMARY_MAX}
        placeholder={t(
          message(
            'Khách nói gì, hai bên đã thống nhất gì',
            'What the customer said and what you agreed on',
            '고객의 의견과 양측이 합의한 내용을 적어 주세요',
          ),
        )}
        className="min-h-40 text-[14px]"
        onChange={(e) => onSummary(e.target.value)}
      />
      {preview !== undefined && (
        <DraftPreview
          caption={
            empty
              ? t(message('Sẽ điền:', 'Will fill:', '입력할 내용:'))
              : t(
                  message(
                    `Sẽ thay ${noteWord} ở trên.`,
                    `Will replace the ${noteWord} above.`,
                    `위의 ${noteWord}을(를) 대체합니다.`,
                  ),
                )
          }
          label={label}
          onDrop={onDrop}
        >
          {preview}
        </DraftPreview>
      )}
      <div className="flex items-center justify-between gap-3">
        {onRestore ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="pointer-coarse:h-12"
            onClick={onRestore}
          >
            {t(
              message(
                `Lấy lại ${noteWord} cũ`,
                `Restore previous ${noteWord}`,
                `이전 ${noteWord} 복원`,
              ),
            )}
          </Button>
        ) : (
          <span />
        )}
        <span className="text-muted-foreground tnum text-[12px]">
          {number(summary.length)} / {number(DEBRIEF_SUMMARY_MAX)}{' '}
          {t(message('ký tự', 'characters', '자'))}
        </span>
      </div>
    </div>
  )
}
