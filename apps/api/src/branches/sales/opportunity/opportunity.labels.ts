import { OPPORTUNITY_STAGE_LABEL, type StageKey } from '@pv/contracts'

/** Nhãn tiếng Việt của cột — bản của MÁY CHỦ, và nay chỉ còn MỘT dòng.
 *
 *  Hai bảng nhãn từng nằm ở đây vì hợp đồng cố tình chỉ giữ khoá. ADR 0064 đổi
 *  điều đó: `OPPORTUNITY_STAGE_LABEL` và `OPPORTUNITY_STATE_LABEL` khai đúng một
 *  lần trong `@pv/contracts`, đúng như `LEAD_STATE_LABEL`, nên máy chủ đọc thẳng
 *  từ đó thay vì giữ bản chép thứ hai — đổi tên một cột là đổi cả hai đầu.
 *
 *  Thứ ở lại là thứ hợp đồng không nói được: một đơn KHÔNG đứng ở cột nào đọc ra
 *  sao trong một câu văn. */

/** Tên cột để đọc trong một câu. `null` = đơn đã ra khỏi bảng năm cột, và câu đó
 *  phải đọc được chứ không được in ra chữ "null". */
export const stageLabel = (stage: StageKey | null): string =>
  stage === null ? 'ngoài bảng' : OPPORTUNITY_STAGE_LABEL[stage]
