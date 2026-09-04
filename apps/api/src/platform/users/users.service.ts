import { Inject, Injectable, Logger } from '@nestjs/common'
import {
  ROLE_PERMISSIONS,
  type Actor,
  type Permission,
  type RoleId as EngineRoleId,
} from '@pv/engines'
import {
  DirectoryResponse,
  InviteView,
  UserListResponse,
  UserRow,
  type UserCreate,
  type UserPatch,
} from '@pv/contracts'
import { toEngineRole, toSessionActor } from '../auth/auth.mapper'
import { AuthService } from '../auth/auth.service'
import { ENV, type Env } from '../config/env'
import type { Db } from '../db/db.module'
import type { ActorRow } from '../db/platform.schema'
import { isDbConstraint } from '../http/db-error'
import { conflict, denied, notFound } from '../http/problem'
import { toActorColumns, toActorDraft, toUserRow } from './users.mapper'
import { UsersRepository } from './users.repository'

// ---------------------------------------------------------------------------
// Facts this module derives once, at load
// ---------------------------------------------------------------------------

/** The name Postgres reports for `platform.actor`'s primary key. Copied from
 *  `drizzle/0000_reflective_legion.sql` — a `PRIMARY KEY` with no explicit name
 *  gets `<table>_pkey`, and the migration is the only file that says for
 *  certain what reached the database. Getting it wrong turns the id hunt in
 *  `create` into a 500 on the first collision instead of a second attempt. */
const ACTOR_PK = 'actor_pkey'

/** How many ids to try before giving up. Twenty-five 'Hà's in one company is
 *  not a race to ride out, it is a naming scheme that no longer fits — and an
 *  unbounded loop against a primary key is a request that never returns. */
const ID_ATTEMPTS = 25

/** The permission that makes somebody an administrator of people.
 *
 *  Typed as `Permission`, so a misspelling — a plain letter where a Vietnamese
 *  one belongs, a missing tone mark — is a compile error rather than a rule
 *  that quietly matches nobody and lets the last administrator be locked out.
 *  That is the same guard `@Need` gets in the controller, which is why the key
 *  is written out in both places rather than imported from one: `tsc` checks
 *  each against `PERMISSIONS`, and a shared constant would only move where the
 *  literal is written, not what checks it. */
const MANAGE_USERS: Permission = 'người-dùng.quản-lý'

/** Which roles can administer people, read out of the permission matrix.
 *
 *  Computed rather than listed — see the class docblock. `Object.keys` needs
 *  the cast because TypeScript types it as `string[]` for soundness reasons
 *  that do not apply to a `Record` literal declared in the same package as its
 *  key union. */
const KEYHOLDER_ROLES: EngineRoleId[] = (Object.keys(ROLE_PERMISSIONS) as EngineRoleId[]).filter(
  (role) => ROLE_PERMISSIONS[role].includes(MANAGE_USERS),
)

/** Can this person open accounts, right now. Both halves matter: a locked
 *  administrator holds a role that grants everything and can do none of it. */
const holdsKeys = (roleId: EngineRoleId, disabledAt: Date | null): boolean =>
  disabledAt === null && KEYHOLDER_ROLES.includes(roleId)

/** Vietnamese text → an ASCII handle fit for a primary key, a URL and a log.
 *
 *  `NFD` splits a letter into its base and its combining marks so a single
 *  `\p{Diacritic}` class removes every tone and hat at once; `đ`/`Đ` are the
 *  one pair that has no combining form and must be named. Same three lines the
 *  fixtures use to build mail addresses out of names.
 *
 *  Everything that is not a letter or a digit becomes a hyphen, runs collapse,
 *  and the ends are trimmed — an id ending in a hyphen would collide with the
 *  `-2`, `-3` suffixes the collision hunt appends. Capped well under
 *  `SessionActor.id`'s 64 characters so that suffix always has room. */
function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
}

