import { eq } from 'drizzle-orm'
import { Inject, Injectable } from '@nestjs/common'
import { DB, type Db } from '../db/db.module'
import { googleLink, type GoogleLinkRowDb, type GoogleLinkValues } from './google.schema'

/** SQL of `platform.google_link`. Stores what it is given — the token arrives
 *  already sealed (`google-crypto.ts`); this file never sees plaintext. */
@Injectable()
export class GoogleRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async byActor(actorId: string): Promise<GoogleLinkRowDb | null> {
    const [row] = await this.db
      .select()
      .from(googleLink)
      .where(eq(googleLink.actorId, actorId))
      .limit(1)
    return row ?? null
  }

  /** Reconnecting replaces the row: one link per actor (primary key). `scope`
   *  is read back by `mailReadinessOf` to tell whether Gmail was consented. */
  async save(values: GoogleLinkValues): Promise<void> {
    await this.db
      .insert(googleLink)
      .values(values)
      .onConflictDoUpdate({
        target: googleLink.actorId,
        set: {
          googleEmail: values.googleEmail,
          refreshTokenEnc: values.refreshTokenEnc,
          scope: values.scope,
          connectedAt: new Date(),
        },
      })
  }

  async remove(actorId: string): Promise<void> {
    await this.db.delete(googleLink).where(eq(googleLink.actorId, actorId))
  }
}
