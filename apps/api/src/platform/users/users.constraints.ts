import type { ConstraintBook } from '../http/db-error'

/** The one constraint on `platform.actor` a person can walk into, and the
 *  sentence they get instead of "Máy chủ gặp sự cố.".
 *
 *  ------------------------------------------------------------------
 *  WHY NOT A `SELECT` BEFORE THE `INSERT`
 *  ------------------------------------------------------------------
 *  Asking "is this mailbox taken" and then inserting is the same check-then-act
 *  every other race in this repo is written up as: two managers opening an
 *  account for the same new hire both read "free" and both proceed, and the
 *  second one gets a 500 from a UNIQUE index instead of the 409 the first
 *  reader thought they had covered. The index is the only thing that can answer
 *  the question at the moment the answer is used, so the index is what answers
 *  it — this book only translates its verdict.
 *
 *  A pre-check would also be a mailbox oracle on a door that already refuses
 *  everyone without `người-dùng.quản-lý`, so nothing is lost by not having one.
 *
 *  ------------------------------------------------------------------
 *  THE KEY IS THE NAME POSTGRES REPORTS, NOT THE DRIZZLE VARIABLE
 *  ------------------------------------------------------------------
 *  `actor_email_unique` is copied from `drizzle/0000_reflective_legion.sql`,
 *  the only place that says for certain what reached the database. Getting the
 *  key wrong breaks nothing — `fromDbError` falls back to the generic sentence
 *  for SQLSTATE 23505 and still answers 409 — it only loses the part that names
 *  the box to turn red.
 *
 *  `actor_pkey` is deliberately ABSENT. The people book collides with it on
 *  purpose while hunting for a free id (see `UsersService.create`), catches it
 *  by name and retries; a message in this book would only be read on the path
 *  where that hunt has already given up, and that path throws its own, more
 *  specific refusal. */
export const ACTOR_CONSTRAINTS: ConstraintBook = {
  actor_email_unique: {
    kind: 'conflict',
    fields: ['email'],
    message:
      'Hòm thư này đã thuộc về một tài khoản khác. Một hòm thư chỉ mở được một tài khoản — tìm người đó trong sổ, hoặc dùng địa chỉ khác.',
  },
}
