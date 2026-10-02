import type { MailSubjectKind } from '@pv/contracts'

/** The record a run block or the run strip stands on — one type for the rail
 *  and the strip. The kinds are the mail door's subjects (the objects a run
 *  holds); `workstream` is the run itself, its overview screen. */
export type RunSubject = { kind: MailSubjectKind | 'workstream'; code: string }
