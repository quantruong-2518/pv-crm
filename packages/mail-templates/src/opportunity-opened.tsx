import { Section, Text } from '@react-email/components'
import { BrandShell, CtaButton, Eyebrow, FallbackLink, Para, ShellHeading } from './brand-shell'
import { Divider, Field, Paragraphs } from './ops-mail-bits'
import { COLOR_MUTED, FONT_STACK, formatDay, formatMoment, formatMoney } from './ops-mail-style'

/** Template 1 · "Một lead vừa lên cơ hội" — gửi hộp thư nội bộ.
 *
 *  ------------------------------------------------------------------
 *  MAIL NÀY LÀ MỘT LỜI XIN GẬT, KHÔNG PHẢI MỘT THÔNG BÁO
 *  ------------------------------------------------------------------
 *  Phiếu đổi lead → cơ hội kết bằng đúng câu "TP Kinh doanh gật thì đơn vào cột
 *  thật" (`ConvertDialog`). Cho tới ngày E3 có cửa duyệt thật, mail này LÀ cái
 *  cửa đó: nó phải chở đủ thứ để người gật gật được mà không phải mở CRM —
 *  khách nào, bao nhiêu tiền, ai đứng đơn, bao giờ đóng — và một đường mở thẳng
 *  đơn cho lần họ muốn xem kỹ.
 *
 *  Thứ tự các khối theo thứ tự người đọc quyết định, không theo thứ tự cột của
 *  bảng: TIỀN và NGÀY ĐÓNG lên trước tên đơn, vì đó là hai con số quyết định
 *  đơn này có đáng ưu tiên không.
 *
 *  ------------------------------------------------------------------
 *  HAI VAI IN THÀNH HAI DÒNG, KHÔNG GỘP
 *  ------------------------------------------------------------------
 *  Sale chốt và BD mở cửa là hai công trạng tách nhau, và hoa hồng chia theo
 *  đúng đường tách đó. Gộp thành một dòng "Người phụ trách" là làm mất chính
 *  thông tin mà bảng nối `opportunity_owner` được dựng ra để giữ. Đơn không có
 *  BD thì dòng BD biến mất, không in "—". */
export type OpportunityOpenedData = {
  opCode: string
  leadCode: string
  /** Tên khách. Đọc từ lead, không phải từ phiếu. */
  account: string
  /** Tên đơn — "công ty · thứ đang chào". */
  name: string
  /** Nhãn tiếng Việt của trạng thái ("Nego"), không phải khoá. Tầng gọi dịch:
   *  bảng nhãn là kiến thức của màn, không phải của template. */
  stateLabel: string
  /** Nhãn cột ("Chờ ký"), vắng mặt khi đơn đã ra khỏi năm cột. */
  stageLabel?: string
  amount: number | null
  currency: string | null
  /** ISO ngày. */
  expectedClose: string | null
  saleOwners: string[]
  bdOwners: string[]
  description?: string
  /** ISO có múi giờ. */
  openedAt: string
  opUrl: string
  /** Gốc URL công khai của ảnh nhận diện — xem `PV_BRAND_ASSET_URL`. */
  assetBaseUrl: string
}

export function OpportunityOpenedEmail(data: OpportunityOpenedData) {
  const money = formatMoney(data.amount, data.currency)

  return (
    <BrandShell
      preview={`${data.account} · ${money ?? 'chưa có giá trị'} · đóng dự kiến ${data.expectedClose ? formatDay(data.expectedClose) : 'chưa đặt'}`}
      assetBaseUrl={data.assetBaseUrl}
    >
      <ShellHeading>Cơ hội mới mở</ShellHeading>
      {/* Mã đơn, lead gốc và giờ mở gộp một dòng. Giờ mở trước đây nằm ở cuối
          thư, ngay trên đường dẫn — chỗ không ai đọc. Nó thuộc về câu "thư này
          nói về cái gì", nên nó lên đây cùng hai mã. */}
      <Eyebrow>
        {data.opCode} · từ lead {data.leadCode} · mở lúc {formatMoment(data.openedAt)}
      </Eyebrow>

      <Section>
        <Field label="Khách" value={data.account} />
        <Field label="Giá trị đơn" value={money} />
        <Field
          label="Đóng dự kiến"
          value={data.expectedClose ? formatDay(data.expectedClose) : undefined}
        />
        <Field label="Tên đơn" value={data.name} />
        <Field label="Trạng thái" value={data.stateLabel} />
        <Field label="Đang ở cột" value={data.stageLabel} />
      </Section>

      <Divider />

      <Section>
        <Field label="Sale đứng đơn" value={data.saleOwners.join(' · ')} />
        <Field label="BD mở cửa" value={data.bdOwners.join(' · ')} />
      </Section>

      {data.description && data.description.trim() ? (
        <Section style={{ marginTop: 4 }}>
          <Text
            style={{ fontSize: 12, color: COLOR_MUTED, margin: '0 0 2px', fontFamily: FONT_STACK }}
          >
            Phạm vi đang chào
          </Text>
          <Paragraphs text={data.description} keyPrefix="desc" />
        </Section>
      ) : null}

      <Divider />

      <Para>Đơn đang chờ gật. Mở đơn để xem hồ sơ đầy đủ hoặc đổi trạng thái.</Para>
      <CtaButton href={data.opUrl}>Mở cơ hội {data.opCode}</CtaButton>
      <FallbackLink url={data.opUrl} />
    </BrandShell>
  )
}
