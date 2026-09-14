import { z } from 'zod'
import { email, Moment, textInput, textInputOptional } from './primitives'

/** Sign-in, the session it produces, and the people book behind it.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS FILE SITS BESIDE `problem.ts` AND NOT UNDER `sales/`
 *  ------------------------------------------------------------------
 *  `platform.actor` belongs to no branch. Sales reads it, Supply will read it,
 *  and neither owns it — same reason the table lives in the `platform` schema
 *  rather than in `sales`. A contract filed under `sales/` would say the
 *  opposite, and the first branch to need a second copy would make one.
 *
 *  ------------------------------------------------------------------
 *  WHAT THIS CONTRACT DELIBERATELY DOES NOT CARRY
 *  ------------------------------------------------------------------
 *  No token, anywhere. The session token is an HttpOnly cookie set by the
 *  server and never readable by script, so putting it in a response body would
 *  hand the browser a second copy in a place XSS can reach — undoing the only
 *  thing HttpOnly buys. What the browser gets instead is the session WINDOW
 *  (`SessionWindow`), which is enough to lock the screen at the right minute
 *  and nothing more.
 *
 *  No password hash either, in any direction. The hash is written by the
 *  server and read by the server; a shape that can express it is a shape
 *  somebody eventually fills in from a form. */

// ---------------------------------------------------------------------------
// The two axes that identify a person — mirrored from E2, in ASCII
// ---------------------------------------------------------------------------

/** Permission-matrix key — the SAME strings `@pv/engines` uses, re-declared
 *  here rather than imported.
 *
 *  Re-declared for the reason `problem.ts` re-declares `DenyReason`: a contract
 *  must not drag the engine in behind it. The two lists are now spelled
 *  identically, so `auth.mapper.ts` ASSERTS they are one union instead of
 *  translating between them — drift is still a red build, with no lookup table
 *  left to keep in step. These strings also go into `platform.actor.role_id`
 *  verbatim, so changing one is a migration, not a rename.
 *
 *  Order matches `DEFAULT_ROLE_PERMISSIONS` top to bottom: widest reach first. */
export const RoleId = z.enum([
  'director',
  'head-of-sales',
  'marketing',
  'bd',
  'presales',
  'sale',
  'account-executive',
])

/** Licensed product lines. NOT translated, and not an oversight — luật 14 fixes
 *  branch names as English product names on every screen, so the wire key and
 *  the label are already the same string. Inventing an ASCII alias here would
 *  create a second name for a thing that only has one. */
export const Branch = z.enum(['One', 'Sales', 'Supply', 'Factory', 'Finance'])

/** Permission-matrix key — the SAME strings `@pv/engines` uses, re-declared
 *  here for the reason `RoleId` above is re-declared: a contract must not drag
 *  the engine in behind it.
 *
 *  Identical spellings, so `auth.mapper.ts` ASSERTS the two unions are one
 *  instead of translating between them — drift is a red build with no lookup
 *  table left to keep in step.
 *
 *  Unlike `RoleId`, these strings DO travel and DO get stored: the server sends
 *  a person's resolved set on every `/auth/me`, and `platform.role_permission`
 *  keeps one row per granted pair. Renaming one is a migration.
 *
 *  Order matches `PERMISSIONS` in the engine, grouped by resource. */
export const Permission = z.enum([
  'campaign.view',
  'campaign.edit',
  'campaign.broadcast',
  'lead.view',
  'lead.edit',
  'lead.send-email',
  'lead.assign',
  'lead.convert',
  'lead.disqualify',
  'account.view',
  'account.edit',
  'opportunity.view',
  'opportunity.edit',
  'opportunity.close',
  'contract.view',
  'contract.edit',
  'contract.record-payment',
  'performance.view',
  'plan.view',
  'plan.submit',
  'config.view',
  'config.propose',
  'audit-log.view',
  'user.manage',
  'role.manage',
  'approval.decide',
  'data.export',
])

export type Permission = z.infer<typeof Permission>
export type RoleId = z.infer<typeof RoleId>
export type Branch = z.infer<typeof Branch>

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

/** Floor, in characters. Lives here rather than in the screen because both ends
 *  check it: the form so the user hears about it before a round trip, the
 *  server because a form is not a fence. */
export const PASSWORD_MIN = 10

/** A password ON ITS WAY IN — never normalised, never trimmed.
 *
 *  Every other text field in `primitives.ts` collapses whitespace, and doing
 *  that here would be a real bug: leading and trailing spaces are legitimate
 *  password characters, a password manager may well have generated some, and
 *  silently trimming them means the string that was stored is not the string
 *  the user typed. They would then be locked out by their own manager, with
 *  both sides insisting the password is right.
 *
 *  The cap is not a security control, it is a denial-of-service one: hashing
 *  cost grows with input length, so an unbounded field is a free CPU burner. */
