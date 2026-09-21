import { useState } from 'react'
import { MOTION_ASKS_MISSING } from '@pv/contracts'
import type { LeadMotion } from '@pv/engines'
import type { LeadImportInput } from '@/data/lead-import'
import { wireMotionOf } from '@/data/lead-import'
import { useMotionAsks } from '@/data/sales-motions'
import type { BatchExtra } from './import-zone-bits'
import {
  CampaignPicker,
  OriginPicker,
  PartnerPicker,
  type CampaignChoice,
  type OriginChoice,
  type PartnerChoice,
} from './lead-origin-pickers'

/** The lead book's batch-wide pick in the import panel — ONE of origin,
 *  campaign or partner, as the batch motion's `asks` says.
 *
 *  Held by the screen, not the panel: the panel serves three books and knows
 *  none of these. The three picks are kept side by side so flipping the motion
 *  back does not lose one, but only the asked one reaches the wire. The batch
 *  `source` (SOURCE catalogue) is a separate axis and travels as before. */

type BatchWire = Pick<LeadImportInput, 'origin' | 'refCode' | 'campaignCode' | 'source'>

const ORIGIN_ONLY = ['origin']

export function useLeadImportBatch() {
  const asksOf = useMotionAsks()
  const [origin, setOrigin] = useState<OriginChoice | null>(null)
  const [campaign, setCampaign] = useState<CampaignChoice | null>(null)
  const [partner, setPartner] = useState<PartnerChoice | null>(null)

  const asks = (motion: LeadMotion) => {
    const wire = wireMotionOf(motion)
    return { wire, asks: wire ? asksOf(wire) : undefined }
  }

  const extra = (motion: LeadMotion): BatchExtra => {
    const { asks: asked } = asks(motion)
    /* Not loaded yet, or the motion is off: nothing below the motion control. */
    if (asked === undefined) {
      return {
        node: null,
        missing: 'Phương án tiếp cận chưa sẵn sàng — đang tải hoặc đã tắt.',
        hideFields: ORIGIN_ONLY,
      }
    }
    if (asked === 'CAMPAIGN') {
      return {
        node: (
          <CampaignPicker
            label="Chiến dịch cho cả lô *"
            required
            value={campaign}
            onChange={setCampaign}
          />
        ),
        missing: campaign ? undefined : MOTION_ASKS_MISSING.CAMPAIGN,
        hideFields: ORIGIN_ONLY,
      }
    }
    if (asked === 'REFERRER') {
      return {
        node: (
          <div className="flex flex-col gap-2">
            <PartnerPicker
              label="Mã giới thiệu cho cả lô *"
              value={partner}
              onChange={setPartner}
            />
            {partner?.originName && (
              <p className="text-glass-foreground text-[11.5px] leading-[1.7]">
                Nguồn lấy theo mã giới thiệu: {partner.originName}.
              </p>
            )}
          </div>
        ),
        missing: partner ? undefined : MOTION_ASKS_MISSING.REFERRER,
        hideFields: ORIGIN_ONLY,
      }
    }
    return {
      node: (
        <OriginPicker
          label="Nguồn lead cho cả lô — dùng cho dòng để trống cột Nguồn lead"
          value={origin}
          onChange={setOrigin}
          onClear={() => setOrigin(null)}
        />
      ),
    }
  }

  /** What travels for this motion — exactly the asked field, nothing stale. */
  const wireOf = (motion: LeadMotion, scope: string | undefined): BatchWire => {
    const { asks: asked } = asks(motion)
    if (asked === undefined) return { source: scope }
    if (asked === 'CAMPAIGN') return { source: scope, campaignCode: campaign?.code }
    if (asked === 'REFERRER') return { source: scope, refCode: partner?.code }
    const picked = origin ? (origin.id ? { id: origin.id } : { name: origin.name }) : undefined
    return { source: scope, origin: picked }
  }

  return { extra, wireOf }
}
