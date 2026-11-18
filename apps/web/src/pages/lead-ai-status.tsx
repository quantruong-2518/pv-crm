import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AiMark, Badge, Button, Icon } from '@pv/ui'
import type { LeadAiFillField } from '@pv/contracts'
import { message, useI18n, type Message } from '@/app/i18n'
import { AiSourceText } from '@/components/lead-ai-mark'
import { labelOf, valueText } from '@/data/lead-ai-fill'
import { leadIndustryOptionsQuery } from '@/data/industries'
import { LEAD_STEP_TOTAL, stepAt, stepLabelOf } from '@/data/lead-ai-steps'
import type { FormValues } from '@/data/lead-form'
import type { AiStatus } from './lead-ai-fill'

/** Module 2 · the lines above the lead form that speak for the AI fill (ADR 0131).
 *
 *  One line only: the step while the job moves, the result once it is done.
 *  Under it, "needs your look": one row per field the AI marked unsure and one
 *  per tax code that already belongs to another company. Rows are separated by
 *  space, never boxed, and the block is absent when there are none. The source
 *  of an unsure value is not repeated here: its own mark opens it. */

const BUTTON = 'pointer-coarse:h-12 max-md:w-full'
const LINK =
  'text-accent-foreground focus-visible:outline-ring pointer-coarse:inline-flex pointer-coarse:min-h-12 items-center underline underline-offset-2 hover:no-underline focus-visible:outline-2'

const NOT_FOUND = message(
  'Không tìm thấy thông tin công khai của công ty này.',
  'No public information found for this company.',
  '이 회사의 공개 정보를 찾지 못했습니다.',
)

function Running({ job }: { job: NonNullable<AiStatus['active']> }) {
  const { t } = useI18n()
  const at = stepAt(job)
  const queued = job.state === 'QUEUED'
  const line = queued
    ? t(message('Đang chờ', 'Waiting', '대기 중'))
    : t(
        message(
          `${t(stepLabelOf(job))} · bước ${at}/${LEAD_STEP_TOTAL}`,
          `${t(stepLabelOf(job))} · step ${at}/${LEAD_STEP_TOTAL}`,
          `${t(stepLabelOf(job))} · ${at}/${LEAD_STEP_TOTAL}단계`,
        ),
      )
  return (
    <span role="status" className="flex items-center gap-2 text-[13px]">
      <Icon icon={AiMark} size={16} aiState="loading" />
      {line}
    </span>
  )
}