export const password = z
  .string('Mật khẩu là bắt buộc')
  .min(PASSWORD_MIN, `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự`)
  .max(200, 'Mật khẩu tối đa 200 ký tự')

// ---------------------------------------------------------------------------
// Who is signed in
// ---------------------------------------------------------------------------

/** The person, as the browser is allowed to see them.
 *
 *  Same seven fields as `Actor` in `@pv/engines`, and that is load-bearing: the
 *  web session store feeds this object straight into E2, so a field renamed on
 *  one side and not the other is a permission check reading `undefined`. The
 *  API's mapper is the only place the two shapes meet. */
export const SessionActor = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  email: z.email(),
  /** Display label, with the industry in it ("Sale · chip"). Never bind a
   *  permission to this — that is what `roleId` is for. */
  role: z.string().min(1).max(120),
  roleId: RoleId,
  branches: z.array(Branch),
  ownOnly: z.boolean(),
})

/** When this session dies, and why there are two marks rather than one.
 *
 *  `expiresAt` is absolute and cannot be pushed out by working; `idleUntil` is
 *  the sitting-still mark and moves every time the person touches the screen.
 *  `null` means the sitting-still axis is off entirely — what "Ghi nhớ đăng nhập" buys.
 *
 *  The browser gets these so the lock screen can appear ON the right minute
 *  instead of on the next failed request. It is a HINT, not an authority: the
 *  server re-checks both marks on every call, and a clock skewed by an hour
 *  costs a confusing countdown, never an extra minute of access. */
export const SessionWindow = z.object({
  issuedAt: Moment,
  expiresAt: Moment,
  idleUntil: Moment.nullable(),
})

export const SessionView = z.object({
  actor: SessionActor,
  /** What the SIGNED-IN person may do today — resolved server-side from
   *  `platform.role_permission`, not worked out by the browser from `roleId`.
   *
   *  The browser used to keep its own copy of the role matrix and look the
   *  answer up. That was correct only while the two copies agreed, and once the
   *  matrix became editable at runtime nothing could keep them agreeing.
   *  Sending the resolved set deletes the second copy rather than trying to
   *  synchronise it.
   *
   *  On `SessionView` and NOT on `SessionActor`, which is the shape a person
   *  takes everywhere else — a row of the people book, an entry in the
   *  directory. Only the caller's own set is ever checked against anything; E2
   *  is asked about the person holding the session and never about a name in a
   *  picker. Hanging it on `SessionActor` would ship 27 strings per person on
   *  every roster read and tell everyone what everyone else may do, to answer
   *  a question nobody asks.
   *
   *  Only as good as the screen it paints: the server re-checks every call
   *  against the same table, so a tampered array buys a prettier button and a
   *  403. */
  permissions: z.array(Permission),
  session: SessionWindow,
  /** This person is holding a password they did not choose, and can do nothing
   *  until they do.
   *
   *  A BOOLEAN here while `UserRow` carries the timestamp, and the asymmetry is
   *  deliberate: the admin screen asks "since when" about somebody else, the
   *  browser asks "am I blocked" about itself and has no use for the date. It
   *  also keeps a mark an administrator set off the wire to the person it was
   *  set on.
   *
   *  On `SessionView` rather than `SessionActor` for the reason `permissions`
   *  is: `SessionActor` is the shape a person takes in a roster or a picker,
   *  and whether a colleague owes a password change is neither anybody's
   *  business nor any screen's question.
   *
   *  A HINT for routing, never the fence. `PasswordChangeGuard` re-checks the
   *  column on every request, so a tampered `false` buys a screen that renders
   *  and a 403 from everything on it. */
  mustChangePassword: z.boolean(),
})

/** How long a session lives, in milliseconds. ONE table, read by both ends.
 *
 *  The server is the only authority — it stamps `expires_at` and `idle_until`
 *  on the row, and re-checks them on every request. The browser reads the same
 *  numbers for a different job: arming the "phiên sắp hết hạn" countdown, which
 *  needs to know `warnBefore` and nothing else the server has.
 *
 *  Two copies of these numbers is the failure this constant exists to prevent,
 *  and it is a quiet one: the screen warns at two minutes left while the server
 *  already cut the session off at zero minus one, so the warning appears after
 *  the lock rather than before it. Nobody notices until a user complains that
 *  the countdown lies.
 *
 *  The values follow how an office actually uses an ERP, not any library's
 *  default: 30 minutes idle is long enough for a short meeting and short enough
 *  that a laptop left in a meeting room stops showing the whole team's lead
 *  book. 12 hours absolute is one working shift. 7 days is what ticking "Ghi
 *  nhớ đăng nhập" buys, and it turns the idle axis OFF entirely — a person who ticks that
 *  box is saying this machine is theirs, and keeping the idle mark for them
 *  means the box remembers nothing by the next morning. */
