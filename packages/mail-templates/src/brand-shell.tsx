import {
  Body,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components'
import type { ReactNode } from 'react'
import { BRAND, markUrl } from './brand'
import {
  COLOR_BG,
  COLOR_INK,
  COLOR_MUTED,
  COLOR_PRIMARY,
  COLOR_SURFACE,
  FONT_STACK,
  NUMERIC,
} from './ops-mail-style'

/** KHUNG CHUNG CỦA THƯ GIAO DỊCH — dải nhận diện trên, chân thư đầy đủ dưới,
 *  nội dung ở giữa là `children`.
 *
 *  ==================================================================
 *  BA KHUNG, VÀ VÌ SAO KHÔNG GỘP ĐƯỢC THÀNH MỘT
 *  ==================================================================
 *  Gói này có ba khung, chia theo NGƯỜI NHẬN chứ không theo hình dạng:
 *
 *   · `ops-mail-bits.tsx` — thư nội bộ. Người đọc là nhân viên kinh doanh
 *     đang lướt hộp thư: dày đặc trường, không lời chào, không CTA to. Đẹp ở
 *     đây nghĩa là quét nhanh được.
 *   · `mas-shell.tsx` — thư tiếp thị hàng loạt. Bắt buộc mang liên kết huỷ
 *     đăng ký, và nội dung tới từ `sales.mail_template` chứ không từ code.
 *   · file này — thư giao dịch gửi RA NGOÀI: đặt mật khẩu, xác nhận đã nhận
 *     thông tin, lời mời họp, bản hợp đồng. Một người, một việc, một nút.
 *
 *  Mặc `mas-shell` cho thư giao dịch sẽ gắn vào đó một liên kết huỷ đăng ký
 *  cho thứ người ta KHÔNG đăng ký và KHÔNG được phép tắt — dạy người nhận một
 *  điều sai về chính hệ thống. Mặc `ops-mail-bits` thì gửi cho khách một lá
 *  thư trông như log nội bộ. Ba khung là ba người đọc, không phải ba khẩu vị.
 *
 *  ------------------------------------------------------------------
 *  MỌI KIỂU DÁNG ĐI INLINE TRÊN CHÍNH THẺ
 *  ------------------------------------------------------------------
 *  Không có `<style>`, không có class, không có `var(--*)`. Gmail bản web bóc
 *  khối `<style>` khỏi `<head>`, phần lớn cổng thư doanh nghiệp cũng vậy, nên
 *  thứ duy nhất chắc chắn còn lại là thuộc tính `style` trên từng thẻ. Xấu khi
 *  đọc code, nhưng đây là ràng buộc của môi trường chứ không phải lựa chọn.
 *
 *  Bố cục ngang dựng bằng `Row`/`Column` (tức `<table>`) chứ không flexbox:
 *  Outlook trên Windows render bằng engine của Word, thứ không biết flex và
 *  sẽ xếp mọi thứ thành một cột dọc.
 *
 *  ------------------------------------------------------------------
 *  THƯ PHẢI ĐỌC ĐƯỢC KHI ẢNH BỊ CHẶN
 *  ------------------------------------------------------------------
 *  Rất nhiều client tắt ảnh mặc định ở lần đầu nhận thư từ một địa chỉ lạ —
 *  đúng cái lần mà lá thư này quan trọng nhất. Nên chữ "PV One" nằm cạnh dấu
 *  hiệu dưới dạng CHỮ THẬT, và ảnh mang `alt=""`: nó là trang trí, phần thông
 *  tin đã có người khác gánh. Đặt `alt="PV One"` sẽ thành đọc hai lần khi có
 *  trình đọc màn hình, và thành hai chữ "PV One" chồng nhau khi ảnh bị chặn. */
export type BrandShellProps = {
  /** Dòng xem trước trong danh sách hộp thư — sau tiêu đề, đây là thứ quyết
   *  định thư có được mở hay không. Không bỏ trống. */
  preview: string
  /** Gốc URL công khai của thư mục ảnh nhận diện, ví dụ
   *  `https://app.pebblevina.com/brand`. Vào bằng props vì đây là sự thật của
   *  bản triển khai; xem `PV_BRAND_ASSET_URL` bên `apps/api`. */
  assetBaseUrl: string
  children: ReactNode
  /** Dòng cuối cùng của chân thư. Bỏ trống = câu "thư tự động".
   *
   *  Là một slot chứ không phải một cờ boolean vì thứ đứng ở đây khác nhau
   *  theo LOẠI thư, không theo có/không: thư giao dịch nói "không cần trả
   *  lời", thư có người trực nói "trả lời thẳng thư này", và thư tiếp thị bắt
   *  buộc đặt liên kết huỷ đăng ký. Một boolean sẽ phải mọc thêm nhánh mỗi
   *  lần có loại thư mới. */
  footerNote?: ReactNode
}

const PAGE_STYLE = {
  backgroundColor: COLOR_SURFACE,
  margin: 0,
  padding: '32px 0',
  fontFamily: FONT_STACK,
} as const

/** Tấm thẻ trắng nổi trên nền lõm. 560px là bề ngang quen thuộc của thư — hẹp
 *  hơn thì dòng gãy vụn trên máy tính, rộng hơn thì vượt khung xem trước dọc
 *  mà phần lớn hộp thư mở mặc định. */
const CARD_STYLE = {
  maxWidth: 560,
  margin: '0 auto',
  backgroundColor: COLOR_BG,
  borderRadius: 12,
} as const

const HEADER_STYLE = {
  backgroundColor: COLOR_INK,
  padding: '24px 32px',
  borderRadius: '12px 12px 0 0',
} as const

const CONTENT_STYLE = { padding: '32px' } as const

export function BrandShell({ preview, assetBaseUrl, children, footerNote }: BrandShellProps) {
  return (
    <Html lang="vi">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={PAGE_STYLE}>
        <Container style={CARD_STYLE}>
          <Section style={HEADER_STYLE}>
            <Row>
              {/* Bề ngang cột nêu bằng THUỘC TÍNH `width` của ô, không chỉ
                  bằng CSS: Outlook đọc thuộc tính của bảng và bỏ qua một phần
                  CSS, nên thiếu nó thì cột logo co lại còn bằng đúng ảnh và
                  chữ dính vào dấu hiệu. */}
              <Column style={{ width: 44, verticalAlign: 'middle' }} width={44}>
                <Img
                  src={markUrl(assetBaseUrl, 'light')}
                  width="32"
                  height="32"
                  alt=""
                  style={{ display: 'block', border: 0 }}
                />
              </Column>
              <Column style={{ verticalAlign: 'middle' }}>
                <Text
                  style={{
                    margin: 0,
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: '-0.01em',
                    color: COLOR_BG,
                  }}
                >
                  {BRAND.product}
                </Text>
              </Column>
              <Column style={{ verticalAlign: 'middle', textAlign: 'right' }}>
                <Text
                  style={{
                    margin: 0,
                    fontSize: 12,
                    fontWeight: 500,
                    letterSpacing: '0.04em',
                    color: COLOR_SURFACE,
                  }}
                >
                  {BRAND.org}
                </Text>
              </Column>
            </Row>
          </Section>

          <Section style={CONTENT_STYLE}>{children}</Section>

          <Hr style={{ borderColor: COLOR_SURFACE, margin: '0 32px' }} />

          <BrandFooter assetBaseUrl={assetBaseUrl} note={footerNote} />
        </Container>
      </Body>
    </Html>
  )
}

/** Chân thư — nền TRẮNG chứ không phải nền lõm, và đó là một quyết định về
 *  tương phản chứ không phải về thẩm mỹ.
 *
 *  `Slate Gray` trên `Light Gray` đo được 4.35:1, dưới ngưỡng 4.5:1 của luật
 *  13. Hai đường thoát: giữ nền lõm rồi đổi mọi chữ chân thư sang `Deep Navy`
 *  (đạt 14.5:1 nhưng chân thư nặng ngang thân thư, mắt không còn biết đâu là
 *  phần phụ), hoặc giữ nền trắng để `Slate Gray` đạt 5.38:1 và chân thư mờ đi
 *  đúng như vai trò của nó. Chọn đường thứ hai; phần "lùi lại một bậc" do
 *  đường kẻ và cỡ chữ gánh, không cần tới màu nền. */
function BrandFooter({ assetBaseUrl, note }: { assetBaseUrl: string; note?: ReactNode }) {
  return (
    <Section style={{ padding: '24px 32px 28px' }}>
      <Row>
        <Column style={{ width: 30, verticalAlign: 'top' }} width={30}>
          <Img
            src={markUrl(assetBaseUrl, 'blue')}
            width="20"
            height="20"
            alt=""
            style={{ display: 'block', border: 0 }}
          />
        </Column>
        <Column style={{ verticalAlign: 'top' }}>
          <Text style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: COLOR_INK }}>
            {BRAND.legalName}
          </Text>
          {/* `lineHeight` rộng hơn thường lệ vì đây là địa chỉ: nó gãy dòng ở
              chỗ không đoán trước được, và hai dòng địa chỉ dính nhau đọc ra
              thành một dòng dài vô nghĩa. */}
          <Text style={{ margin: '0 0 6px', fontSize: 12, lineHeight: '19px', color: COLOR_MUTED }}>
            {BRAND.postal}
          </Text>
          <Text style={{ margin: 0, fontSize: 12, lineHeight: '19px', color: COLOR_MUTED }}>
            <Link href={`mailto:${BRAND.contactEmail}`} style={{ color: COLOR_PRIMARY }}>
              {BRAND.contactEmail}
            </Link>
            {'  ·  '}
            <Link href={BRAND.siteUrl} style={{ color: COLOR_PRIMARY }}>
              {BRAND.site}
            </Link>
          </Text>
        </Column>
      </Row>

      <Hr style={{ borderColor: COLOR_SURFACE, margin: '18px 0 12px' }} />

      <Text style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: COLOR_MUTED }}>
        {note ?? `Thư này do hệ thống ${BRAND.product} gửi tự động, không cần trả lời.`}
      </Text>
    </Section>
  )
}

