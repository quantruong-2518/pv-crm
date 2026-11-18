import { useState } from 'react'
import { AiMark, Badge, Button, Icon, Textarea } from '@pv/ui'
import { message, useI18n } from '@/app/i18n'
import { commAiBasis, type CommAiReportState } from '@/data/comm-ai-report'

/** The minutes the AI wrote, in the call column. Saving them is its own press that
 *  writes now, apart from filling the form's boxes; until then they are a two-line
 *  preview that opens into a box to edit. */

export function CommAiMinutes({
  ai,
  waiting,
}: {
  ai: CommAiReportState
  /** The block above already prints the basis, so this one does not repeat it. */
  waiting: boolean
}) {
  const { t, lang } = useI18n()
  const [open, setOpen] = useState(false)
  if (!ai.hasReport) return null
  const label = t(message('Biên bản', 'Minutes', '회의록'))
  const tone = ai.minutesSaved ? 'success' : ai.minutesChangedSinceSave ? 'warning' : 'draft'

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label={label}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 inline-flex items-center gap-2 text-[14px] font-semibold">
          {label}
          <Icon icon={AiMark} size={16} />
        </h3>
        <Badge tone={tone}>
          {ai.minutesSaved
            ? t(message('Đã lưu', 'Saved', '저장됨'))
            : ai.minutesChangedSinceSave
              ? t(message('Có phần sửa chưa lưu', 'Unsaved edits', '저장되지 않은 수정 있음'))
              : t(message('Chưa lưu', 'Not saved', '저장 안 됨'))}
        </Badge>
      </div>
      {open ? (
        <Textarea
          rows={10}
          autoGrow
          value={ai.minutes}
          aria-label={label}
          className="max-h-[60dvh] overflow-y-auto text-[14px]"
          onChange={(e) => ai.setMinutes(e.target.value)}
        />
      ) : (
        <p className="text-muted-foreground m-0 line-clamp-2 whitespace-pre-line text-[14px] leading-[1.6]">
          {ai.minutes}
        </p>
      )}
      {!waiting && ai.sources && (
        <p className="text-muted-foreground wrap-break-word m-0 text-[12px] leading-[1.5]">
          {t(message('Căn cứ', 'Basis', '근거'))}:{' '}
          {commAiBasis(ai.sources, t(ai.words.note), lang, { files: 'count' })}
        </p>
      )}
      {ai.saveProblem && (
        <p role="alert" className="text-destructive-foreground m-0 text-[12px] leading-[1.6]">
          {ai.saveProblem}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          className="pointer-coarse:h-12"
          onClick={() => setOpen((was) => !was)}
        >
          {open
            ? t(message('Thu gọn', 'Collapse', '접기'))
            : t(message('Xem và sửa', 'View and edit', '보기 및 수정'))}
        </Button>
        {!ai.minutesSaved && (
          <Button
            type="button"
            variant="secondary"
            className="pointer-coarse:h-12"
            disabled={ai.savingMinutes}
            onClick={ai.saveMinutes}
          >
            {ai.savingMinutes
              ? t(message('Đang lưu…', 'Saving…', '저장 중…'))
              : t(message('Lưu vào hồ sơ', 'Save to the record', '기록에 저장'))}
          </Button>
        )}
      </div>
    </section>
  )
}