export const SESSION_LIMITS = {
  idle: 30 * 60_000,
  absolute: 12 * 60 * 60_000,
  remembered: 7 * 24 * 60 * 60_000,
  warnBefore: 2 * 60_000,
} as const

export type SessionActor = z.infer<typeof SessionActor>
export type SessionWindow = z.infer<typeof SessionWindow>
export type SessionView = z.infer<typeof SessionView>

// ---------------------------------------------------------------------------
// The four doors of the sign-in flow
// ---------------------------------------------------------------------------

export const SignInBody = z.object({
  email,
  password,
  /** Tick = the session moves to `localStorage` on the browser side and drops
   *  its idle mark on the server side. Both halves are what the tick means;
   *  doing only one leaves a box that remembers nothing until tomorrow. */
  remember: z.boolean().default(false),
})

/** Asking for a reset link. Answered with 204 whether or not the mailbox is
 *  known — see the service for why the honest-looking alternative is worse. */
export const ForgotPasswordBody = z.object({ email })

export const ResetPasswordBody = z.object({
  token: z.string().min(16).max(200),
  password,
})

/** Retype the password to open the sudo window before an admin action.
 *
 *  NO `email` FIELD, and that absence is the whole design. This door sits
 *  behind a live session, so the server already knows who is calling and the
 *  only thing left to prove is that it is still them. Accepting a mailbox would
 *  turn a confirmation box into a second sign-in door: whoever sits down at an
 *  abandoned machine would confirm with their OWN account and then act inside
 *  somebody else's session, and the audit row would carry the absent person's
 *  name.
 *
 *  Reuses `password` like every other door, `PASSWORD_MIN` included. The floor
 *  protects nothing here — a password shorter than today's floor still exists
 *  if the floor was once lower — but a separate schema just to relax it is a
 *  second declaration of one thing, and the second is what gets forgotten when
 *  the floor moves. Somebody meeting a 400 here does need to reset. */
export const ConfirmPasswordBody = z.object({ password })

/** Change your own password from inside a live session.
 *
 *  CARRIES THE OLD PASSWORD, and that field is the re-authentication — which is
 *  why this door is the one write on `platform.actor` with no `@NeedsReauth()`.
 *  Bolting the sudo dialog on top would ask for the same secret twice in one
 *  submit, and `reauth.guard.ts` already names the cost of that habit: it
 *  teaches people to type their password into any box that appears.
 *
 *  `newPassword` is checked against `current` on the server rather than here.
 *  A cross-field `refine` would put the comparison in the browser's copy of the
 *  schema too, and a rule about a secret belongs on the side that holds it. */
export const PasswordChangeBody = z.object({
  currentPassword: password,
  newPassword: password,
})

/** What the reset screen may show before the new password is typed.
 *
 *  The mailbox only, and only for a token that is currently valid. It exists so
 *  the screen can greet the right person rather than asking them to trust an
 *  opaque link — and it carries nothing else, because whoever holds the link is
 *  not yet proven to be that person. */
export const ResetTicketView = z.object({ email: z.email() })

export type SignInBody = z.infer<typeof SignInBody>
export type ConfirmPasswordBody = z.infer<typeof ConfirmPasswordBody>
export type PasswordChangeBody = z.infer<typeof PasswordChangeBody>
export type ForgotPasswordBody = z.infer<typeof ForgotPasswordBody>
export type ResetPasswordBody = z.infer<typeof ResetPasswordBody>
export type ResetTicketView = z.infer<typeof ResetTicketView>

// ---------------------------------------------------------------------------
// The people book — manager only
// ---------------------------------------------------------------------------

/** One row of the admin table. `SessionActor` plus the three facts that only
 *  an administrator has any business seeing. */