/** Tiêu đề thân thư. Một lá thư có ĐÚNG MỘT cái — nó là câu trả lời cho "thư
 *  này về chuyện gì", và hai câu trả lời nghĩa là hai lá thư. */
export function ShellHeading({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        margin: '0 0 8px',
        fontSize: 22,
        lineHeight: '29px',
        fontWeight: 700,
        letterSpacing: '-0.015em',
        color: COLOR_INK,
      }}
    >
      {children}
    </Text>
  )
}

/** Đoạn văn thân thư. `lineHeight` 1.65 chứ không phải mặc định của client:
 *  tiếng Việt có dấu chồng lên trên và dưới chữ cái, nên khoảng dòng vừa đủ
 *  cho tiếng Anh sẽ làm dấu của dòng dưới chạm chân dòng trên. */
export function Para({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{ margin: '0 0 14px', fontSize: 15, lineHeight: '25px', color: COLOR_INK, ...NUMERIC }}
    >
      {children}
    </Text>
  )
}

/** Câu phụ — điều kiện, hạn dùng, lời trấn an. Nhỏ hơn và mờ hơn `Para` để
 *  mắt biết bỏ qua được ở lượt đọc đầu. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        margin: '0 0 8px',
        fontSize: 13,
        lineHeight: '21px',
        color: COLOR_MUTED,
        ...NUMERIC,
      }}
    >
      {children}
    </Text>
  )
}

/** Hộp số liệu — mặt phẳng lõm, không viền (luật 4). Dùng cho nhóm dữ kiện mà
 *  người nhận sẽ ĐỐI CHIẾU chứ không đọc thành câu: mã đơn, ngày giờ, số
 *  tiền, tên tài khoản. */
