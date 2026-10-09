import { useEffect, useState } from 'react'
import type { MailSubjectKind, MailTemplateRow } from '@pv/contracts'
import { doorDefault } from '@/data/mas'
import { EMPTY_FORM, letterDirty, withTemplate, type LetterForm } from './letter-model'

/** The letter being written and the template it was seeded with. Split from
 *  the shell so the shell only assembles; the seed is kept because "the person
 *  wrote something" means "differs from what the composer put there". */
export function useLetterForm(
  door: MailSubjectKind,
  templates: readonly MailTemplateRow[],
  catalogueLoaded: boolean,
) {
  const [form, setForm] = useState<LetterForm>(EMPTY_FORM)
  const [seed, setSeed] = useState<LetterForm | null>(null)

  /* The door's default template, once, and only over a blank letter — a
     refetch or a slow catalogue must not overwrite what somebody has typed. */
  useEffect(() => {
    if (seed || !catalogueLoaded) return
    const preset = doorDefault(templates, door)
    setSeed(withTemplate(EMPTY_FORM, preset))
    setForm((f) => (f.subject || f.body ? f : withTemplate(f, preset)))
  }, [seed, catalogueLoaded, templates, door])

  return { form, setForm, dirty: letterDirty(form, seed) }
}
