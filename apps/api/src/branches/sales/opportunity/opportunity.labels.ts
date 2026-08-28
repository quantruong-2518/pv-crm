import type { OpportunityCreateState, StageKey } from '@pv/contracts'

/** Nhãn tiếng Việt của trạng thái và cột — bản của MÁY CHỦ.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO NHÃN NẰM Ở ĐÂY VÀ KHÔNG NẰM Ở `@pv/contracts`
 *  ------------------------------------------------------------------
 *  Hợp đồng cố tình chỉ giữ KHOÁ (`'gui-quotation'`, `'cho-ky'`). Nhãn là việc
 *  của tầng hiển thị, và máy chủ có đúng hai tầng hiển thị: thân một lá mail,
 *  và câu của một dòng thời gian. Cả hai đều là chữ gửi cho người đọc, cả hai
 *  đều được dựng ở `apps/api`, và trước file này chúng có HAI bản chép rời —
 *  `opportunity-mail.composer.ts` giữ một bản, và mọi câu "đơn vừa sang cột X"
 *  sẽ đẻ ra bản thứ hai.
 *
 *  Gộp về một bản trong `apps/api` là thứ làm được hôm nay. Bản THỨ HAI —
 *  `components/ops-fields.tsx` bên `apps/web` — vẫn còn, và vẫn là khoản nợ đã
 *  ghi ở `docs/ban-giao-co-hoi.md`: nó trả cùng lúc với bước tách nhãn khỏi
 *  fixture, vì hôm nay nhãn của màn còn nằm trong fixture mà `apps/api` chỉ
 *  được nhập fixture ở `seed.ts`. Hai bản là nợ; ba bản là một bản sẽ bị quên. */

export const STATE_LABEL: Record<OpportunityCreateState, string> = {
  'gui-quotation': 'Gửi quotation',
  nego: 'Nego',
  'close-lost': 'Close lost',
  pending: 'Pending',
}

export const STAGE_LABEL: Record<StageKey, string> = {
  moi: 'Mới',
  'tim-hieu': 'Đang tìm hiểu',
  'da-demo': 'Đã demo',
  'da-bao-gia': 'Đã báo giá',
  'cho-ky': 'Chờ ký',
}

/** Tên cột để đọc trong một câu văn. `null` = đơn đã ra khỏi bảng năm cột, và
 *  câu đó phải đọc được chứ không được in ra chữ "null". */
export const stageLabel = (stage: StageKey | null): string =>
  stage === null ? 'ngoài bảng' : STAGE_LABEL[stage]
