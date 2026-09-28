import type { CampaignOverlap, CampaignProfile } from '@pv/contracts'
import { percent } from '@pv/ui'

/** Module 1 · what the campaign screens agree on before any of them draws.
 *
 *  The four-step wizard died on 20/09 and its two step lists went with it: a
 *  campaign that already exists is not a form being walked, which is the whole
 *  argument in `packages/ui/src/patterns/stage-track.tsx`. What is left here is
 *  the profile draft (typed in the create modal, edited in the profile tab),
 *  the tab on the address, how a share of letters is printed, and the
 *  overlap warning the fire dialog carries.
 *
 *  Nothing with JSX in it lives here — that is the line between a `-model.ts`
 *  and a `-parts.tsx`. */

export type ProfileDraft = {
  name: string
  slogan: string
  thumbnailUrl: string
  ownerId: string
  sourceId: string
  /** The origin this campaign's leads inherit (`CAMPAIGN`-asking motions);
   *  `''` = not named yet. */
  originId: string
  /** `YYYY-MM-DD` as the date box reads it; `''` = open-ended. */
  endsOn: string
}

export function emptyProfile(): ProfileDraft {
  return {
    name: '',
    slogan: '',
    thumbnailUrl: '',
    ownerId: '',
    sourceId: '',
    originId: '',
    endsOn: '',
  }
}

export function profileFrom(c: CampaignProfile): ProfileDraft {
  return {
    name: c.name,
    slogan: c.slogan ?? '',
    thumbnailUrl: c.thumbnailUrl ?? '',
    ownerId: c.ownerId ?? '',
    sourceId: c.sourceId ?? '',
    originId: c.originId ?? '',
    endsOn: c.endsOn ?? '',
  }
}

/** THE CEILING NOBODY WAS TOLD ABOUT, said out loud with both numbers.
 *
 *  Neither `/start` nor `/waves` carries `leadCodes` — the server reads the
 *  audience itself — so nothing on the way in passes a zod door that could have
 *  caught the size, while `CampaignMemberPatch.add` takes 500 a round. An
 *  audience of 201 is easy to build and impossible to fire.
 *
 *  The ceiling comes from `CampaignProfile.batchCeiling`, not from
 *  `MAS_MAX_RECIPIENTS`: that constant bounds a hand-picked REQUEST and never
 *  sees a campaign, while the real limit is `PV_MAS_BATCH_MAX`. */
export function ceilingNote(count: number, ceiling: number): string {
  return `Đang có ${count} người nhận, vượt trần ${ceiling} của một đợt gửi — bớt xuống rồi hãy bắn.`
}

/** The three faces of one campaign. On the address bar (`?tab=`), so a screen
 *  opened on the audience can be sent to the person who has to fix it — the
 *  same filters-on-the-address ritual the book follows. */
export type CampaignTab = 'waves' | 'audience' | 'profile'

export const DEFAULT_CAMPAIGN_TAB: CampaignTab = 'waves'

export function parseCampaignTab(raw: string | null): CampaignTab {
  return raw === 'audience' || raw === 'profile' ? raw : DEFAULT_CAMPAIGN_TAB
}

/** A share as the screen prints it — `—` when there is nothing to divide by,
 *  because "0%" of zero letters reads as a result when it is an absence. */
export function shareOf(part: number, whole: number, fractionDigits = 0): string {
  return whole > 0 ? percent(part / whole, fractionDigits) : '—'
}

/** TWO CAMPAIGNS WRITING TO THE SAME PERSON — a warning, never a fence.
 *
 *  The server sends these letters and there is no `MasRecipientBlock` for it,
 *  so nothing may disable the fire button on it (ADR 0061 §5). It is said
 *  because `campaign_member` is per campaign: the second letter is otherwise
 *  invisible until the person complains. `null` = no overlap. */
export function overlapNote(rows: readonly CampaignOverlap[]): string | null {
  if (rows.length === 0) return null

  const people = new Set(rows.map((r) => r.leadCode)).size
  const names = [...new Set(rows.map((r) => r.campaignName))]
  const where =
    names.length > 2
      ? `${names.slice(0, 2).join(', ')} và ${names.length - 2} chiến dịch khác`
      : names.join(', ')

  return `${people} người nhận đang nhận thư của ${where} — đợt này vẫn gửi cho họ, nên họ đọc hai lá trong cùng một quãng.`
}
