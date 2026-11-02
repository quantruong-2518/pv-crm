import { ADMISSION_VERDICT_LABEL, type AdmissionVerdict } from '@pv/contracts'
import { message, translate, type Lang, type Message } from '@/app/i18n'

/** The five admission verdicts in three languages; the Vietnamese text stays the contract's. */
const VERDICT: Record<AdmissionVerdict, Message> = {
  'new-account': message(ADMISSION_VERDICT_LABEL['new-account'], 'New company', '새 회사'),
  'same-lead': message(ADMISSION_VERDICT_LABEL['same-lead'], 'Already in the list', '이미 등록됨'),
  'new-contact': message(
    ADMISSION_VERDICT_LABEL['new-contact'],
    'New contact for an open lead',
    '진행 중인 리드의 새 연락처',
  ),
  'returning-account': message(
    ADMISSION_VERDICT_LABEL['returning-account'],
    'Returning customer',
    '기존 고객 재방문',
  ),
  'needs-review': message(
    ADMISSION_VERDICT_LABEL['needs-review'],
    'Possible duplicate, needs review',
    '중복 여부 확인 필요',
  ),
}

export const admissionVerdictText = (verdict: AdmissionVerdict, lang?: Lang) =>
  translate(VERDICT[verdict], lang)