/** THE PEOPLE BOOK'S RULES. Knows the repository AND the engine; never sees HTTP.
 *
 *  ------------------------------------------------------------------
 *  WHY THE FENCES ARE HERE AND NOT ONLY ON THE SCREEN
 *  ------------------------------------------------------------------
 *  `apps/web/src/pages/users-parts.tsx` already greys out the controls that
 *  would let a manager demote or lock themselves. That is a courtesy, and it is
 *  worth having — a button that refuses after the click teaches people that the
 *  system is arbitrary. It is not a fence: the same request goes over the wire
 *  from `curl` with the same cookie, and the account it would break is the one
 *  that opens accounts for everybody else.
 *
 *  ------------------------------------------------------------------
 *  WHO COUNTS AS AN ADMINISTRATOR IS COMPUTED, NEVER LISTED
 *  ------------------------------------------------------------------
 *  `KEYHOLDER_ROLES` below is derived from `ROLE_PERMISSIONS`, so the day a
 *  seventh role is added to E2 with `người-dùng.quản-lý` in its row, the
 *  sole-administrator rule counts it without anybody remembering to come here.
 *  Writing `['director', 'head-of-sales']` by hand is the same class of mistake
 *  the matrix itself avoids by spelling those two rows as `PERMISSIONS` rather
 *  than enumerating them: a permission added in one place and forgotten in the
 *  other is invisible until it matters. */
@Injectable()
export class UsersService {
  private readonly log = new Logger('users')

