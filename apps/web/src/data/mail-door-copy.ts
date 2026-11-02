import { MAIL_DOOR_LABEL, type MailDoor } from '@pv/contracts'
import { getLang, message, translate, type Lang, type Message } from '@/app/i18n'

const DOOR: Record<MailDoor, Message> = {
  lead: message(MAIL_DOOR_LABEL.lead, 'Lead', '리드'),
  opportunity: message(MAIL_DOOR_LABEL.opportunity, 'Opportunity', '기회'),
  quote: message(MAIL_DOOR_LABEL.quote, 'Quotation', '견적서'),
  contract: message(MAIL_DOOR_LABEL.contract, 'Contract', '계약'),
  campaign: message(MAIL_DOOR_LABEL.campaign, 'Campaign', '캠페인'),
}

/** Where a letter template is offered, in the reader's language. */
export const mailDoorLabel = (door: MailDoor, lang: Lang = getLang()) => translate(DOOR[door], lang)