export const UserRow = SessionActor.extend({
  /** Whether this account can be signed into at all. An account created by a
   *  manager has no password until its owner sets one, and that state is
   *  ordinary rather than broken — it is what the invite mail is for. */
  passwordSet: z.boolean(),
  /** Locked out, and WHEN. A timestamp rather than a boolean because "since
   *  when" is the question actually asked about a locked account, and a
   *  boolean answers it with a shrug. `null` = active. */
  disabledAt: Moment.nullable(),
  /** Holding a password somebody else chose, and SINCE WHEN. `null` = the owner
   *  picked their own.
   *
   *  Next to `disabledAt` because the two are read the same way — both are
   *  states an administrator put the account into, and both answer "since
   *  when". They are not the same state though: a locked account cannot sign
   *  in at all, this one signs in and lands on a single screen. */
  mustChangePasswordAt: Moment.nullable(),
  createdAt: Moment,
})

export const UserListResponse = z.object({ rows: z.array(UserRow) })

// ---------------------------------------------------------------------------
// The directory — everybody with a live session
// ---------------------------------------------------------------------------

/** WHO WORKS HERE — the roster every screen that names a colleague reads.
 *
 *  ------------------------------------------------------------------
 *  WHY THIS IS NOT `UserListResponse` WITH A SOFTER PERMISSION
 *  ------------------------------------------------------------------
 *  `GET /users` answers "who has an account, and what state is it in" — it
 *  carries `passwordSet`, `disabledAt` and `createdAt`, which are facts about
 *  ADMINISTERING a person, and it is gated on `user.manage` for exactly
 *  that reason. This answers a different question that every Sale asks a dozen
 *  times a day: who can I hand this lead to, who owns that opportunity, whose
 *  name goes in this select. Answering it with the admin shape would mean
 *  either handing lock states to the whole company or hiding the roster from
 *  the people whose screens are built out of it.
 *
 *  So the shape is `SessionActor` exactly — the same seven fields the browser
 *  already holds for the signed-in person, no more. That is load-bearing on the
 *  web side too: E2 and the assignment helpers take `Actor`, and a roster
 *  missing a field would have every caller widening a signature to accept it.
 *
 *  ------------------------------------------------------------------
 *  DISABLED ACCOUNTS ARE ABSENT, AND THAT IS A DECISION
 *  ------------------------------------------------------------------
 *  Every use of this list is a choice about the FUTURE — assign work, pick an
 *  owner, name an approver. Offering somebody who cannot sign in is offering a
 *  task that will never be picked up. Rows already carrying a locked person's
 *  name still render that name (it is stored on the row, not looked up here),
 *  so the past does not lose its author. */
export const DirectoryResponse = z.object({ rows: z.array(SessionActor) })

/** Creating a person. No password field, deliberately — a manager who types
 *  somebody's first password knows it, and from then on nothing that account
 *  does can be pinned on its owner alone. The invite link is the only way in. */
export const UserCreate = z.object({
  name: textInput(200),
  email,
  role: textInput(120),
  roleId: RoleId,
  /** `One` is added by the server if absent — every account needs the core to
   *  see any screen at all, and a person who cannot open the home page is not
   *  a useful account. */
  branches: z.array(Branch).max(5),
  ownOnly: z.boolean().default(false),
})

/** Editing a person. Every field optional; `email` is absent on purpose —
 *  changing a mailbox is changing who can receive the reset link for an
 *  account, which is an account takeover wearing a form field. Retiring the
 *  old account and inviting the new address is the path that leaves a trail. */
export const UserPatch = z
  .object({
    name: textInputOptional(200),
    role: textInputOptional(120),
    roleId: RoleId.optional(),
    branches: z.array(Branch).max(5).optional(),
    ownOnly: z.boolean().optional(),
    /** `true` locks the account and kills every live session it holds;
     *  `false` unlocks it. Absent leaves the lock exactly as it was. */
    disabled: z.boolean().optional(),
  })
  .refine((p) => Object.values(p).some((v) => v !== undefined), {
    message: 'Không có gì để sửa.',
  })

/** The answer to "send this person a set-password link".
 *
 *  `link` comes back ONLY on a machine whose outbound mail door is shut
 *  (`PV_EMAIL_ENABLED=false`), where no letter can reach anybody and the
 *  manager would otherwise be stuck. With the door open the field is absent,
 *  because a link that reaches the screen is a link in a log, a screenshot and
 *  a support chat — and this one sets a password. */
export const InviteView = z.object({
  sent: z.boolean(),
  link: z.string().optional(),
})

export type UserRow = z.infer<typeof UserRow>
export type UserListResponse = z.infer<typeof UserListResponse>
export type DirectoryResponse = z.infer<typeof DirectoryResponse>
export type UserCreate = z.infer<typeof UserCreate>
export type UserPatch = z.infer<typeof UserPatch>
export type InviteView = z.infer<typeof InviteView>
