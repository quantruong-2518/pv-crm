import { Section, Text } from '@react-email/components'
import { BrandShell, CtaButton, Eyebrow, FallbackLink, Para, ShellHeading } from './brand-shell'
import { Divider, Field, Paragraphs } from './ops-mail-bits'
import { COLOR_MUTED, FONT_STACK, formatMoment, formatMoney } from './ops-mail-style'

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
 *  ------------------------------------------------------------------
 *  LÁ NÀY TỪNG CỐ Ý KHÔNG CÓ NÚT. GIỜ CÓ — VÀ ĐÂY LÀ CHỖ GHI VÌ SAO
 *  ------------------------------------------------------------------
 *  Lập luận cũ: đơn đã đóng, không còn việc phải làm, nên một CTA chỉ tạo cảm
 *  giác còn cứu được và người đọc sẽ bấm vào để phát hiện là không.
 *
 *  Lập luận đó đúng về ĐƠN nhưng sai về LÁ THƯ. Việc còn phải làm không phải
 *  là cứu đơn — nó là đọc lại lý do trước lần chào tiếp theo, đúng câu mà
 *  chính khối chú thích trên vừa nói là toàn bộ lý do lá thư này được gửi. Bỏ
 *  nút không làm người ta thôi muốn xem hồ sơ; nó chỉ bắt họ tự đi tìm, và
 *  một lá thư nói "hãy đọc lại lý do" mà không mở được hồ sơ là một lá thư
 *  giao việc rồi giấu công cụ.
 *
 *  Nhãn nút vì thế là "Xem hồ sơ đơn", không phải "Mở đơn": nó hứa đọc, không
 *  hứa sửa. Cảnh báo cũ vẫn còn giá trị ở đúng chỗ đó — nút không được phép
 *  trông như một đường cứu đơn.
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
  /** Gốc URL công khai của ảnh nhận diện — xem `PV_BRAND_ASSET_URL`. */
  assetBaseUrl: string
}

export function OpportunityLostEmail(data: OpportunityLostData) {
  const money = formatMoney(data.amount, data.currency)
  const headline = data.lossReason ?? data.lossNote ?? 'chưa ghi lý do'

  return (
    <BrandShell preview={`${data.account} · thua · ${headline}`} assetBaseUrl={data.assetBaseUrl}>
      <ShellHeading tone="alert">Đơn đã thua</ShellHeading>
      <Eyebrow>
        {data.opCode} · từ lead {data.leadCode} · đóng lúc {formatMoment(data.closedAt)}
      </Eyebrow>

      <Section>
        <Text
          style={{ fontSize: 12, color: COLOR_MUTED, margin: '0 0 2px', fontFamily: FONT_STACK }}
        >
          Vì sao thua
        </Text>
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

      <Para>Khách vẫn còn trong sổ. Lý do trên là thứ cần đọc lại trước lần chào tiếp theo.</Para>
      {/* Nút dẫn tới hồ sơ đơn chứ không tới sổ khách, dù câu trên nói về
          khách: thứ người đọc cần làm ngay là đọc lại lý do trong ngữ cảnh
          đầy đủ của đơn, và từ đó mới sang khách. Một nút, một việc. */}
      <CtaButton href={data.opUrl}>Xem hồ sơ đơn {data.opCode}</CtaButton>
      <FallbackLink url={data.opUrl} />
    </BrandShell>
  )
}