export function FactBox({ children }: { children: ReactNode }) {
  return (
    <Section
      style={{
        backgroundColor: COLOR_SURFACE,
        borderRadius: 8,
        padding: '16px 18px',
        margin: '0 0 20px',
      }}
    >
      {children}
    </Section>
  )
}

/** Một dòng dữ kiện: nhãn nhỏ in hoa ở trên, giá trị ở dưới.
 *
 *  Nhãn và giá trị nằm ở HAI `<Text>` xếp dọc, khác với `Field` của khung nội
 *  bộ vốn nhét cả hai vào một dòng: thư nội bộ tối ưu cho việc quét mười dòng
 *  một lúc, còn ở đây có ba bốn dữ kiện và mỗi cái đáng được nhìn.
 *
 *  Không có giá trị thì KHÔNG vẽ gì — cùng luật "bỏ hẳn dòng, đừng in N/A"
 *  mà `Field` bên `ops-mail-bits.tsx` đang giữ. Một dòng "N/A" là một câu
 *  khẳng định sai; một dòng vắng mặt thì trung thực.
 *
 *  Giá trị luôn mang `NUMERIC`, kể cả khi hôm nay nó là chữ: dữ kiện ở hộp
 *  này là loại hay đổi từ chữ sang số (mã lead, số hợp đồng), và một cột số
 *  không thẳng hàng là thứ không ai để ý cho tới lúc phải đối chiếu hai lá
 *  thư cạnh nhau. */