/** "Filled n fields from m sources": the sources part opens a plain list. */
function Done({ done, clash }: { done: NonNullable<AiStatus['done']>; clash: boolean }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const { filled: n, sources, canUndo, undo, undoing } = done
  const m = sources.length

  /* With a clash and nothing filled the review row speaks; a line here would contradict it. */
  if (n === 0) {
    if (clash) return null
    return (
      <span className="flex items-center gap-2 text-[13px]">
        <Icon icon={AiMark} size={16} />
        {t(NOT_FOUND)}
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="flex items-center gap-2 text-[13px]">
          <Icon icon={AiMark} size={16} />
          <span>
            {t(
              message(
                `Đã điền ${n} ô từ `,
                `Filled ${n} ${n === 1 ? 'field' : 'fields'} from `,
                `${n}개 항목 입력 · `,
              ),
            )}
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
              className={LINK}
            >
              {t(message(`${m} nguồn`, `${m} ${m === 1 ? 'source' : 'sources'}`, `출처 ${m}개`))}
            </button>
          </span>
        </span>
        {canUndo && (
          <Button size="sm" variant="ghost" className={BUTTON} disabled={undoing} onClick={undo}>
            {t(message('Hoàn tác', 'Undo', '실행 취소'))}
          </Button>
        )}
      </div>
      {open && (
        <ul className="text-muted-foreground flex flex-col gap-1 pl-6 text-[12px] leading-[1.6]">
          {sources.map((source) => (
            <li key={source.text} className="flex items-center">
              <AiSourceText source={source} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Row({
  pill,
  action,
  children,
}: {
  pill: ReactNode
  action: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {pill}
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 text-[13px]">{children}</span>
      <span className="flex max-md:w-full md:ml-auto">{action}</span>
    </div>
  )
}

const OWNED = (value: string): Message =>
  message(
    `Mã số thuế ${value} đã thuộc`,
    `Tax ID ${value} already belongs to`,
    `세금번호 ${value}은(는) 이미 다음 회사에 등록됨:`,
  )

/** The block is absent at zero, so a clean fill adds nothing to the form. */
function Review({
  status,
  values,
  canGo,
  canAttach,
  onGo,
}: {
  status: AiStatus
  values: FormValues
  canGo: (key: LeadAiFillField) => boolean
  canAttach: boolean
  onGo: (key: LeadAiFillField) => void
}) {
  const { t, lang } = useI18n()
  const { unsure, conflicts, attach, attaching, openOwner } = status
  const wantsNames = unsure.some(({ key }) => key === 'category' || key === 'industries')
  const { data: names } = useQuery({ ...leadIndustryOptionsQuery, enabled: wantsNames })
  const count = unsure.length + conflicts.length
  if (count === 0) return null

  return (
    <section
      aria-label={t(message('Cần bạn xem', 'Needs your review', '확인 필요'))}
      className="flex flex-col gap-3"
    >
      <h3 className="text-muted-foreground text-[12px] font-semibold leading-[1.4]">
        {t(
          message(`Cần bạn xem · ${count}`, `Needs your review · ${count}`, `확인 필요 · ${count}`),
        )}
      </h3>
      {unsure.map(({ key }) => {
        const value = valueText(key, values, names, lang)
        return (
          <Row
            key={key}
            pill={<Badge tone="warning">{t(message('Chưa chắc', 'Unsure', '불확실'))}</Badge>}
            action={
              canGo(key) && (
                <Button size="sm" variant="ghost" className={BUTTON} onClick={() => onGo(key)}>
                  {t(message('Sửa', 'Edit', '수정'))}
                </Button>
              )
            }
          >
            <span className="font-medium">
              {labelOf(key, lang)}
              {value !== '' && `: ${value}`}
            </span>
          </Row>
        )
      })}
      {conflicts.map((conflict) => (
        <Row
          key={conflict.accountCode}
          pill={
            <Badge tone="danger">
              {t(message('Trùng công ty', 'Duplicate account', '중복 회사'))}
            </Badge>
          }
          action={
            canAttach && (
              <Button
                size="sm"
                variant="secondary"
                className={BUTTON}
                disabled={attaching}
                onClick={() => attach(conflict)}
              >
                {t(message('Gắn vào công ty này', 'Attach to this account', '이 회사에 연결'))}
              </Button>
            )
          }
        >
          <span>
            {t(OWNED(conflict.value))}{' '}
            {openOwner ? (
              <button
                type="button"
                onClick={() => openOwner(conflict.accountCode)}
                className={LINK}
              >
                {conflict.accountName}
              </button>
            ) : (
              conflict.accountName
            )}
          </span>
        </Row>
      ))}
    </section>
  )
}

export function LeadAiStatus({
  status,
  values,
  canGo,
  canAttach,
  onGo,
}: {
  status: AiStatus
  values: FormValues
  /** Whether the box is on this form and the reader may type in it. */
  canGo: (key: LeadAiFillField) => boolean
  /** Attaching writes the lead (`lead.edit`, scoped): without it, text and no button. */
  canAttach: boolean
  /** Opens the box's tab, scrolls to it and puts the cursor in it. */
  onGo: (key: LeadAiFillField) => void
}) {
  const { active, done, unsure, conflicts } = status
  if (!active && !done && unsure.length === 0 && conflicts.length === 0) return null
  return (
    <div className="flex flex-col gap-4">
      {active ? (
        <Running job={active} />
      ) : (
        done && <Done done={done} clash={conflicts.length > 0} />
      )}
      <Review status={status} values={values} canGo={canGo} canAttach={canAttach} onGo={onGo} />
    </div>
  )
}