  constructor(
    private readonly repo: UsersRepository,
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  async list(): Promise<UserListResponse> {
    const rows = await this.repo.all()
    /* Validate what we are ABOUT TO SEND with the contract, for the reason
       `SalesConfigService.bundle` gives: a column that changed type, or a
       field the mapper forgot, both compile fine if the mapper drifted with
       them — and neither survives this line. The cost is bounded by the size
       of the staff book, a few dozen rows. */
    return UserListResponse.parse({ rows: rows.map(toUserRow) })
  }

  /** The roster, for anybody holding a live session.
   *
   *  `toSessionActor` rather than `toUserRow` is the whole difference, and it
   *  is not a trimming step applied after the fact: the mapper cannot put a
   *  lock state or a password flag into the shape it builds, so this door has
   *  nowhere to leak one even if the contract were loosened later. Same
   *  property `toActor` gives the guard, and the reason both exist.
   *
   *  Validated on the way out for the reason `list` gives above — a column that
   *  changed type and a mapper that drifted with it both compile. */
  async directory(): Promise<DirectoryResponse> {
    const rows = await this.repo.active()
    return DirectoryResponse.parse({ rows: rows.map(toSessionActor) })
  }

  // -------------------------------------------------------------------------
  // Opening an account
  // -------------------------------------------------------------------------

  /** Open an account for somebody. No password — ever.
   *
   *  `UserCreate` has no password field and this method has no way to set one;
   *  the new row leaves here with `password_hash IS NULL`, which the screen
   *  prints as "Chờ đặt mật khẩu" and the invite door turns into a link. The
   *  contract states the reason and it is about evidence, not convenience: a
   *  manager who types somebody's first password knows it, and from that moment
   *  nothing the account does can be pinned on its owner alone.
   *
   *  ------------------------------------------------------------------
   *  THE ID HUNT — WHY IT IS A RETRY LOOP AND NOT A `SELECT max(...)`
   *  ------------------------------------------------------------------
   *  `platform.actor.id` is a `text` primary key with no default, and the rows
   *  already in the book are hand-picked and readable: `u-ha`, `u-nam`,
   *  `u-chau`. They are read by humans in audit lines, in `owner_id` columns
   *  and in URLs, so a `uuid` here would be a regression that nobody can undo
   *  later — ids are permanent by construction.
   *
   *  So one is derived from the name (see `seedFor`), and the collisions that
   *  naming scheme obviously produces are resolved by ASKING THE PRIMARY KEY.
   *  Reading the book first and picking a free id is the same check-then-act
   *  every race in this repo is written up as: two managers pressing create at
   *  the same instant read the same book, choose the same `u-ha-2`, and the
   *  second one gets a 500 from a constraint the first one thought they had
   *  checked. Here the INSERT is the question; `actor_pkey` coming back means
   *  "taken, try the next one", which is the only answer that is still true at
   *  the moment it is used.
   *
   *  Every attempt is its own transaction, because a failed INSERT aborts the
   *  one it ran in and nothing further can be done inside it. */
  async create(who: Actor, body: UserCreate): Promise<UserRow> {
    const seed = this.seedFor(body)

    for (let attempt = 1; attempt <= ID_ATTEMPTS; attempt++) {
      const id = attempt === 1 ? `u-${seed}` : `u-${seed}-${attempt}`
      try {
        const row = await this.repo.run(async (tx) => {
          const saved = await this.repo.insert(tx, toActorDraft(id, body))
          /* The account and the record of who opened it are ONE act. An actor
             row nobody can attribute is the row that gets asked about later,
             and `platform.audit` is the only place that answer lives. */
          await this.repo.writeNote(
            {
              actorId: who.id,
              action: 'sửa',
              code: saved.id,
              note: `mở tài khoản ${saved.id} · ${saved.email} · vai=${saved.roleId} · nhánh=${saved.branches.join('/')}`,
            },
            tx,
          )
          return saved
        })
        return UserRow.parse(toUserRow(row))
      } catch (error: unknown) {
        /* Anything that is NOT the id colliding belongs to somebody else: a
           duplicate mailbox travels on to `ProblemFilter`, which turns
           `actor_email_unique` into a 409 pointing at the `email` box through
           the book in `users.constraints.ts`. */
        if (!isDbConstraint(error, ACTOR_PK)) throw error
      }
    }

    /* Twenty-five people whose names reduce to the same handle is not a race,
       it is a naming scheme that has run out. Say so plainly rather than
       looping forever or falling back to a random id nobody can read. */
    throw conflict(
      `Không sinh được mã tài khoản từ tên này — đã có quá nhiều tài khoản mang mã "u-${seed}". Đổi cách viết tên, hoặc nhờ quản trị hệ thống đặt mã tay.`,
      { name: ['Tên này trùng mã với quá nhiều tài khoản đã có.'] },
    )
  }

  // -------------------------------------------------------------------------
  // Editing a person
  // -------------------------------------------------------------------------

  /** Edit one person. Four rules, and every one of them is about not locking
   *  the company out of its own administration.
   *
   *  ------------------------------------------------------------------
   *  A ROLE CHANGE NEEDS NO REVOCATION — VERIFIED, NOT ASSUMED
   *  ------------------------------------------------------------------
   *  `AuthRepository.sessionByTokenHash` INNER JOINs `platform.actor` on every
   *  authenticated request and `AuthService.resolve` hands the row it read
   *  straight to `toActor`, so `req.actor.roleId` is re-read from the table on
   *  each call. A role edited now is in force on the person's very next
   *  request, in either direction — widened or narrowed. Nothing is cached, so
   *  there is nothing to invalidate.
   *
   *  This is written down because the next reader will otherwise add a revoke
   *  "to be safe", and the cost of that is not theoretical: every job-title
   *  edit would sign the person out mid-task, so managers would learn to avoid
   *  editing job titles.
   *
   *  Locking is the opposite case and does need one — see below.
   *
   *  ------------------------------------------------------------------
   *  THE CHECKS RUN INSIDE THE TRANSACTION, NOT IN FRONT OF IT
   *  ------------------------------------------------------------------
   *  "Is this the last administrator" is only true for as long as nobody else
   *  is answering the same question. Asking before opening the transaction —
   *  or inside one without holding the book — leaves a window in which two
   *  managers each see one other administrator and each remove one, ending with
   *  zero. `lockPeopleBook` is what closes it, and its docblock says why the
   *  lock is one advisory lock rather than a row lock on everybody counted. */
  async patch(who: Actor, id: string, body: UserPatch): Promise<UserRow> {
    this.refuseSelfSabotage(who, id, body)

    const row = await this.repo.run(async (tx) => {
      /* FIRST statement of the transaction, before any row is read. Everything
         below is a read-then-write over the same handful of rows, and this is
         what makes the whole sequence one indivisible edit of the book. */
      await this.repo.lockPeopleBook(tx)

      const target = await this.repo.byIdForUpdate(tx, id)
      if (!target) throw notFound('người dùng', id)

      await this.assertSomebodyKeepsTheKeys(tx, target, body)

      const columns = toActorColumns(body)
      /* Locking an account that is already locked must NOT move "khoá từ bao
         giờ". The first stamp is the honest one and the screen prints it
         ("Đang khoá · 12/08"); a double-clicked button or a retried request
         would otherwise quietly rewrite the date somebody is relying on. Same
         rule `revokeByTokenHash` states for `revoked_at`. */
      if (body.disabled === true && target.disabledAt !== null) delete columns.disabledAt

      /* Can be empty — `{"disabled": true}` on an already-locked account leaves
         nothing to write once the stamp above is frozen. Drizzle refuses an
         UPDATE with an empty SET, and there is nothing to update anyway. */
      const saved =
        Object.keys(columns).length > 0 ? await this.repo.update(tx, id, columns) : target

      /* ------------------------------------------------------------------
         LOCKING REVOKES, IN THE SAME UNIT OF WORK AS THE FLAG
         ------------------------------------------------------------------
         A lock that leaves the person browsing for another thirty minutes is
         not a lock, and thirty minutes is the good case: a remembered session
         has no idle mark at all and runs for seven days. The session guard
         does re-read `disabled_at` on every request, so the two halves agree
         either way — but the revocation is what makes the lock instantaneous
         instead of "instantaneous provided that check is never relaxed", and
         it is what the screen already promises out loud ("mọi phiên đang mở đã
         bị cắt").

         Run unconditionally on `disabled: true`, including the re-lock that
         wrote no columns above: the statement matches zero rows when there is
         nothing live, which costs one round trip and removes the branch where
         somebody has to be right about that. */
      if (body.disabled === true) {
        const killed = await this.auth.revokeAllSessions(target.id, tx)
        this.log.log(`Khoá tài khoản · ${target.id} · thu hồi ${killed} phiên`)
      }

      await this.repo.writeNote(
        { actorId: who.id, action: 'sửa', code: target.id, note: this.noteFor(target, body) },
        tx,
      )
      return saved
    })

    return UserRow.parse(toUserRow(row))
  }

  // -------------------------------------------------------------------------
  // The way in
  // -------------------------------------------------------------------------

  /** Send somebody a set-password link.
   *
   *  ------------------------------------------------------------------
   *  THE LINK COMES BACK ONLY WHEN NO LETTER CAN LEAVE THE MACHINE
   *  ------------------------------------------------------------------
   *  `InviteView.link` states the condition and this is the one place that
   *  applies it: with `PV_EMAIL_ENABLED=true` a letter reaches the person, so
   *  the manager needs nothing, and a link that reaches the screen instead ends
   *  up in a log aggregator, a screenshot and a support chat — and this one
   *  sets a password. With the door shut no letter can reach anybody, the
   *  manager IS the delivery mechanism, and refusing to hand it over would mean
   *  the account can never be opened at all.
   *
   *  `sent` says whether a letter was actually handed to the mail pipeline, so
   *  it tracks the door rather than being hardcoded true. The screen reads the
   *  pair as three distinct answers — link, or sent, or "the server could do
   *  neither" — and a `sent: true` on a machine that posts nothing would make
   *  the manager wait for a letter that was never written.
   *
   *  The raw token never enters this file. `AuthService.sendInvite` mints it
   *  and hands it to `RESET_MAILER` without it crossing the module boundary,
   *  which is rule 2 of `reset-mailer.ts` held at the type level rather than by
   *  care. */
  async invite(who: Actor, id: string): Promise<InviteView> {
    const target = await this.repo.byId(id)
    if (!target) throw notFound('người dùng', id)

    /* A ticket for a locked account is a link that is dead the moment it is
       clicked — `AuthService` refuses every reset ticket whose actor is
       disabled, precisely so that locking somebody cannot be walked back
       through the door an administrator just shut. Issuing one anyway would
       look like success here and fail silently a day later in somebody else's
       browser, so the refusal belongs at the press of the button. */
    if (target.disabledAt) {
      throw conflict(
        `Tài khoản của ${target.name} đang bị khoá — thư đặt mật khẩu gửi đi cũng không dùng được. Mở khoá trước, rồi gửi lại.`,
      )
    }

    const issued = await this.auth.sendInvite({
      id: target.id,
      name: target.name,
      email: target.email,
    })

    /* No transaction to join: the ticket was written by `AuthService` through
       its own handle. And note what this line does NOT carry — the note says
       that a letter was posted, never the token or the link. A credential in
       an append-only table is a credential with no expiry policy and a
       `ghi-vết.xem` audience wider than the mailbox it was meant for. */
    await this.repo.writeNote({
      actorId: who.id,
      action: 'sửa',
      code: target.id,
      note: `gửi thư đặt mật khẩu tới ${target.email}`,
    })

    return InviteView.parse({
      sent: this.env.PV_EMAIL_ENABLED,
      ...(this.env.PV_EMAIL_ENABLED ? {} : { link: issued.link }),
    })
  }

  // -------------------------------------------------------------------------
  // The two fences
  // -------------------------------------------------------------------------

  /** RULE 1 · nobody edits their own role or their own lock.
   *
   *  A manager who demotes themselves, or locks themselves out of the only
   *  account holding `người-dùng.quản-lý`, leaves a system nobody can
   *  administer — no invite can be sent, no role can be granted, and the way
   *  back is somebody with database credentials editing `platform.actor` by
   *  hand. That is a bad afternoon at best and an outage at worst, and it is
   *  reachable with one careless click.
   *
   *  Everything else on your own row is fine and stays fine: renaming yourself,
   *  relabelling your own job title, even narrowing your own `ownOnly` locks
   *  nobody out — it costs you rows you can see, and it is undone by any other
   *  administrator, or by widening it back.
   *
   *  The refusal is on the FIELD BEING PRESENT, not on it differing from what
   *  is already stored. A body that re-sends your current role is
   *  indistinguishable in intent from one that changes it, and any "only if
   *  different" test has to trust a comparison against a row that can change
   *  between the read and the write. The screen sends only what actually
   *  changed (`diffUser`), so the strict version costs a real manager nothing.
   *
   *  403 rather than 400: the body is well-formed, the caller is simply not
   *  allowed to be the one asking. `permission-denied` also lands on the branch
   *  of `apps/web/src/app/api/errors.ts` that keeps the person where they are
   *  instead of bouncing them to the sign-in screen. */
  private refuseSelfSabotage(who: Actor, id: string, body: UserPatch): void {
    if (who.id !== id) return

    const refused: string[] = []
    if (body.roleId !== undefined) refused.push('vai')
    if (body.disabled !== undefined) refused.push('trạng thái khoá')
    if (refused.length === 0) return

    throw denied(
      'permission-denied',
      `Bạn không tự đổi ${refused.join(' và ')} của chính mình được — nhờ một quản trị viên khác làm việc này. Một người tự hạ vai hoặc tự khoá mình có thể để lại một hệ thống không ai mở tài khoản được nữa.`,
    )
  }

  /** RULE 2 · the last enabled administrator cannot be demoted or locked.
   *
   *  Same failure as rule 1 approached from the other side: rule 1 stops you
   *  removing yourself, this stops you removing the last other person. Neither
   *  alone is enough — two administrators can each demote the other, and one
   *  administrator can be demoted by nobody but is still reachable through the
   *  lock button on somebody else's screen.
   *
   *  "Administrator" is `ROLE_PERMISSIONS[roleId]` containing
   *  `người-dùng.quản-lý` and `disabled_at IS NULL`, computed at module load
   *  from the engine — a locked administrator administers nothing, and a role
   *  that gains the permission tomorrow is counted tomorrow without an edit
   *  here.
   *
   *  Only checked when the target is LOSING the keys. Widening somebody's role,
   *  unlocking them, or renaming anybody at all cannot reduce the count, so
   *  those never pay for the extra query.
   *
   *  Correct only while `lockPeopleBook` is held — the caller takes it as the
   *  first statement of the transaction, and this method reads the world that
   *  lock is holding still. */
  private async assertSomebodyKeepsTheKeys(
    tx: Db,
    target: ActorRow,
    body: UserPatch,
  ): Promise<void> {
    if (!holdsKeys(target.roleId, target.disabledAt)) return

    const nextRoleId = body.roleId === undefined ? target.roleId : toEngineRole(body.roleId)
    const nextDisabledAt =
      body.disabled === undefined ? target.disabledAt : body.disabled ? new Date() : null
    if (holdsKeys(nextRoleId, nextDisabledAt)) return

    const others = await this.repo.enabledIdsWithRoles(tx, target.id, KEYHOLDER_ROLES)
    if (others.length > 0) return

    /* No `fields`: the lock button has no box to turn red, and the panel prints
       the title in its footer for exactly this case. */
    throw conflict(
      `${target.name} là tài khoản quản trị cuối cùng còn hoạt động. Mở hoặc mở khoá một tài khoản quản trị khác trước, rồi hãy hạ vai hoặc khoá tài khoản này — nếu không sẽ không còn ai mở được tài khoản cho người khác.`,
    )
  }

  // -------------------------------------------------------------------------
  // Small parts
  // -------------------------------------------------------------------------

  /** The readable half of a new actor id, ASCII, derived from the name.
   *
   *  The LAST word of the name, which in Vietnamese is the given name and the
   *  one people are actually called by — the convention every seeded row
   *  already follows ('Trần Thu Hà' → `u-ha`, 'Lê Hoàng Nam' → `u-nam`, 'Vũ
   *  Minh Châu' → `u-chau`). Matching the existing rows matters more than any
   *  scheme's elegance: the book has to read as one book five years from now.
   *
   *  Diacritics are stripped because this string travels in URLs, log lines and
   *  `owner_id` columns across two schemas, and a percent-encoded id is an id
   *  nobody can type or recognise. It is NOT display text — the name itself is
   *  stored with its diacritics intact, in `name`.
   *
   *  Two fallbacks, then a refusal. A name written in a script with no Latin
   *  letters at all reduces to nothing, and inventing `u-` plus a random number
   *  would defeat the entire reason this is not a `uuid`; the mailbox is the
   *  next-best readable handle the row already carries. If even that is empty
   *  the request is refused and names the box to fix, which is honest — an
   *  unreadable id would be permanent, and a refusal is not. */
  private seedFor(body: UserCreate): string {
    const words = body.name.split(/\s+/).filter((w) => w !== '')
    const fromGivenName = slug(words[words.length - 1] ?? '')
    if (fromGivenName) return fromGivenName

    const fromWholeName = slug(body.name)
    if (fromWholeName) return fromWholeName

    const fromMailbox = slug(body.email.split('@')[0] ?? '')
    if (fromMailbox) return fromMailbox

    throw conflict('Không sinh được mã tài khoản từ tên này. Thêm phần tên viết bằng chữ Latinh.', {
      name: ['Tên phải có ít nhất một chữ cái Latinh hoặc chữ số để sinh mã tài khoản.'],
    })
  }

  /** What a patch DID, in one line of the audit trail.
   *
   *  Names the fields that were touched and their new values, because "sửa
   *  người dùng u-ha" alone answers none of the questions the trail is read to
   *  answer. No token, no link, no password — nothing in `UserPatch` can carry
   *  one, and this method is written against `UserPatch` rather than against
   *  the row so it cannot start doing so. */
  private noteFor(target: ActorRow, body: UserPatch): string {
    const parts: string[] = []
    if (body.name !== undefined) parts.push(`tên=${body.name}`)
    if (body.role !== undefined) parts.push(`nhãn vai=${body.role}`)
    if (body.roleId !== undefined) parts.push(`vai=${body.roleId}`)
    if (body.branches !== undefined) parts.push(`nhánh=${body.branches.join('/')}`)
    if (body.ownOnly !== undefined) parts.push(`phạm vi=${body.ownOnly ? 'chỉ của mình' : 'cả sổ'}`)
    if (body.disabled !== undefined) parts.push(body.disabled ? 'khoá' : 'mở khoá')
    return `sửa người dùng ${target.id} · ${parts.join(' · ')}`
  }
}
