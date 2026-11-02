import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Badge, GlassCard, ScreenHeader } from '@pv/ui'
import type { AssistantReportRow } from '@pv/contracts'
import { message, useI18n } from '@/app/i18n'
import { SettingsShell } from '@/components/settings-shell'
import { TableFooter } from '@/components/table-bits'
import { reportsQuery } from '@/data/assistant'
import { ASSISTANT_COPY as C, REASON_COPY, shownText } from '@/data/assistant-copy'
import { QueryBlock } from './kpi-parts'

/** One Core · Admin · answers of the CRM assistant someone reported as wrong
 *  (ADR 0133 §2). Each row holds the reported answer and the one question
 *  before it, nothing else of the session: managers never read chats.
 *
 *  No ContextRail (law 10): a report row carries no record code to open, the
 *  same exception `admin-costs.tsx` argues. A long list, so `.glass-b` (law 8). */

const m = message
const COPY = {
  title: m('Câu trả lời bị báo sai', 'Reported answers', '신고된 답변'),
  description: m(
    'Câu trả lời của Trợ lý mà người dùng báo sai.',
    'Assistant answers that people reported as wrong.',
    '사용자가 잘못되었다고 신고한 도우미 답변입니다.',
  ),
  what: m('danh sách báo sai', 'reported answers', '신고 목록'),
  none: m(
    'Chưa có câu trả lời nào bị báo sai.',
    'No reported answers yet.',
    '신고된 답변이 없습니다.',
  ),
  question: m('Câu hỏi', 'Question', '질문'),
  answer: m('Câu trả lời', 'Answer', '답변'),
  note: m('Ghi chú', 'Note', '메모'),
}

const SIZE = 20

export function AdminAssistantReportsPage() {
  const { t } = useI18n()
  const [page, setPage] = useState(0)
  const reports = useQuery(reportsQuery(page + 1, SIZE))

  return (
    <SettingsShell>
      <ScreenHeader title={t(COPY.title)} description={t(COPY.description)} />
      <QueryBlock query={reports} what={t(COPY.what)} variant="b">
        {(data) => (
          <GlassCard variant="b">
            {data.rows.length === 0 ? (
              <p className="text-muted-foreground m-0 px-5 py-6 text-[13px]">{t(COPY.none)}</p>
            ) : (
              <ul className="divide-surface-ink/6 m-0 flex list-none flex-col divide-y p-0">
                {data.rows.map((row) => (
                  <ReportItem key={row.id} row={row} />
                ))}
              </ul>
            )}
            {data.total > SIZE && (
              <TableFooter page={page} pageSize={SIZE} total={data.total} onPage={setPage} />
            )}
          </GlassCard>
        )}
      </QueryBlock>
    </SettingsShell>
  )
}

function ReportItem({ row }: { row: AssistantReportRow }) {
  const { t, date, lang } = useI18n()
  const at = date(row.at, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <li className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="text-foreground font-semibold">{row.reporterName}</span>
        <span className="text-muted-foreground tnum">{at}</span>
        <Badge tone="warning">{t(REASON_COPY[row.reason])}</Badge>
      </div>
      {/* The reviewer reads no further than their own scope: a hidden chat says why. */}
      {row.withheld || row.unchecked ? (
        <p className="text-muted-foreground m-0 text-[13px]">
          {t(row.withheld ? C.withheld : C.unchecked)}
        </p>
      ) : (
        <dl className="m-0 grid gap-2 text-[13px] leading-[1.55] sm:grid-cols-[112px_minmax(0,1fr)]">
          {row.note && <Entry label={t(COPY.note)} text={row.note} />}
          <Entry label={t(COPY.question)} text={shownText(row.question, lang)} />
          <Entry label={t(COPY.answer)} text={shownText(row.answer, lang)} />
        </dl>
      )}
    </li>
  )
}

function Entry({ label, text }: { label: string; text: string }) {
  return (
    <>
      <dt className="text-muted-foreground text-[12px]">{label}</dt>
      <dd className="text-foreground wrap-break-word m-0 whitespace-pre-line">{text}</dd>
    </>
  )
}

export default AdminAssistantReportsPage
