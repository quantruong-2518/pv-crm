import type { AssistantReadKind, AssistantRef } from '@pv/contracts'
import { maskContact } from '@api/platform/assistant/assistant-contact'
import type { ToolRead } from '@api/platform/assistant/assistant-tools'

/** What every record read of the Sales tools shares: the masking of typed text, the
 *  chip, and the one-record shape. Split out of `sales-assistant-tools.ts` so the
 *  kinds in `record-kinds-read.ts` use them without importing the tool class back. */

export const shownText = (text: string, mayReach: boolean): string =>
  mayReach ? text : (maskContact(text) as string)

export type Reach = { phone?: string | null; email?: string | null }

/** Keys left out rather than nulled: a null tells the model the record has none. */
export const reachOf = ({ phone, email }: Reach, mayReach: boolean): Reach =>
  mayReach ? { phone, email } : {}

/** The chip on screen; the model never reads a label (D5). It is still the
 *  assistant speaking, so a phone typed into a name is masked like the rest (0134 §4). */
export function refOf(
  kind: AssistantReadKind,
  code: string,
  label: string,
  mayReach: boolean,
): AssistantRef {
  return { kind, code, label: shownText(label, mayReach).trim() || code }
}

export const oneRecord = (
  ref: AssistantRef,
  trusted: object,
  untrusted: object,
  mayReach: boolean,
  people: readonly Reach[] = [],
): ToolRead => {
  const shown = mayReach ? untrusted : maskContact(untrusted)
  const contactInfoWithheld =
    !mayReach &&
    (people.some((c) => c.phone || c.email) || JSON.stringify(shown) !== JSON.stringify(untrusted))
  return {
    data: { trusted, untrusted: shown, ...(contactInfoWithheld && { contactInfoWithheld }) },
    codes: [ref.code],
    rowCount: 1,
    hidden: null,
    refs: [ref],
  }
}

/** The prefixes the code sequences print (`seqCodes` in each repository). */
const KIND_OF_PREFIX: readonly (readonly [string, AssistantReadKind])[] = [
  ['AC-', 'account'],
  ['LD-', 'lead'],
  ['OP-', 'opportunity'],
  ['HĐ-', 'contract'],
  ['CT-', 'contact'],
  ['CP-', 'campaign'],
  ['WS-', 'workstream'],
]

/** Null for a code with no prefix of ours: it gets no chip and no re-check. */
export const kindOfCode = (code: string): AssistantReadKind | null =>
  KIND_OF_PREFIX.find(([prefix]) => code.startsWith(prefix))?.[1] ?? null
