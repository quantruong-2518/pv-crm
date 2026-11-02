import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import {
  AssistantIdParams,
  AssistantReportBody,
  AssistantReportQuery,
  AssistantSessionListQuery,
  AssistantSessionPatchBody,
  AssistantTurnBody,
} from '@pv/contracts'
import type { Actor } from '@pv/engines'
import { Need } from '../access/need.decorator'
import { zod } from '../http/zod.pipe'
import { CurrentActor } from '../session/current-actor.decorator'
import { openTurnStream } from './assistant-stream'
import { ASSISTANT_NEED, AssistantTurns } from './assistant-turns'
import { AssistantService } from './assistant.service'

/** `/assistant` — the CRM assistant chat, wave 1 (contract: `assistant-http.ts`).
 *
 *  Every door but two needs `assistant.use` on the Sales branch: the owner tries
 *  it alone first, and the matrix opens it to a role. `availability` is "just be
 *  signed in", since it is the question of whether to show the button. `reports`
 *  needs `assistant.review`: it shows answers of other people's chats. */
@Controller('assistant')
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly turns: AssistantTurns,
  ) {}

  @Get('availability')
  @Need({})
  availability(@CurrentActor() who: Actor) {
    return this.assistant.availability(who)
  }

  /** `text/event-stream` of `AssistantEvent`. Validation and a foreign session
   *  answer as plain HTTP; once the stream is open, errors are events. */
  @Post('turns')
  @Need(ASSISTANT_NEED)
  async turn(
    @CurrentActor() who: Actor,
    @Body(zod(AssistantTurnBody)) body: AssistantTurnBody,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const session = await this.turns.sessionOf(who, body)
    const stream = openTurnStream(reply)
    await this.turns.run(who, body, session, stream.send)
    stream.end()
  }

  /** 204 whether or not the turn was running here: a turn that already ended, or
   *  another person's, is left alone, and the screen has nothing to show for it. */
  @Post('turns/:id/stop')
  @HttpCode(204)
  @Need(ASSISTANT_NEED)
  stop(@CurrentActor() who: Actor, @Param(zod(AssistantIdParams)) p: AssistantIdParams): void {
    this.turns.stop(who, p.id)
  }

  @Get('sessions')
  @Need(ASSISTANT_NEED)
  sessions(
    @CurrentActor() who: Actor,
    @Query(zod(AssistantSessionListQuery)) q: AssistantSessionListQuery,
  ) {
    return this.assistant.list(who, q)
  }

  @Get('sessions/:id')
  @Need(ASSISTANT_NEED)
  session(@CurrentActor() who: Actor, @Param(zod(AssistantIdParams)) p: AssistantIdParams) {
    return this.assistant.detail(who, p.id)
  }

  @Patch('sessions/:id')
  @Need(ASSISTANT_NEED)
  patch(
    @CurrentActor() who: Actor,
    @Param(zod(AssistantIdParams)) p: AssistantIdParams,
    @Body(zod(AssistantSessionPatchBody)) body: AssistantSessionPatchBody,
  ) {
    return this.assistant.patch(who, p.id, body)
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @Need(ASSISTANT_NEED)
  remove(@CurrentActor() who: Actor, @Param(zod(AssistantIdParams)) p: AssistantIdParams) {
    return this.assistant.remove(who, p.id)
  }

  @Post('messages/:id/report')
  @HttpCode(204)
  @Need(ASSISTANT_NEED)
  report(
    @CurrentActor() who: Actor,
    @Param(zod(AssistantIdParams)) p: AssistantIdParams,
    @Body(zod(AssistantReportBody)) body: AssistantReportBody,
  ) {
    return this.assistant.report(who, p.id, body)
  }

  /** Re-checked as the reader, and trailed: it shows other people's chat text. */
  @Get('reports')
  @Need({ permission: 'assistant.review' })
  reports(@CurrentActor() who: Actor, @Query(zod(AssistantReportQuery)) q: AssistantReportQuery) {
    return this.assistant.reports(who, q)
  }
}
