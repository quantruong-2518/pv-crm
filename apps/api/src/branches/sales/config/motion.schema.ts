import { boolean, check, integer, text } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { LeadMotion, MotionAsks, RoleId } from '@pv/contracts'
import { sales } from '../sales.schema'

/** What each of the six lead motions declares about itself.
 *
 *  ------------------------------------------------------------------
 *  SIX ROWS, PLANTED BY THE MIGRATION, NEVER CREATED OR DELETED
 *  ------------------------------------------------------------------
 *  `LEAD_MOTIONS` is a CLOSED list in `@pv/engines`, with the reason written
 *  beside it: an "other" box would be the biggest bucket in the table within a
 *  quarter, and then "which channel produces customers" stops being answerable.
 *  So this table has no create door and no delete door — the six rows exist
 *  from migration `0036` onward and only their columns ever change.
 *
 *  That is also why every POLICY column is nullable and starts NULL. The
 *  numbers do not exist yet and must not be invented; a `DEFAULT 3` here would
 *  be exactly the invented
 *  number, wearing a schema for a disguise. NULL reads as "nobody has decided",
 *  the screen draws it as such, and a rule that finds one must refuse to act
 *  rather than fall back on something nobody agreed to.
 *
 *  ------------------------------------------------------------------
 *  NOT `config_entry`, AND THE DIFFERENCE IS NOT SIZE
 *  ------------------------------------------------------------------
 *  `sales.config_entry` holds VOCABULARY — rows a person adds and reorders,
 *  each one a name with at most one attribute. A motion is not vocabulary: the
 *  list cannot grow, `ord` is display only, and each carries four unrelated
 *  declarations. Forcing them into `config_entry` would mean four more columns
 *  that only six of its rows ever fill, which is how a shared table stops being
 *  shared. They travel the same approval path, though — see `ConfigChange`. */
export const motionPolicy = sales.table(
  'motion_policy',
  {
    motion: text('motion').$type<LeadMotion>().primaryKey(),

    /** Minutes, one unit at rest, because these get compared: 30 minutes for
     *  inbound and 3 days for outbound have to sort against each other. The
     *  screen reads and writes in the largest unit that divides evenly, which
     *  is how "deadlines in real units" survives without a second column that
     *  can disagree with this one. */
    firstTouchMinutes: integer('first_touch_minutes'),

    /** A ROLE, not a person: a rule naming a person stops being true the day
     *  they change desks, and the assignment door resolves the role to whoever
     *  holds it then. No foreign key because roles have no table of their own —
     *  `platform.role_permission` keys on the same bare string. */
    ownerRoleId: text('owner_role_id').$type<RoleId>(),

    /** May a lead from this motion enter a cold campaign at all. The one rule
     *  the vision document states concretely: `referral` must never be pushed
     *  into cold mail. */
    coldMailAllowed: boolean('cold_mail_allowed'),

    /** Does a form the customer filled in themselves count as having passed the
     *  init-data gate up to `mql`. An open question rather than a setting —
     *  `inbound` can arrive fully self-described, `outbound` never does. */
    selfServeCountsAsInitData: boolean('self_serve_counts_as_init_data'),

    /** Display override; NULL = the screen's built-in label for the motion. */
    label: text('label'),
    /** Display order. NOT NULL unlike the four above: an order is layout, not a
     *  policy number, so a default invents nothing. 0057 sets 1…6. */
    ord: integer('ord').notNull().default(0),
    /** Hidden from pickers when false. Switch-off, never delete — the list
     *  stays closed at six (see docblock). */
    active: boolean('active').notNull().default(true),
    /** What the lead form asks for after the motion: an origin, a campaign
     *  (EVENT, RECYCLE) or a referrer (REFERRAL, PARTNER). One of three rather
     *  than 0057's boolean, which could only say "campaign or not". No default:
     *  0059 backfilled all six, and a guess here would hide a missing answer. */
    asks: text('asks').$type<MotionAsks>().notNull(),
  },
  () => [
    /** The six, copied rather than generated — the same call `touch_kind_known`
     *  makes: a seventh motion must be a migration somebody reads, not a line
     *  that quietly widens.
     *
     *  UPPER CASE because that is the stored spelling (`LeadMotion` in
     *  `@pv/contracts`). `@pv/engines` holds the same six in lower case and
     *  `apps/web` reads that one; the two are the "enum declared twice" debt,
     *  converted in exactly one place. This table speaks the stored form. */
    check(
      'motion_policy_motion_known',
      sql`"motion" IN ('INBOUND', 'OUTBOUND', 'EVENT', 'REFERRAL', 'PARTNER', 'RECYCLE')`,
    ),
    /** The seven role ids, same discipline. */
    check(
      'motion_policy_role_known',
      sql`"owner_role_id" IS NULL OR "owner_role_id" IN ('director', 'head-of-sales', 'marketing',
                                                         'bd', 'presales', 'sale', 'account-executive')`,
    ),
    /** A deadline of zero minutes is not a deadline, and 90 days is a typo
     *  fence rather than a policy: it catches days typed into a minutes box. */
    check(
      'motion_policy_first_touch_sane',
      sql`"first_touch_minutes" IS NULL
          OR ("first_touch_minutes" > 0 AND "first_touch_minutes" <= 129600)`,
    ),
    check('motion_policy_label_no_blank', sql`"label" <> ''`),
    /** Copied by hand for `motion_policy_motion_known`'s reason. */
    check('motion_policy_asks_known', sql`"asks" IN ('ORIGIN', 'CAMPAIGN', 'REFERRER')`),
  ],
)

export type MotionPolicyRowDb = typeof motionPolicy.$inferSelect
export type MotionPolicyPatchDb = Partial<Omit<MotionPolicyRowDb, 'motion'>>
