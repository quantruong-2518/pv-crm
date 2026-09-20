import { LEAD_OPEN_STATES, LEAD_STATE_LABEL, type LeadState, type LeadTier } from '@pv/contracts'
import { LEAD_TIERS } from '@pv/engines/fixtures/das-vina'

/** How the screen names and colours a lead's stored lifecycle state (ADR 0058).
 *  The NAME is not decided here: `LEAD_STATE_LABEL` in `@pv/contracts` is the
 *  one table the server and every screen read, so a state can never wear two
 *  names. What stays here is the TONE, which never travels on the wire.
 *
 *  The pill tone answers "does this row need somebody": amber while nobody
 *  has acted, azure while a PIC is on it, grey while parked or retired, green
 *  once it became a deal, red once it was dropped. The label carries the exact
 *  state; colour deliberately does not invent eight separate meanings. */
export const LEAD_STATE_FACE: Record<
  LeadState,
  {
    label: string
    badge: 'warning' | 'running' | 'draft' | 'success' | 'danger'
  }
> = {
  new: { label: LEAD_STATE_LABEL.new, badge: 'warning' },
  assigned: { label: LEAD_STATE_LABEL.assigned, badge: 'warning' },
  verifying: { label: LEAD_STATE_LABEL.verifying, badge: 'running' },
  working: { label: LEAD_STATE_LABEL.working, badge: 'running' },
  nurturing: { label: LEAD_STATE_LABEL.nurturing, badge: 'draft' },
  converted: { label: LEAD_STATE_LABEL.converted, badge: 'success' },
  disqualified: { label: LEAD_STATE_LABEL.disqualified, badge: 'danger' },
  archived: { label: LEAD_STATE_LABEL.archived, badge: 'draft' },
}

const OPEN: ReadonlySet<string> = new Set(LEAD_OPEN_STATES)

/** Takes any string so a `LeadStateFilter` group key (`open`, `all`) can be
 *  asked too — it simply answers no. */
export const isOpenState = (state: string): state is LeadState => OPEN.has(state)

/** Tier options for the verify picker — the same fixture table the profile
 *  form's tier select already draws, so one tier never wears two names. */
export const TIER_CHOICES: readonly { key: LeadTier; label: string }[] = LEAD_TIERS

const TIER_LABEL: ReadonlyMap<string, string> = new Map(TIER_CHOICES.map((t) => [t.key, t.label]))

/** Takes a string because `AccountProfile.leadRows[].tier` is typed loosely;
 *  an unknown key prints as itself rather than vanishing. */
export const tierLabel = (tier: string): string => TIER_LABEL.get(tier) ?? tier

/** May `PATCH` carry `tier`? Only while `working` or `converted` — the server
 *  refuses every other state, nurturing included (ADR 0058 amendment), and
 *  `POST :code/verify` is the door that sets the first tier. */
export function tierEditable(lead: { state: LeadState }): boolean {
  return lead.state === 'working' || lead.state === 'converted'
}
