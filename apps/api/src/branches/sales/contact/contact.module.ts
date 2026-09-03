import { Module } from '@nestjs/common'
import { GraphModule } from '@api/platform/graph/graph.module'
import { ContactRepository } from './contact.repository'
import { ContactService } from './contact.service'

/** Contact — a facility of the lead module, the same shape as
 *  `MeetingModule`.
 *
 *  Declares NO `controllers`, and that is where it matches meeting: the
 *  four endpoints going through the lead's `:code` live on
 *  `LeadController`, because `@Need` is STATIC metadata, so the scope axis
 *  has to already sit on the path before anything gets read. The three
 *  endpoints addressed by `CT-…` also live there, resolving the scope axis
 *  one more hop through `leadOf`.
 *
 *  `GraphModule` is where it DIFFERS from meeting: a contact is a
 *  first-class object in E1 (`CT-0391` has a mirror row, a meeting does
 *  not), so this module needs `ObjectMirror`. */
@Module({
  imports: [GraphModule],
  providers: [ContactService, ContactRepository],
  exports: [ContactService],
})
export class ContactModule {}
