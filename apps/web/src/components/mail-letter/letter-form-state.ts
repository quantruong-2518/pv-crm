import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  MailGroupPreflightResponse,
  MailSubjectKind,
  MailTemplateRow,
  MailTransport,
} from '@pv/contracts'
import { GOOGLE_KEY, googleLinkQuery } from '@/data/google'
import { doorDefault } from '@/data/mas'
import {
  ALLOWANCE_SPENT,
  EMPTY_FORM,
  unreadySender,
  withTemplate,
  type LetterForm,
} from './letter-model'

/** The letter being written. Split from the shell so the shell only assembles. */
export function useLetterForm(
  door: MailSubjectKind,
  templates: readonly MailTemplateRow[],
  catalogueLoaded: boolean,
) {
  const [form, setForm] = useState<LetterForm>(EMPTY_FORM)
  const [seeded, setSeeded] = useState(false)

  /* The door's default template, once, and only over a blank letter — a
     refetch or a slow catalogue must not overwrite what somebody has typed. */
  useEffect(() => {
    if (seeded || !catalogueLoaded) return
    setSeeded(true)
    const preset = doorDefault(templates, door)
    setForm((f) => (f.subject || f.body ? f : withTemplate(f, preset)))
  }, [seeded, catalogueLoaded, templates, door])

  return { form, setForm }
}

/** Which mailbox the letter leaves from: the person's choice, and what follows
 *  from it. `transport` is null until a choice exists, so nothing is previewed
 *  or sent for a mailbox that is about to change; with no Google client on the
 *  server there is no choice and the letter is shared.
 *
 *  `fault` shuts Send and is the footer's sentence. `shown` is the mailbox the
 *  preview may name — none while the own one cannot send. */
export function useLetterSender(
  preflight: { sender?: MailGroupPreflightResponse['sender']; checking: boolean },
  scheduled: boolean,
) {
  const client = useQueryClient()
  const link = useQuery(googleLinkQuery())
  const [choice, setChoice] = useState<MailTransport | null>(null)
  const reread = useRef(false)
  const { sender, checking } = preflight

  /* The default lands ONCE, on the first answer: a later answer must not move
     a control the person has already read or touched. */
  useEffect(() => {
    if (choice === null && sender) setChoice(sender.personal ? 'gmail' : 'resend')
  }, [choice, sender])

  const personal = sender?.personal ?? null
  const unconfigured = link.data?.configured === false
  /* An explicit own-mailbox choice keeps the control even if a later read
     fails: it must never turn into a shared send behind the person's back. */
  const offered = personal !== null || link.data?.configured === true || choice === 'gmail'
  const control = choice !== null && !unconfigured && offered
  const transport: MailTransport | null = unconfigured ? 'resend' : choice
  const unready = transport === 'gmail' && personal === null ? unreadySender(link.data) : null
  const stale = unready !== null && (link.isError || link.data?.mail === 'ready')

  /* The status read disagrees with the server: ask it again, once. */
  useEffect(() => {
    if (!stale || reread.current) return
    reread.current = true
    void client.invalidateQueries({ queryKey: GOOGLE_KEY })
  }, [stale, client])

  /* A scheduled letter is judged against the window around its own hour. */
  const spent = transport === 'gmail' && personal?.remaining === 0 && !scheduled
  return {
    transport,
    shown: transport !== null && !unready ? transport : undefined,
    fault: unready?.fault ?? (spent ? ALLOWANCE_SPENT : undefined),
    line: {
      /** Hold the row's height only while the answer that fills it is on its way. */
      reserve: !control && !unconfigured && (choice === null ? checking : link.isPending),
      value: control ? transport : null,
      pick: setChoice,
      remaining:
        transport === 'gmail' && personal && personal.remaining > 0 ? personal.remaining : null,
      action: unready?.action ?? null,
    },
  }
}
