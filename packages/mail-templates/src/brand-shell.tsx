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
  COLOR_ALERT,
  COLOR_BG,
  COLOR_INK,
  COLOR_MUTED,
  COLOR_PRIMARY,
  COLOR_SURFACE,
  FONT_HREF,
  FONT_STACK,
  NUMERIC,
} from './ops-mail-style'

/** KHUNG CHUNG CỦA MỌI LÁ THƯ PV — dải nhận diện trên, chân thư đầy đủ dưới,
 *  nội dung ở giữa là `children`.
 *
 *  ==================================================================
 *  MỘT KHUNG CHO CẢ NỘI BỘ LẪN GỬI KHÁCH — VÀ VÌ SAO ĐỔI Ý
 *  ==================================================================
 *  Bản đầu của file này lập luận rằng ba loại người đọc cần ba khung. Lập
 *  luận đó sai ở một chỗ: nó nhầm BỐ CỤC với MẬT ĐỘ. Cái mà thư nội bộ thật
 *  sự cần khác đi là phần THÂN — danh sách trường dày để quét mười dòng một
 *  lúc, thay vì đoạn văn thưa. Còn dải nhận diện, chân thư và một nút hành
 *  động thì cả ba loại đều cần như nhau, và ba bản sao của chúng là ba chỗ để
 *  địa chỉ công ty, logo và câu chân thư trôi khỏi nhau.
 *
 *  Nên bây giờ: MỘT khung, ba kiểu thân.
 *
 *   · nội bộ — `Field` của `ops-mail-bits.tsx` xếp dày trong `children`
 *   · giao dịch — `ShellHeading` + `Para` + `FactBox`
 *   · MAS — đoạn văn từ `sales.mail_template`, chân thư mang liên kết huỷ
 *
 *  Hai chỗ khung phải nhường cho lá thư, và cả hai đều là slot chứ không phải
 *  cờ boolean: `footerNote` (thư tiếp thị bắt buộc có liên kết huỷ đăng ký) và
 *  `postal` (một lô MAS in địa chỉ đã chụp lúc tạo lô, không phải địa chỉ
 *  hôm nay).
 *
 *  ------------------------------------------------------------------
 *  MỌI KIỂU DÁNG ĐI INLINE TRÊN CHÍNH THẺ
 *  ------------------------------------------------------------------
 *  Không có class, không có `var(--*)`. Gmail bản web bóc khối `<style>` khỏi
 *  `<head>`, phần lớn cổng thư doanh nghiệp cũng vậy, nên thứ duy nhất chắc
 *  chắn còn lại là thuộc tính `style` trên từng thẻ. Xấu khi đọc code, nhưng
 *  đây là ràng buộc của môi trường chứ không phải lựa chọn.
 *
 *  Đặc biệt `fontFamily`: nó nằm trên TỪNG thẻ chữ (`TEXT` bên dưới) chứ
 *  không chỉ trên `<body>`. Engine Word của Outlook không cho `font-family`
 *  thừa kế đáng tin vào trong `<table>`, mà `Row`/`Column`/`Section` của
 *  React Email đều dựng ra bảng — thiếu nó thì đúng những khối quan trọng
 *  nhất rơi về phông mặc định của Word.
 *
 *  Bố cục ngang cũng dựng bằng `Row`/`Column` chứ không flexbox, cùng lý do:
 *  Word không biết flex và sẽ xếp mọi thứ thành một cột dọc.
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
  /** Danh tính in ở chân thư. Bỏ trống = `BRAND.legalName` + `BRAND.postal`.
   *
   *  Ghi đè được vì một lô MAS CHỤP danh tính người gửi lúc tạo lô và phải
   *  giữ nguyên nó tới lúc gửi xong — cùng lý do `mail_run.from_address` là
   *  một cột chứ không phải một lần đọc biến môi trường. Một lô đã duyệt dưới
   *  một danh tính mà đi ra dưới danh tính khác là một lô khác.
   *
   *  Cả cặp cùng vào hoặc cùng không, không tách lẻ: một chân thư mang tên
   *  công ty hôm nay cạnh địa chỉ của năm ngoái sai hơn cả hai bản thuần. */
  sender?: { name: string; address: string }
}

/** Phông gắn trên từng thẻ chữ. Xem đoạn "MỌI KIỂU DÁNG ĐI INLINE" ở trên —
 *  đây là thứ đứng giữa lá thư và Times New Roman của Outlook. */
const TEXT = { fontFamily: FONT_STACK } as const

