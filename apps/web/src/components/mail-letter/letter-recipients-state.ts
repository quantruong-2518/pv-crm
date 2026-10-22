import { useEffect, useMemo, useState } from 'react'
import type { MailSubjectKind } from '@pv/contracts'
import { useDirectory } from '@/data/directory'
import { useLetterContacts, useLetterPreflight } from '@/data/mail-letters'
import { seedTo, toCell } from './letter-model'

/** Who the letter goes to: the one To contact (fixed, a code), the CC colleagues
 *  (actor ids) and the server's verdict on exactly this To list (G2). Split
 *  from the shell so the shell only assembles. */
export function useLetterRecipients(
  door: MailSubjectKind,
  code: string,
  leadCode: string,
  contactCode?: string | null,
) {
  const contacts = useLetterContacts(leadCode)
  const directory = useDirectory()
  /* `null` until the contact book lands, then seeded ONCE. */
  const [to, setTo] = useState<string[] | null>(null)
  const [ccIds, setCcIds] = useState<string[]>([])

  useEffect(() => {
    if (to === null && contacts.rows) setTo(seedTo(contacts.rows, leadCode, contactCode))
  }, [to, contacts.rows, leadCode, contactCode])

  const pool = useMemo(
    () => new Map((contacts.rows ?? []).map((row) => [row.code, row])),
    [contacts.rows],
  )
  const toCodes = to ?? []
  const addressing = toCodes.length > 0 ? { door, subjectCode: code, to: toCodes } : null
  const preflight = useLetterPreflight(addressing)
  const verdicts = new Map(preflight.report?.recipients.map((row) => [row.contactCode, row]))

  return {
    contacts,
    directory,
    toCodes,
    addressing,
    preflight,
    cells: toCodes.map((c) => toCell(c, pool, verdicts.get(c), preflight.checking)),
    ccIds,
    cc: ccIds.flatMap((id) => directory.filter((person) => person.id === id)),
    addCc: (id: string) => setCcIds((ids) => [...ids, id]),
    dropCc: (id: string) => setCcIds((ids) => ids.filter((x) => x !== id)),
  }
}
