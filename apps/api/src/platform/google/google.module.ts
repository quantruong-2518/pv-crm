import { Module } from '@nestjs/common'
import { GoogleCalendar } from './google-calendar.client'
import { GoogleOAuth } from './google-oauth.client'
import { GoogleController } from './google.controller'
import { GoogleRepository } from './google.repository'
import { GoogleService } from './google.service'

/** `platform.google` — each employee's own Google link, and the calendar it
 *  opens. Under `platform/` because the link is identity plumbing no branch
 *  owns; Sales consumes it through `GoogleCalendar`, the one export, and
 *  never reads `platform.google_link` itself. */
@Module({
  controllers: [GoogleController],
  providers: [GoogleService, GoogleRepository, GoogleOAuth, GoogleCalendar],
  exports: [GoogleCalendar],
})
export class GoogleModule {}