const PAGE_STYLE = {
  backgroundColor: COLOR_SURFACE,
  margin: 0,
  padding: '32px 0',
  ...TEXT,
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

export function BrandShell({
  preview,
  assetBaseUrl,
  children,
  footerNote,
  postal,
}: BrandShellProps) {
  return (
    <Html lang="vi">
      <Head>
        {/* Webfont là phép nâng cấp cơ hội — xem `FONT_HREF`. Client nào bóc
            thẻ này thì đọc bằng phông hệ thống, và `FONT_STACK` được dựng để
            việc đó không nhìn ra là một sự cố. */}
        <link rel="stylesheet" href={FONT_HREF} />
      </Head>
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
                    ...TEXT,
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
                    ...TEXT,
                  }}
                >
                  {BRAND.org}
                </Text>
              </Column>
            </Row>
          </Section>

          <Section style={CONTENT_STYLE}>{children}</Section>

          <Hr style={{ borderColor: COLOR_SURFACE, margin: '0 32px' }} />

          <BrandFooter assetBaseUrl={assetBaseUrl} note={footerNote} postal={postal} />
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
function BrandFooter({
  assetBaseUrl,
  note,
  postal,
}: {
  assetBaseUrl: string
  note?: ReactNode
  postal?: string
}) {
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
          <Text
            style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: COLOR_INK, ...TEXT }}
          >
            {BRAND.legalName}
          </Text>
          {/* `lineHeight` rộng hơn thường lệ vì đây là địa chỉ: nó gãy dòng ở
              chỗ không đoán trước được, và hai dòng địa chỉ dính nhau đọc ra
              thành một dòng dài vô nghĩa. */}
          <Text
            style={{
              margin: '0 0 6px',
              fontSize: 12,
              lineHeight: '19px',
              color: COLOR_MUTED,
              ...TEXT,
            }}
          >
            {postal ?? BRAND.postal}
          </Text>
          <Text
            style={{ margin: 0, fontSize: 12, lineHeight: '19px', color: COLOR_MUTED, ...TEXT }}
          >
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

      <Text style={{ margin: 0, fontSize: 12, lineHeight: '18px', color: COLOR_MUTED, ...TEXT }}>
        {note ?? `Thư này do hệ thống ${BRAND.product} gửi tự động, không cần trả lời.`}
      </Text>
    </Section>
  )
}

/** Tiêu đề thân thư. Một lá thư có ĐÚNG MỘT cái — nó là câu trả lời cho "thư
 *  này về chuyện gì", và hai câu trả lời nghĩa là hai lá thư.
 *
 *  `tone="alert"` cho tin xấu (đơn thua). Là một `<Text>` làm việc của tiêu đề
 *  chứ không phải `<h1>`, và lý do nằm ở bản plain-text: bộ dựng mặc định
 *  VIẾT HOA toàn bộ tiêu đề thật, đọc ra thành đúng thứ "chữ in hoa nhồi" mà
 *  luật 15 cấm. */
export function ShellHeading({ children, tone }: { children: ReactNode; tone?: 'alert' }) {
  return (
    <Text
      style={{
        margin: '0 0 6px',
        fontSize: 22,
        lineHeight: '29px',
        fontWeight: 700,
        letterSpacing: '-0.015em',
        color: tone === 'alert' ? COLOR_ALERT : COLOR_INK,
        ...TEXT,
      }}
    >
      {children}
    </Text>
  )
}

/** Dòng định danh ngay dưới tiêu đề — mã đối tượng, nguồn, quan hệ. Ba lá thư
 *  nội bộ đều mở bằng đúng hình này ("OP-0231 · từ lead LD-0847"), nên nó là
 *  một component chứ không phải ba `<Text>` chép tay. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <Text style={{ margin: '0 0 22px', fontSize: 12, color: COLOR_MUTED, ...NUMERIC, ...TEXT }}>
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
      style={{
        margin: '0 0 14px',
        fontSize: 15,
        lineHeight: '25px',
        color: COLOR_INK,
        ...NUMERIC,
        ...TEXT,
      }}
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
        ...TEXT,
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
 *  Nhãn và giá trị nằm ở HAI `<Text>` xếp dọc, khác với `Field` của thư nội bộ
 *  vốn nhét cả hai vào một dòng: thư nội bộ tối ưu cho việc quét mười dòng một
 *  lúc, còn ở đây có ba bốn dữ kiện và mỗi cái đáng được nhìn.
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
          ...TEXT,
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
          ...TEXT,
        }}
      >
        {value}
      </Text>
    </Section>
  )
}

/** Đường dẫn dự phòng dưới nút — in NGUYÊN URL làm chữ hiển thị.
 *
 *  Không giấu sau một chữ "bấm vào đây". Với thư gửi khách: một lá thư bảo họ
 *  bấm vào một chữ không cho biết đích đến chính là hình dạng của thư lừa
 *  đảo, và thói quen đúng — nhìn địa chỉ trước khi bấm — là thứ ta muốn củng
 *  cố chứ không phá. Với thư nội bộ: mail hay được chuyển tiếp, và người nhận
 *  thứ hai cần thấy nó trỏ vào đâu trước khi bấm. */
export function FallbackLink({ url }: { url: string }) {
  return (
    <Text
      style={{
        margin: 0,
        fontSize: 13,
        lineHeight: '20px',
        wordBreak: 'break-all',
        ...NUMERIC,
        ...TEXT,
      }}
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
          ...TEXT,
        }}
      >
        {children}
      </Link>
    </Section>
  )
}
