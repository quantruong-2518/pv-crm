import { message } from '@/app/i18n'

/** Sign drawer wording, kept apart so the drawer stays under the function ceiling. */
export const SIGN_COPY = {
  noQuotation: message('Không gắn báo giá', 'No quotation attached', '견적서 연결 안 함'),
  round: (no: number) => message(`Lần ${no}`, `Round ${no}`, `${no}차`),
  sendDone: message(
    'Gửi xong, đề nghị chờ duyệt.',
    'Once sent, the proposal waits for approval.',
    '전송하면 제안이 승인 대기 상태가 됩니다.',
  ),
  fillIn: message(
    'Chọn loại hợp đồng, nhập số tiền và đồng tiền.',
    'Choose the contract type, then enter the amount and currency.',
    '계약 유형을 선택하고 금액과 통화를 입력하세요.',
  ),
  signing: message('Đang ký…', 'Signing…', '서명 중…'),
  sending: message('Đang gửi đề nghị ký…', 'Sending the sign proposal…', '서명 제안을 보내는 중…'),
  titleAgain: message('Ký thêm hợp đồng', 'Sign another contract', '계약 추가 체결'),
  titleDirect: message('Ký hợp đồng', 'Sign contract', '계약 체결'),
  titleProposal: message('Đề nghị ký', 'Sign proposal', '계약 체결 제안'),
  subtitleAgain: message(
    '. Một hợp đồng mới bên cạnh hợp đồng đã ký, được duyệt thì cộng vào giá trị đơn.',
    '. A new contract beside the signed one; once approved it adds to the deal value.',
    '. 체결된 계약과 별개의 새 계약이며, 승인되면 기회 금액에 합산됩니다.',
  ),
  subtitleProposal: message(
    '. Được duyệt thì đơn thành hợp đồng.',
    '. Once approved, the deal becomes a contract.',
    '. 승인되면 기회가 계약으로 전환됩니다.',
  ),
  signed: (code: string) =>
    message(
      `Đã ký hợp đồng ${code}.`,
      `Contract ${code} signed.`,
      `계약 ${code}을(를) 체결했습니다.`,
    ),
  proposalSent: message(
    'Đã gửi đề nghị ký, chờ duyệt.',
    'Sign proposal sent, awaiting approval.',
    '체결 제안을 보냈습니다. 승인 대기 중입니다.',
  ),
  quotationToSign: message('Báo giá được ký', 'Quotation to sign', '체결할 견적서'),
  paymentSchedule: message('Lịch thanh toán', 'Payment schedule', '결제 일정'),
} as const
