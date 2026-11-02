import type { CampaignWaveInput } from '@pv/contracts'
import { message, translate } from '@/app/i18n'
import { dmhm } from '@/lib/date'

/** Module 1 · the wave modal's wording that is computed, not drawn. */

export const tr = (vi: string, en: string, ko: string) => translate(message(vi, en, ko))

/** The button's words: what is about to happen and to how many. */
export function fireLabel(
  busy: boolean,
  waves: CampaignWaveInput[],
  scheduled: boolean,
  people: string,
) {
  return busy
    ? tr('Đang gửi…', 'Sending…', '발송 중…')
    : waves.length > 1
      ? tr(
          `Gửi ${waves.length} đợt cho ${people} người`,
          `Send ${waves.length} waves to ${people} recipients`,
          `수신자 ${people}명에게 ${waves.length}개 차수 발송`,
        )
      : scheduled && waves[0]?.scheduledAt
        ? tr(
            `Hẹn ${dmhm(waves[0].scheduledAt)} cho ${people} người`,
            `Schedule for ${dmhm(waves[0].scheduledAt)} · ${people} recipients`,
            `${dmhm(waves[0].scheduledAt)}에 수신자 ${people}명 예약`,
          )
        : tr(
            `Gửi cho ${people} người`,
            `Send to ${people} recipients`,
            `수신자 ${people}명에게 발송`,
          )
}

/** One line under each step saying what it already holds. */
export function stepSummaries(people: string, subject: string, waveCount: number) {
  return [
    tr(`${people} người nhận`, `${people} recipients`, `수신자 ${people}명`),
    subject.trim(),
    tr(
      `${Math.max(waveCount, 1)} đợt`,
      `${Math.max(waveCount, 1)} waves`,
      `발송 차수 ${Math.max(waveCount, 1)}개`,
    ),
  ]
}
