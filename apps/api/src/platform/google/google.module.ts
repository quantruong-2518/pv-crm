import { Module } from '@nestjs/common'
import { GoogleAccess } from './google-access'
import { GoogleCalendar } from './google-calendar.client'
import { GoogleGmail } from './google-gmail.client'
import { GoogleOAuth } from './google-oauth.client'
import { GoogleController } from './google.controller'
import { GoogleRepository } from './google.repository'
import { GoogleService } from './google.service'

/** `platform.google` — each employee's own Google link, and what it opens: a
 *  calendar and a mailbox. Under `platform/` because the link is identity
 *  plumbing no branch owns; consumers go through the three exports and never
 *  read `platform.google_link` themselves. */
@Module({
  controllers: [GoogleController],
  providers: [
    GoogleService,
    GoogleRepository,
    GoogleOAuth,
    GoogleAccess,
    GoogleCalendar,
    GoogleGmail,
  ],
  exports: [GoogleAccess, GoogleCalendar, GoogleGmail],
})
export class GoogleModule {}
