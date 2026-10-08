import { Controller, Delete, Get, HttpCode, Post, Query, Redirect } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import type { GoogleConnectStart, GoogleLinkStatus } from '@pv/contracts'
import { Need } from '../access/need.decorator'
import { CurrentActor } from '../session/current-actor.decorator'
import { GoogleService } from './google.service'

/** `/me/google` — the caller's own Google link (contract: `google.ts`).
 *
 *  All four are `@Need({})`, "just be signed in", the `/auth/confirm-password`
 *  convention: the only subject is the caller, so there is no permission to ask.
 *
 *  The callback is a browser navigation back from Google, and it still carries
 *  the session: the cookie is first-party to the API host on a top-level GET
 *  (`SameSite=None` in production, `Lax` locally), and `CrossSiteGuard` waves
 *  reads through. So the callback knows who is calling from the session AND
 *  checks the signed state names that same person — not `@Public()`. */
@Controller('me/google')
export class GoogleController {
  constructor(private readonly google: GoogleService) {}

  @Get()
  @Need({})
  status(@CurrentActor() who: Actor): Promise<GoogleLinkStatus> {
    return this.google.status(who)
  }

  @Post('connect')
  @HttpCode(200)
  @Need({})
  connect(@CurrentActor() who: Actor): GoogleConnectStart {
    return this.google.connect(who)
  }

  @Get('callback')
  @Need({})
  @Redirect()
  async callback(
    @CurrentActor() who: Actor,
    @Query('code') code: unknown,
    @Query('state') state: unknown,
    @Query('error') error: unknown,
  ): Promise<{ url: string; statusCode: number }> {
    const url = await this.google.callback(who, {
      ...(typeof code === 'string' ? { code } : {}),
      ...(typeof state === 'string' ? { state } : {}),
      ...(typeof error === 'string' ? { error } : {}),
    })
    return { url, statusCode: 302 }
  }

  @Delete()
  @HttpCode(204)
  @Need({})
  disconnect(@CurrentActor() who: Actor): Promise<void> {
    return this.google.disconnect(who)
  }
}
