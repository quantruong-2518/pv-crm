import { useState } from 'react'
import type { LeadMotion } from '@pv/engines'
import { message, useI18n } from '@/app/i18n'
import { leadAsksMissing } from '@/data/lead-copy'
import type { LeadImportInput } from '@/data/lead-import'
import { wireMotionOf } from '@/data/lead-import'
import { useMotionAsks } from '@/data/sales-motions'
import type { BatchExtra } from './import-zone-bits'
import {
  CampaignPicker,
  PartnerPicker,
  type CampaignChoice,
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

/* A campaign or a ref code decides the origin, so no column may. */
const PICKED_NOT_FILED = ['origin', 'source']
const CAMPAIGN_ONLY = ['source']

export function useLeadImportBatch() {
  const { t } = useI18n()
  const asksOf = useMotionAsks()
  const [campaign, setCampaign] = useState<CampaignChoice | null>(null)
  const [partner, setPartner] = useState<PartnerChoice | null>(null)

  const asks = (motion: LeadMotion) => {
    const wire = wireMotionOf(motion)
    return { wire, asks: wire ? asksOf(wire) : undefined }
  }

  const extra = (motion: LeadMotion): BatchExtra => {
    const { wire, asks: asked } = asks(motion)
    /* Not loaded yet, or the motion is off: nothing below the motion control. */
    if (asked === undefined) {
      return {
        node: null,
        missing: t(
          message(
            'Phương án tiếp cận đang tải hoặc đã tắt.',
            'The approach is still loading or turned off.',
            '접근 방식을 불러오는 중이거나 꺼져 있습니다.',
          ),
        ),
        hideFields: PICKED_NOT_FILED,
      }
    }
    if (asked === 'CAMPAIGN') {
      return {
        node: (
          <CampaignPicker
            label={t(
              message('Chiến dịch cho cả lô', 'Campaign for the whole batch', '전체 묶음의 캠페인'),
            )}
            required
            value={campaign}
            onChange={setCampaign}
          />
        ),
        missing: campaign ? undefined : leadAsksMissing('CAMPAIGN'),
        hideFields: PICKED_NOT_FILED,
      }
    }
    if (asked === 'REFERRER') {
      return {
        node: (
          <div className="flex flex-col gap-2">
            <PartnerPicker
              label={t(
                message(
                  'Mã giới thiệu cho cả lô',
                  'Referral code for the whole batch',
                  '전체 묶음의 소개 코드',
                ),
              )}
              required
              value={partner}
              onChange={setPartner}
              motion={wire}
            />
            {partner?.originName && (
              <p className="text-glass-foreground text-[11.5px] leading-[1.7]">
                {t(
                  message(
                    `Nguồn lấy theo mã giới thiệu: ${partner.originName}.`,
                    `Source taken from the referral code: ${partner.originName}.`,
                    `소개 코드 기준 유입 경로: ${partner.originName}.`,
                  ),
                )}
              </p>
            )}
          </div>
        ),
        missing: partner ? undefined : leadAsksMissing('REFERRER'),
        hideFields: PICKED_NOT_FILED,
      }
    }
    /* ORIGIN: only the motion is picked; each row names its own origin. */
    return {
      node: (
        <p className="text-glass-foreground text-[11.5px] leading-[1.7]">
          {t(
            message(
              'Nguồn chi tiết lấy từ cột Nguồn trong tệp.',
              'The source detail comes from the Source column in the file.',
              '세부 유입 경로는 파일의 유입 경로 열에서 가져옵니다.',
            ),
          )}
        </p>
      ),
      hideFields: CAMPAIGN_ONLY,
    }
  }

  /** What travels for this motion — exactly the asked field, nothing stale. */
  const wireOf = (motion: LeadMotion, scope: string | undefined): BatchWire => {
    const { asks: asked } = asks(motion)
    if (asked === undefined) return { source: scope }
    if (asked === 'CAMPAIGN') return { source: scope, campaignCode: campaign?.code }
    if (asked === 'REFERRER') return { source: scope, refCode: partner?.code }
    return { source: scope }
  }

  return { extra, wireOf }
}
