import { DEFAULT_ROLE_PERMISSIONS, type RoleId } from '@pv/engines'
import { trailText, type Trail } from './bench'
import type { Check, Tally } from './report'
import type { DoorAnswer, Probe } from './scope-door'
import { ALL_SEATS, NAMED_SEATS, ROLE_SEATS, ROLES, wideSeatId, type Seat } from './seed-data'
import type { Chain } from './seed'
import { toolOutputs } from './scripted-client'
import type { World } from './world'

/** Question 147: phone and email reach a model only for a holder of `data.export`,
 *  whatever the door shows the same person on a screen.
 *
 *  What counts as a contact is read off the door's own answer: by key, so a field the
 *  door grows later joins the rule by itself, and by shape, for what was typed into
 *  free text, which a non-holder reads as the mask. A contract has no contact key, so
 *  typed text is its only way to the flag.
 *
 *  The holder side is read from `who.permissions`: `grantCases` runs seats the role
 *  table is wrong about, or a tool that asked the table would still pass. */

const GROUP = 'scope-reach'
const NEED = 'data.export'
const MASK = '[withheld]'
/* Company data, in a shape the mask would take for a phone. */
const NOT_MASKED = ['taxCode', 'website'] as const
/* A lead's door names its owner's mail, which is staff data no tool hands over. */
const STAFF_MAILS = new Set(ALL_SEATS.map((s) => s.email))

export type Cell = { who: Seat; probe: Probe; chain: Chain }

/** Every `role kind verdict` the matrix reached. */
export type ReachLog = Set<string>

type Verdict = 'withheld' | 'reached' | 'none'

type ToolBody = { contactInfoWithheld?: unknown; untrusted?: Record<string, unknown> }

/* Anchored off hex: a random id holds `0977` and six digits often enough to fail a run. */
const CONTACT = /[\w.-]+@eval\.invalid|(?<![\da-f-])0977\d{6}(?![\da-f])/g

/** Any phone or mail of the eval's shape, canary or not: a sibling's mail is not one. */
export const contactsIn = (text: string): string[] => text.match(CONTACT) ?? []

/** A door string as a non-holder may read it; only one that held a contact has a form. */
export const maskedLeaves = (atDoor: readonly string[]): string[] =>
  atDoor.filter((leaf) => contactsIn(leaf).length > 0).map((leaf) => leaf.replace(CONTACT, MASK))

export const holdsExport = (who: Seat): boolean => who.permissions.includes(NEED)

function doorContacts(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(doorContacts)
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value).flatMap(([key, item]) =>
    (key === 'phone' || key === 'email') && typeof item === 'string' && item
      ? [item]
      : doorContacts(item),
  )
}

const line = (role: RoleId | undefined, probe: Probe, verdict: Verdict) =>
  `${role} ${probe} ${verdict}`

export function agreeOnReach(
  c: Check,
  { who, probe }: Cell,
  door: Extract<DoorAnswer, { ok: true }>,
  trail: Trail,
  log: ReachLog,
): void {
  const [, body = '{}'] = (
    toolOutputs(trail.witness.seen[1]?.request.messages ?? [])[0] ?? ''
  ).split('\n')
  const output = JSON.parse(body) as ToolBody
  const flag = output.contactInfoWithheld
  if (probe === 'search') return c.eq(flag, undefined, 'a list has no flag, mask or not')
  const shown = JSON.parse(door.json) as Record<string, unknown>
  const keyed = doorContacts(shown)
  const typed = contactsIn(door.json).filter((v) => !keyed.includes(v) && !STAFF_MAILS.has(v))
  const atDoor = [...keyed, ...typed]
  const holder = holdsExport(who)
  const verdict = atDoor.length === 0 ? 'none' : holder ? 'reached' : 'withheld'
  log.add(line(who.roleIds[0], probe, verdict))
  c.eq(flag, verdict === 'withheld' ? true : undefined, 'contactInfoWithheld')
  if (probe === 'lead') {
    for (const key of NOT_MASKED) c.eq(output.untrusted?.[key], shown[key] ?? undefined, key)
  }
  if (holder) {
    c.eq(
      atDoor.filter((v) => !body.includes(v)),
      [],
      'the door showed, the model lacks',
    )
    return c.ok(!body.includes(MASK), 'a holder reads the text whole')
  }
  c.eq(contactsIn(trailText(trail)), [], 'phones and mails left for a seat without data.export')
  c.ok(!/"(phone|email)":/.test(body), 'the keys are left out: a null reads as "has none"')
  c.eq(body.includes(MASK), typed.length > 0, 'the mask stands where text held a contact')
}

const roleHolds = (role: RoleId): boolean => DEFAULT_ROLE_PERMISSIONS[role].includes(NEED)

/** Each cell proves its own seat; this proves the rows were not empty. A kind the role
 *  cannot view has no row: the door's refusal there is the matrix's business. */
export async function reachCoverage(tally: Tally, log: ReachLog): Promise<void> {
  for (const role of ROLES) {
    for (const kind of ['lead', 'opportunity', 'contract'] as const) {
      if (!DEFAULT_ROLE_PERMISSIONS[role].includes(`${kind}.view`)) continue
      const open: Verdict = roleHolds(role) ? 'reached' : 'withheld'
      for (const verdict of kind === 'contract' ? ['none' as const, open] : [open]) {
        const wanted = line(role, kind, verdict)
        await tally.run(GROUP, wanted, async (c) => {
          c.ok(log.has(wanted), 'no cell of the matrix got there')
        })
      }
    }
  }
}

const seatOf = (id: string): Seat => {
  const found = ROLE_SEATS.find((s) => s.id === id)
  if (!found) throw new Error(`no seat ${id}`)
  return found
}

type RunCell = (c: Check, cell: Cell, log: ReachLog) => Promise<DoorAnswer>

/** Grants an admin changed after the seed: no route is involved, because the session's
 *  `who` is all the tool reads. */
export async function grantCases(world: World, tally: Tally, run: RunCell): Promise<void> {
  const chain = (key: string): Chain => {
    const found = world.seeded.chains.get(key)
    if (!found) throw new Error(`no chain ${key}`)
    return found
  }
  const granted = (s: Seat): Seat => ({ ...s, permissions: [...s.permissions, NEED] })
  const director = seatOf(wideSeatId('director'))
  const revoked = { ...director, permissions: director.permissions.filter((p) => p !== NEED) }
  const changes = [
    { want: 'reached', who: granted(NAMED_SEATS.saleA), probe: 'lead', on: chain('a') },
    { want: 'reached', who: granted(NAMED_SEATS.saleA), probe: 'opportunity', on: chain('a') },
    {
      want: 'reached',
      who: granted(seatOf(wideSeatId('sale'))),
      probe: 'contract',
      on: chain('rival'),
    },
    { want: 'withheld', who: revoked, probe: 'lead', on: chain('a') },
    { want: 'withheld', who: revoked, probe: 'opportunity', on: chain('a') },
    { want: 'withheld', who: revoked, probe: 'contract', on: chain('rival') },
  ] as const
  for (const { want, who, probe, on } of changes) {
    const role = who.role as RoleId
    await tally.run(GROUP, `changed grant: ${role} ${probe} ${want}`, async (c) => {
      c.eq(roleHolds(role), want !== 'reached', 'the role table says the opposite')
      const log: ReachLog = new Set()
      c.ok((await run(c, { who, probe, chain: on }, log)).ok, 'the door opens this record')
      c.ok(log.has(line(role, probe, want)), `not ${want}`)
    })
  }
}
