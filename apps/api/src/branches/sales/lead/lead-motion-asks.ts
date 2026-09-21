import { MOTION_ASKS_MISSING, type MotionAsks } from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { invalid } from '@api/platform/http/problem'
import type { PartnerService } from '../partner/partner.service'

/** `motion_policy.asks` at the MANUAL and IMPORT doors: which of origin /
 *  campaign / referrer the chosen motion requires, and which it must not get.
 *  The public doors (landing, Apollo) never read it — their motion is fixed by
 *  the channel and nobody there can answer the question.
 *
 *  Sending the field a motion derives (an origin beside a campaign or a ref
 *  code) is refused rather than silently overridden: the caller believed it
 *  would be kept. Every refusal is collected, so one 400 names every field. */

/** What the body carried. `campaign` is `campaignCode` at both doors (never
 *  the file's `source`, a config id); `originRequired` is false for a file,
 *  where a row may still carry no origin under ORIGIN (behaviour before 0059). */
export type AskedFields = {
  origin: boolean
  campaign: boolean
  refCode: boolean
  originRequired: boolean
}

export function refuseByAsks(asks: MotionAsks, sent: AskedFields): void {
  const errors: Record<string, string[]> = {}
  const no = (field: string, why: string): void => {
    errors[field] = [why]
  }

  if (asks === 'ORIGIN' && sent.originRequired && !sent.origin) {
    no('origin', MOTION_ASKS_MISSING.ORIGIN)
  }
  if (asks === 'CAMPAIGN' && !sent.campaign) {
    no('campaignCode', MOTION_ASKS_MISSING.CAMPAIGN)
  }
  if (asks === 'REFERRER' && !sent.refCode) {
    no('refCode', MOTION_ASKS_MISSING.REFERRER)
  }
  if (asks !== 'ORIGIN' && sent.origin) {
    no('origin', `Nguồn được lấy theo ${DERIVED_FROM[asks]} — không chọn nguồn riêng`)
  }
  if (asks !== 'REFERRER' && sent.refCode) {
    no('refCode', 'Phương án tiếp cận này không nhận mã giới thiệu')
  }

  if (Object.keys(errors).length > 0) throw invalid(errors)
}

const DERIVED_FROM: Record<Exclude<MotionAsks, 'ORIGIN'>, string> = {
  CAMPAIGN: 'chiến dịch',
  REFERRER: 'mã giới thiệu',
}

/** The partner behind a ref code; a hidden one refuses exactly like a missing one. */
export async function referrerOf(
  partners: PartnerService,
  db: Db,
  refCode: string,
): Promise<{ code: string; name: string; originId: string }> {
  const found = await partners.live(db, refCode)
  if (!found) throw invalid({ refCode: ['Mã giới thiệu không tồn tại hoặc đã ẩn'] })
  return found
}
