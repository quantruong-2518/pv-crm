import type { Dispatch, SetStateAction } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Skeleton } from '@pv/ui'
import type { CommVocabularyResponse } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
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
  const criteria = vocab.data?.criteria ?? []
  if (vocab.isPending) return <Skeleton className="h-24 w-full" />
  if (vocab.error) {
    return (
      <p role="alert" className="text-destructive-foreground m-0 text-[12.5px]">
        Không tải được bộ câu hỏi.{' '}
        {isApiError(vocab.error) ? userMessage(vocab.error) : 'Tải lại trang.'}
      </p>
    )
  }
  if (criteria.length === 0) {
    return (
      <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.6]">
        Chưa có câu hỏi đánh giá.
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
