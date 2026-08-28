import { Body, Container, Head, Html, Preview, Section, Text } from '@react-email/components'
import { Divider, Field, Heading, OpenLink, Paragraphs } from './ops-mail-bits'
import {
  BODY_STYLE,
  COLOR_INK,
  COLOR_MUTED,
  CONTAINER_STYLE,
  formatMoment,
  formatMoney,
} from './ops-mail-style'

/** Template 2 · "Một đơn vừa thua" — gửi hộp thư nội bộ.
 *
 *  ------------------------------------------------------------------
 *  MAIL NÀY TỒN TẠI ĐỂ CHỞ MỘT BÀI HỌC, KHÔNG PHẢI ĐỂ BÁO MỘT SỐ ÂM
 *  ------------------------------------------------------------------
 *  Sổ tự trừ đúng số tiền dù có mail hay không. Thứ sổ KHÔNG tự làm được là đưa
 *  câu "vì sao thua" tới người đang chào đúng khách đó tuần sau — và đó là toàn
 *  bộ lý do mail này được gửi. Nên LÝ DO đứng trên cùng, trước cả số tiền: mở
 *  preview trong hộp thư là đọc được ngay, không phải bấm vào.
 *
 *  Cùng lý do đó quyết định luôn hình của nó: KHÔNG có nút, không có việc phải
 *  làm, không có đường "gật". Đơn đã đóng rồi. Một CTA ở đây chỉ tạo cảm giác
 *  còn cứu được, và người đọc sẽ bấm vào để phát hiện là không.
 *
 *  ------------------------------------------------------------------
 *  HAI Ô LÝ DO, VÀ CẢ HAI ĐỀU TUỲ CHỌN — nhưng không cùng lúc
 *  ------------------------------------------------------------------
 *  `lossReason` là một trong bảy lý do dựng sẵn, `lossNote` là câu của riêng
 *  đơn này (tên đối thủ, con số họ chào, ai đổi ý). Hợp đồng ở
 *  `@pv/contracts` đòi ÍT NHẤT một trong hai, nên mail luôn có gì đó để in ở
 *  khối này; template vẫn kiểm từng ô vì nó không được quyền tin điều đó — nó
 *  cũng dựng được từ dữ liệu cũ, có trước lúc luật ấy tồn tại.
 *
 *  Tông màu cảnh báo dùng ở ĐÚNG dòng tiêu đề. Tô đỏ cả mail thì mắt hết chỗ
 *  bám, và một hộp thư toàn mail đỏ là một hộp thư không ai đọc mail đỏ nữa. */
export type OpportunityLostData = {
  opCode: string
  leadCode: string
  account: string
  name: string
  amount: number | null
  currency: string | null
  /** Một trong bảy lý do dựng sẵn. */
  lossReason?: string
  /** Câu của riêng đơn này. */
  lossNote?: string
  saleOwners: string[]
  bdOwners: string[]
  /** ISO có múi giờ. */
  closedAt: string
  /** Số ngày đơn sống, từ lúc mở tới lúc đóng. Chưa tính được thì bỏ. */
  daysOpen?: number
  opUrl: string
}

export function OpportunityLostEmail(data: OpportunityLostData) {
  const money = formatMoney(data.amount, data.currency)
  const headline = data.lossReason ?? data.lossNote ?? 'chưa ghi lý do'

  return (
    <Html lang="vi">
      <Head />
      <Preview>{`${data.account} · thua · ${headline}`}</Preview>
      <Body style={BODY_STYLE}>
        <Container style={CONTAINER_STYLE}>
          <Heading tone="alert">Đơn đã thua</Heading>
          <Text style={{ fontSize: 12, color: COLOR_MUTED, margin: '0 0 24px' }}>
            {data.opCode} · từ lead {data.leadCode}
          </Text>

          <Section>
            <Text style={{ fontSize: 12, color: COLOR_MUTED, margin: '0 0 2px' }}>Vì sao thua</Text>
            <Field label="Lý do" value={data.lossReason} />
            {data.lossNote && data.lossNote.trim() ? (
              <Paragraphs text={data.lossNote} keyPrefix="note" />
            ) : null}
          </Section>

          <Divider />

          <Section>
            <Field label="Khách" value={data.account} />
            <Field label="Tên đơn" value={data.name} />
            <Field label="Giá trị đơn" value={money} />
            <Field
              label="Đơn sống được"
              value={data.daysOpen === undefined ? undefined : `${data.daysOpen} ngày`}
            />
          </Section>

          <Divider />

          <Section>
            <Field label="Sale đứng đơn" value={data.saleOwners.join(' · ')} />
            <Field label="BD mở cửa" value={data.bdOwners.join(' · ')} />
          </Section>

          <Divider />

          <Text style={{ fontSize: 14, lineHeight: '20px', color: COLOR_INK, margin: '0 0 12px' }}>
            Khách vẫn còn trong sổ. Lý do trên là thứ cần đọc lại trước lần chào tiếp theo.
          </Text>
          <Text style={{ fontSize: 12, color: COLOR_MUTED, margin: '0 0 12px' }}>
            Đóng lúc {formatMoment(data.closedAt)}
          </Text>
          <OpenLink url={data.opUrl} />
        </Container>
      </Body>
    </Html>
  )
}
