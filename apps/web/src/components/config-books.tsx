import { useLocation, useNavigate } from 'react-router-dom'
import { SegmentedControl } from '@pv/ui'

/** TWO BOOKS OF MODULE 6, AND HOW TO MOVE BETWEEN THEM.
 *
 *  The catalog book (`config_entry`) is a lookup list, each row an
 *  `id/name/ord` — it goes through the approval box because a wrong edit on a
 *  row that already has data attached breaks another book. The template book
 *  (`sales.mail_template`) is authored content — subject, body, CTA — and
 *  marketing edits it directly, no approval: a wrong sentence in a letter is
 *  fixed by rewriting it, unlike a drop reason with 21 leads standing on it.
 *
 *  Two different interaction models, two different tables — but one question
 *  ("what does the sales department's configuration look like"), so they sit
 *  side by side here rather than as two separate modules. The template book
 *  moved from Module 1 (22/09): it carries no instance ID the way
 *  `campaign`/`source`/`mail_run` does — it is shared configuration every
 *  campaign reads, not the record of one send. */
const BOOKS = [
  { value: '/sales/config', label: 'Cấu hình' },
  { value: '/sales/config/mail-templates', label: 'Mẫu thư' },
] as const

/** Which book is open — same matching rule as `Module1Books`: the FULL path,
 *  not a prefix, because `/sales/config` is a prefix of both. */
function currentBook(pathname: string): string {
  const nested = BOOKS.filter((b) => b.value !== '/sales/config').find(
    (b) => pathname === b.value || pathname.startsWith(`${b.value}/`),
  )
  return nested?.value ?? '/sales/config'
}

/** Sits right under `ScreenHeader` on both books. Takes no props: the open
 *  book is read from the path, so no screen can declare the wrong one. */
export function ConfigBooks() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <SegmentedControl
      label="Sổ"
      hideLabel
      options={BOOKS.map((b) => ({ value: b.value, label: b.label }))}
      value={currentBook(pathname)}
      onChange={(value) => navigate(value)}
    />
  )
}
