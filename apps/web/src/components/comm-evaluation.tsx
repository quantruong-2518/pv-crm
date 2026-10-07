import type { Dispatch, SetStateAction } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Check, Skeleton, cn } from '@pv/ui'
import type { CommVocabularyResponse } from '@pv/contracts'
import { isApiError, userMessage } from '@/app/api'
import { COMM_CARD_SURFACE } from '@/data/comm-record-detail'
import { ChoiceChip } from './comm-bits'

/** The evaluation block of every comm close — the record page, the mobile log
 *  and the meeting close-out form: one fieldset per active question. */

/** One fieldset per active question; the answers are the admin's words. */
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
  return (
    <div className="flex flex-col gap-3">
      <span className="text-muted-foreground text-[11px]">Đánh giá</span>
      {vocab.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : vocab.error ? (
        <p role="alert" className="text-warning text-[12px]">
          Không tải được bộ câu hỏi.{' '}
          {isApiError(vocab.error) ? userMessage(vocab.error) : 'Tải lại trang.'}
        </p>
      ) : criteria.length === 0 ? (
        <p className="text-muted-foreground text-[12px] leading-[1.6]">
          Chưa có câu hỏi đánh giá nào đang bật — phần này để trống.
        </p>
      ) : (
        criteria.map((c) => (
          <fieldset
            key={c.id}
            className={cn('flex flex-col gap-2 rounded-md p-3', COMM_CARD_SURFACE)}
          >
            <legend className="sr-only">{c.name}</legend>
            <span aria-hidden className="text-[12.5px] font-medium">
              {c.name}
            </span>
            <div className="flex flex-wrap gap-2">
              {c.answers.map((a) => (
                <ChoiceChip
                  key={a.id}
                  className="h-8 gap-1 px-2 text-[11.5px]"
                  pressed={picked[c.id] === a.id}
                  icon={picked[c.id] === a.id ? Check : undefined}
                  onClick={() => onPick((p) => ({ ...p, [c.id]: a.id }))}
                >
                  {a.name}
                </ChoiceChip>
              ))}
            </div>
          </fieldset>
        ))
      )}
    </div>
  )
}