export function Fact({ label, value }: { label: string; value?: string }) {
  if (!value || !value.trim()) return null
  return (
    <Section style={{ margin: '0 0 14px' }}>
      {/* Nhãn dùng `COLOR_INK` chứ KHÔNG phải `COLOR_MUTED`, cùng phép đo đã
          quyết định nền chân thư: `Slate Gray` trên `Light Gray` chỉ đạt
          4.35:1, dưới ngưỡng luật 13, và ở cỡ 11px thì không có ngoại lệ "chữ
          lớn" nào để dựa vào. Thứ bậc nhãn/giá trị do CỠ CHỮ, ĐỘ ĐẬM và chữ
          IN HOA gánh — ba tín hiệu, không cần tới tín hiệu thứ tư là màu. */}
      <Text
        style={{
          margin: '0 0 3px',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: COLOR_INK,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          margin: 0,
          fontSize: 15,
          lineHeight: '21px',
          fontWeight: 500,
          color: COLOR_INK,
          ...NUMERIC,
        }}
      >
        {value}
      </Text>
    </Section>
  )
}

/** Đường dẫn dự phòng dưới nút — in NGUYÊN URL làm chữ hiển thị.
 *
 *  Không giấu sau một chữ "bấm vào đây", và lý do khác với lý do của
 *  `OpenLink` bên khung nội bộ (ở đó là để người được chuyển tiếp thư biết nó
 *  trỏ đâu). Ở đây người nhận là khách: một lá thư bảo họ bấm vào một chữ
 *  không cho biết đích đến chính là hình dạng của thư lừa đảo, và thói quen
 *  đúng — nhìn địa chỉ trước khi bấm — là thứ ta muốn củng cố chứ không phá.
 *
 *  Tồn tại riêng thay vì dùng lại `OpenLink` vì màu: `OpenLink` dùng
 *  `COLOR_ACCENT`, và trong khung này màu của hành động là `COLOR_PRIMARY`.
 *  Một lá thư có hai sắc xanh cho hai liên kết là một lá thư trông như ghép
 *  từ hai nơi. */
export function FallbackLink({ url }: { url: string }) {
  return (
    <Text
      style={{ margin: 0, fontSize: 13, lineHeight: '20px', wordBreak: 'break-all', ...NUMERIC }}
    >
      <Link href={url} style={{ color: COLOR_PRIMARY }}>
        {url}
      </Link>
    </Text>
  )
}

/** Nút hành động. Một lá thư có đúng một nút, cùng lý do như `ShellHeading`.
 *
 *  Là `<a>` đội lốt nút chứ không phải `<button>` — client mail không render
 *  `<button>` một cách đáng tin, và một nút không bấm được là một lá thư
 *  hỏng. `display: inline-block` cùng `padding` phải nằm inline trên chính
 *  thẻ vì đó là thứ duy nhất sống sót qua Gmail. */
export function CtaButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Section style={{ margin: '4px 0 22px' }}>
      <Link
        href={href}
        style={{
          display: 'inline-block',
          backgroundColor: COLOR_PRIMARY,
          color: COLOR_BG,
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: '0.01em',
          textDecoration: 'none',
          padding: '14px 28px',
          borderRadius: 8,
        }}
      >
        {children}
      </Link>
    </Section>
  )
}
