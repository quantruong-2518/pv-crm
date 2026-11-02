import type { Dispatch, SetStateAction } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Skeleton } from '@pv/ui'
import type { CommVocabularyResponse } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { message, useI18n } from '@/app/i18n'
import { RadioCard } from './radio-card'

/** The evaluation block of every comm close — the record page, the mobile log
 *  and the meeting close-out form: one fieldset per active question, its
 *  answers a grid of radio cards. The answers are the admin's words. */
export function CommEvaluation({
  vocab,
  picked,
  onPick,
}: {
  vocab: UseQueryResult<CommVocabularyResponse>
  picked: Record<string, string>
  onPick: Dispatch<SetStateAction<Record<string, string>>>
}) {
  const { t } = useI18n()
  const criteria = vocab.data?.criteria ?? []
  if (vocab.isPending) return <Skeleton className="h-24 w-full" />
  if (vocab.error) {
    return (
      <p role="alert" className="text-destructive-foreground m-0 text-[12.5px]">
        {t(
          message(
            'Không tải được bộ câu hỏi.',
            'Could not load the questions.',
            '질문을 불러오지 못했습니다.',
          ),
        )}{' '}
        {isApiError(vocab.error)
          ? userMessage(vocab.error)
          : t(message('Tải lại trang.', 'Reload the page.', '페이지를 새로고침해 주세요.'))}
      </p>
    )
  }
  if (criteria.length === 0) {
    return (
      <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
        {t(
          message(
            'Chưa có câu hỏi đánh giá.',
            'No evaluation questions yet.',
            '평가 질문이 아직 없습니다.',
          ),
        )}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {criteria.map((c) => (
        <fieldset key={c.id} className="m-0 min-w-0 p-0">
          <legend className="mb-3 p-0 text-[14px] font-semibold leading-[1.5]">{c.name}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {c.answers.map((a) => (
              <RadioCard
                key={a.id}
                name={`criterion-${c.id}`}
                checked={picked[c.id] === a.id}
                onSelect={() => onPick((p) => ({ ...p, [c.id]: a.id }))}
              >
                {a.name}
              </RadioCard>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  )
}
