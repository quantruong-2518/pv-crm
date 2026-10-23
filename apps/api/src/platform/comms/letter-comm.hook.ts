import { Injectable, Logger } from '@nestjs/common'
import type { Db } from '@api/platform/db/db.module'
import type {
  MailAccepted,
  MailSentHook,
  MailSubjectPeople,
} from '@api/platform/mail/mail-sent.hook'
import { substitute } from '@api/platform/mail/mas-letter'
import { CommRecordService } from './comm-record.service'

const CONTACT_REF = 'contact:'

/** A group letter the provider took is a contact in the customer's history
 *  (ADR 0075): the press on Mail records nothing, so this is the only writer.
 *  Rides the accept's transaction like every `MAIL_SENT_HOOK`, and never throws
 *  out of it: a customer address that belongs to someone else loses its history
 *  line, not the lead's move to `working` that shares this savepoint. */
@Injectable()
export class LetterCommHook implements MailSentHook {
  private readonly log = new Logger('LetterComm')

  constructor(private readonly records: CommRecordService) {}

  async afterSent(tx: Db, sent: MailAccepted): Promise<void> {
    const { sender, run } = sent
    if (sent.runKind !== 'group' || sent.role !== 'recipient' || !sender || !run) return
    /* The letter goes to one fixed contact; its code rides the address row as `contact:<code>`. */
    const to = sent.addresses.find((a) => a.role === 'to' && a.ref?.startsWith(CONTACT_REF))
    const contactCode = to?.ref?.slice(CONTACT_REF.length)
    if (!to || !contactCode) return

    try {
      /* Own savepoint: a refusal must leave no half-written thread behind the catch. */
      await tx.transaction((sp) =>
        this.records.recordLetter(sp, {
          deliveryId: sent.id,
          subjectCode: sent.aggregateId,
          ownerId: sender,
          contactCode,
          email: to.address,
          subject: substitute(run.subject, sent.merge ?? {}, new Set()),
          at: new Date(),
        }),
      )
    } catch (error) {
      this.log.warn(`Letter ${sent.id} not filed as a contact: ${String(error)}`)
    }
  }

  async afterTrouble(): Promise<MailSubjectPeople | null> {
    return null
  }

  async afterReply(): Promise<MailSubjectPeople | null> {
    return null
  }

  async peopleOf(): Promise<MailSubjectPeople | null> {
    return null
  }
}
