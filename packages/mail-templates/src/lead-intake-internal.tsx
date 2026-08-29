import { Section, Text } from '@react-email/components'
import { BrandShell, CtaButton, Eyebrow, FallbackLink, ShellHeading } from './brand-shell'
import { Divider, Field } from './ops-mail-bits'
import { COLOR_INK, COLOR_MUTED, FONT_STACK } from './ops-mail-style'

/** THƯ NỘI BỘ — "một lead vừa gửi form trên landing page".
 *
 *  ==================================================================
 *  FILE NÀY CHẠY PRODUCTION TỪ 26/08; ĐÂY LÀ LẦN ĐẦU NÓ ĐỔI HÌNH
 *  ==================================================================
 *  Trước đây nó cố tình đứng ngoài `ops-mail-bits.tsx` — bản in của nó là thứ
 *  hộp thư kinh doanh đang nhận, nên dời nó phải là một thay đổi riêng chứ
 *  không phải tác dụng phụ của việc thêm template khác. Lần này chính là thay
 *  đổi riêng đó, và nó gộp luôn ba việc đã tách được:
 *
 *   · bỏ `paletteHex` + bảng màu + `FONT_STACK` chép tay, đọc từ
 *     `ops-mail-style.ts` như mọi mẫu khác — ba bản sao của cùng một bảng màu
 *     là ba chỗ để nó trôi, và mẫu mail thì trôi trong im lặng;
 *   · bỏ `Field` cục bộ, dùng bản ở `ops-mail-bits.tsx` (giống hệt nhau tới
 *     từng thuộc tính, kể cả luật "bỏ hẳn dòng, đừng in N/A");
 *   · ngồi lên `BrandShell` để có dải nhận diện, chân thư đầy đủ và một nút.
 *
 *  ------------------------------------------------------------------
 *  THÂN VẪN LÀ DANH SÁCH `Field` DÀY, KHÔNG PHẢI `FactBox`
 *  ------------------------------------------------------------------
 *  Người đọc là sale đang lướt hộp thư và cần quét mười dòng một lúc.
 *  `FactBox` thưa hơn và đẹp hơn, nhưng mỗi dữ kiện chiếm ba dòng — với mười
 *  hai trường thì lá thư dài gấp ba và không còn quét được. Khung lo phần
 *  nhận diện; mật độ là việc của thân. */
export type LeadIntakeInternalUtm = {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
}

/** Everything `renderLeadIntakeInternal` needs. Every optional field here is
 *  OMITTED from the mail body when empty (see `Field`) rather than printed as
 *  "N/A" — a blank UTM set is a direct visit, not a data gap. */
export type LeadIntakeInternalData = {
  leadCode: string
  company: string
  contactName: string
  email: string
  phone?: string
  pain?: string
  landingPage: string
  utm?: LeadIntakeInternalUtm
  receivedAt: string
  leadUrl: string
  /** Gốc URL công khai của ảnh nhận diện — xem `PV_BRAND_ASSET_URL`. */
  assetBaseUrl: string
}

function formatReceivedAt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date)
}

/** Nhãn của một khối trường — nhỏ, mờ, không phải tiêu đề. */
function BlockLabel({ children }: { children: string }) {
  return (
    <Text style={{ margin: '0 0 2px', fontSize: 12, color: COLOR_MUTED, fontFamily: FONT_STACK }}>
      {children}
    </Text>
  )
}

export function LeadIntakeInternalEmail(data: LeadIntakeInternalData) {
  const painLines = data.pain
    ? data.pain.split(/\r?\n/).filter((line) => line.trim().length > 0)
    : []

  const utmRows: Array<[string, string | undefined]> = [
    ['Nguồn (utm_source)', data.utm?.source],
    ['Kênh (utm_medium)', data.utm?.medium],
    ['Chiến dịch (utm_campaign)', data.utm?.campaign],
    ['Nội dung (utm_content)', data.utm?.content],
    ['Từ khoá (utm_term)', data.utm?.term],
  ]
  const hasUtm = utmRows.some(([, value]) => Boolean(value && value.trim()))

  return (
    <BrandShell
      preview={`${data.company} · ${data.contactName} vừa gửi form trên ${data.landingPage}`}
      assetBaseUrl={data.assetBaseUrl}
    >
      <ShellHeading>Lead landing page mới</ShellHeading>
      {/* Mã và giờ nhận đứng chung một dòng: cả hai đều là "lá thư này nói về
          cái gì, lúc nào", và tách ra hai dòng chỉ đẩy phần trường xuống sâu
          hơn trong khung xem trước. */}
      <Eyebrow>
        Mã lead {data.leadCode} · nhận lúc {formatReceivedAt(data.receivedAt)}
      </Eyebrow>

      <Section>
        <Field label="Công ty" value={data.company} />
        <Field label="Người liên hệ" value={data.contactName} />
        <Field label="Email" value={data.email} />
        <Field label="Điện thoại" value={data.phone} />
      </Section>

      {painLines.length > 0 ? (
        <Section style={{ marginTop: 4 }}>
          <BlockLabel>Vấn đề khách gặp phải</BlockLabel>
          {painLines.map((line, index) => (
            <Text
              key={`pain-${index}`}
              style={{
                margin: '0 0 4px',
                fontSize: 14,
                lineHeight: '20px',
                color: COLOR_INK,
                fontFamily: FONT_STACK,
              }}
            >
              {line}
            </Text>
          ))}
        </Section>
      ) : null}

      <Divider />

      <Section>
        <Field label="Landing page" value={data.landingPage} />
        {hasUtm
          ? utmRows.map(([label, value]) => <Field key={label} label={label} value={value} />)
          : null}
      </Section>

      <Divider />

      <CtaButton href={data.leadUrl}>Mở lead {data.leadCode}</CtaButton>
      <FallbackLink url={data.leadUrl} />
    </BrandShell>
  )
}
