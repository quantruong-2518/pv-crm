/** `pnpm mail:preview` — mở mọi mẫu mail trong trình duyệt, render lại mỗi
 *  lần F5.
 *
 *  ==================================================================
 *  VÌ SAO CẦN MỘT LỆNH RIÊNG CHO VIỆC NÀY
 *  ==================================================================
 *  Mẫu mail là góc duy nhất của repo mà KHÔNG có gì nhìn hộ. Màn hình có
 *  `pnpm dev`, kiểu có `tsc`, luật Aurora có eslint — còn một lá thư thì
 *  không compiler nào biết nó vỡ, không test nào render nó, và người đầu tiên
 *  phát hiện ra là người nhận. `ops-mail-bits.tsx` đã ghi đúng câu đó thành
 *  lời cảnh báo; file này là câu trả lời cho nó.
 *
 *  Trước khi có lệnh này, cách duy nhất để nhìn một lá thư là viết tạm một
 *  file `*.test.ts` ghi HTML ra đĩa rồi xoá đi — đúng cái vòng mà `CLAUDE.md`
 *  không muốn ai phải lặp lại.
 *
 *  ------------------------------------------------------------------
 *  RENDER LẠI MỖI LẦN GỌI, KHÔNG DỰNG SẴN RA THƯ MỤC
 *  ------------------------------------------------------------------
 *  Mỗi request nạp lại module qua `ssrLoadModule` và dựng lại thân thư. Sửa
 *  một dòng trong `brand-shell.tsx` rồi F5 là thấy ngay, không phải chạy lại
 *  lệnh. Đổi lại, không có thư mục kết quả nào để lỡ tay commit — thứ vẫn xảy
 *  ra với mọi công cụ ghi ra đĩa.
 *
 *  ------------------------------------------------------------------
 *  KHÔNG THÊM PHỤ THUỘC NÀO
 *  ------------------------------------------------------------------
 *  `vite` đã là devDependency ở gốc repo, và `ssrLoadModule` của nó biên dịch
 *  TSX sẵn. Một gói chạy-TS thứ hai (`tsx`, `vite-node`) sẽ là bộ phân giải
 *  module thứ hai trong cây — tức là một chỗ nữa để "chạy được ở công cụ này,
 *  vỡ ở công cụ kia".
 *
 *  ------------------------------------------------------------------
 *  DỮ LIỆU MẪU Ở ĐÂY LÀ DỮ LIỆU MẪU, KHÔNG PHẢI FIXTURE
 *  ------------------------------------------------------------------
 *  Số trong `SAMPLES` bên dưới KHÔNG phải số của kịch bản Sao Đỏ hay DAS Vina
 *  và không được chép ngược vào bất cứ đâu. Chúng tồn tại để ép mẫu thư vào
 *  trạng thái khó nhất: tên dài, địa chỉ dài, URL dài có token, trường tuỳ
 *  chọn lúc có lúc không. Một mẫu thư đẹp với dữ liệu đẹp thì chưa chứng minh
 *  được gì.
 *
 *  Vì thế file này KHÔNG nạp `@pv/engines/fixtures`: ràng buộc "thêm số mới
 *  vào fixture phải kèm test khoá số" tồn tại để bảo vệ số liệu demo, và kéo
 *  fixture vào một công cụ xem trước chỉ tạo thêm một chỗ cho số thật rò ra
 *  ngoài kịch bản của nó. */
import { createServer as createHttpServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'

const ROOT = new URL('../../', import.meta.url)
const ENTRY = fileURLToPath(new URL('packages/mail-templates/src/index.ts', ROOT))
const BRAND_DIR = new URL('apps/web/public/brand/', ROOT)

/** Cổng riêng, không đụng 5173 của `pnpm dev` — hai thứ hay chạy cùng lúc, và
 *  Vite nhảy cổng khi bị chiếm thì địa chỉ in ra ở đây sẽ sai. */
const PORT = Number(process.env.PV_MAIL_PREVIEW_PORT ?? 5175)
const ORIGIN = `http://localhost:${PORT}`

/** Mốc thời gian TRÔI THEO lúc chạy chứ không phải một hằng số ISO.
 *
 *  Ba mẫu thư in khoảng cách thời gian ("còn 60 phút", "mở 12 ngày"), và một
 *  mốc cố định sẽ làm chúng in ra "đã quá hạn" sau vài hôm — người xem sẽ
 *  tưởng mình vừa làm hỏng cái gì. */
const inHours = (h) => new Date(Date.now() + h * 3_600_000).toISOString()
const agoHours = (h) => new Date(Date.now() - h * 3_600_000).toISOString()

const SAMPLES = [
  {
    slug: 'password-reset-invite',
    title: 'Đặt mật khẩu · lời mời',
    note: 'Vé 7 ngày. Người nhận chưa từng thấy PV One bao giờ.',
    render: (m, assetBaseUrl) =>
      m.renderPasswordReset({
        purpose: 'invite',
        name: 'Nguyễn Thị Minh Hằng',
        email: 'minh.hang@pebblevina.com',
        link: `${ORIGIN}/dat-lai-mat-khau?token=b7f3c9a12b4de40a18a1c6e5d0b93f27a4c8e1d6`,
        assetBaseUrl,
        expiresAt: inHours(24 * 7),
      }),
  },
  {
    slug: 'password-reset-reset',
    title: 'Đặt mật khẩu · quên mật khẩu',
    note: 'Vé 60 phút. Cùng một file mẫu, khác lời chào và khác TTL.',
    render: (m, assetBaseUrl) =>
      m.renderPasswordReset({
        purpose: 'reset',
        name: 'Hà Trần',
        email: 'ha.tran@pebblevina.com',
        link: `${ORIGIN}/dat-lai-mat-khau?token=7f3c9a12b4de40a18a1c6e5d0b93`,
        assetBaseUrl,
        expiresAt: inHours(1),
      }),
  },
  {
    slug: 'lead-intake-internal',
    title: 'Lead landing page · nội bộ',
    note: 'Khung nội bộ (ops), KHÔNG dùng brand-shell. Mọi trường tuỳ chọn đều có mặt.',
    render: (m, assetBaseUrl) =>
      m.renderLeadIntakeInternal({
        leadCode: 'LD-0847',
        company: 'Công ty TNHH Cơ khí chính xác Đông Thành',
        contactName: 'Phạm Quốc Đạt',
        email: 'dat.pham@dongthanh-precision.vn',
        phone: '0912 345 678',
        pain: 'Đang cần thay dây chuyền kiểm tra kích thước tự động cho xưởng số 2, hiện đo tay nên tỉ lệ lọt lỗi cao.',
        landingPage: 'https://pebblevina.com/giai-phap/do-luong-tu-dong',
        utm: {
          source: 'google',
          medium: 'cpc',
          campaign: 'do-luong-q3',
          content: 'bien-the-b',
          term: 'máy đo 3 chiều',
        },
        assetBaseUrl,
        receivedAt: agoHours(2),
        leadUrl: `${ORIGIN}/leads/LD-0847`,
      }),
  },
  {
    slug: 'lead-intake-internal-toi-thieu',
    title: 'Lead landing page · chỉ trường bắt buộc',
    note: 'Cùng mẫu, bỏ hết trường tuỳ chọn — để kiểm luật "bỏ hẳn dòng, đừng in N/A".',
    render: (m, assetBaseUrl) =>
      m.renderLeadIntakeInternal({
        leadCode: 'LD-0848',
        company: 'Sao Mai JSC',
        contactName: 'Lê Vân',
        email: 'van.le@saomai.vn',
        landingPage: 'https://pebblevina.com/lien-he',
        assetBaseUrl,
        receivedAt: agoHours(1),
        leadUrl: `${ORIGIN}/leads/LD-0848`,
      }),
  },
  {
    slug: 'opportunity-opened',
    title: 'Cơ hội mới mở',
    note: 'Khung nội bộ. Có tiền, có ngày đóng dự kiến, hai phía chủ sở hữu.',
    render: (m, assetBaseUrl) =>
      m.renderOpportunityOpened({
        opCode: 'OP-0231',
        leadCode: 'LD-0847',
        account: 'Công ty TNHH Cơ khí chính xác Đông Thành',
        name: 'Dây chuyền đo tự động — xưởng 2',
        stateLabel: 'Đang chạy',
        stageLabel: 'Đã demo',
        amount: 4_850_000_000,
        currency: 'VND',
        expectedClose: '2026-11-30',
        saleOwners: ['Trần Huy Đức', 'Nguyễn Thị Minh Hằng'],
        bdOwners: ['Hà Trần'],
        description: 'Khách đã xem demo tại nhà máy, đang chờ báo giá kèm phương án lắp đặt.',
        assetBaseUrl,
        openedAt: agoHours(30),
        opUrl: `${ORIGIN}/co-hoi/OP-0231`,
      }),
  },
  {
    slug: 'opportunity-lost',
    title: 'Đơn thua',
    note: 'Khung nội bộ, giọng cảnh báo. Không có tiền — để kiểm nhánh `amount: null`.',
    render: (m, assetBaseUrl) =>
      m.renderOpportunityLost({
        opCode: 'OP-0198',
        leadCode: 'LD-0712',
        account: 'Nhà máy Điện tử Bắc Hà',
        name: 'Nâng cấp trạm kiểm tra AOI',
        amount: null,
        currency: null,
        lossReason: 'Giá cao hơn đối thủ',
        lossNote: 'Khách chốt với nhà cung cấp cũ vì đã có sẵn hợp đồng bảo trì tới hết 2027.',
        saleOwners: ['Trần Huy Đức'],
        bdOwners: [],
        assetBaseUrl,
        closedAt: agoHours(6),
        daysOpen: 64,
        opUrl: `${ORIGIN}/co-hoi/OP-0198`,
      }),
  },
  {
    slug: 'mas-shell',
    title: 'MAS · khung tiếp thị',
    note: 'Khung thứ ba. Nội dung thật tới từ `sales.mail_template`, đây chỉ là chỗ đổ vào.',
    render: (m, assetBaseUrl) =>
      m.renderMasShell({
        subject: 'Bốn cách rút ngắn vòng kiểm tra chất lượng trong xưởng cơ khí',
        paragraphs: [
          'Chào anh/chị,',
          'Trong ba tháng vừa rồi chúng tôi làm việc với chín xưởng cơ khí chính xác ở miền Bắc, và cả chín đều dừng ở cùng một chỗ: khâu đo kiểm vẫn làm tay trong khi mọi khâu trước nó đã tự động.',
          'Chúng tôi gom lại thành một bản ghi chép ngắn — bốn cách các xưởng đó đã rút ngắn vòng kiểm tra, kèm con số trước và sau ở từng nơi.',
        ],
        cta: { label: 'Đọc bản ghi chép', url: 'https://pebblevina.com/ghi-chep/do-kiem' },
        assetBaseUrl,
        unsubscribeUrl: `${ORIGIN}/unsubscribe?token=mau-xem-truoc`,
        sender: {
          name: 'Pebble Vina Technology',
          address:
            'Văn phòng O1912, Tầng 19, Landmark 72 Tower, Khu E6, ' +
            'Khu đô thị mới Cầu Giấy, P. Yên Hoà, Hà Nội',
        },
      }),
  },
]

/** Trang danh sách. Cố tình là HTML trần, không nhập gì từ `@pv/ui`: đây là
 *  công cụ, không phải một màn của sản phẩm, và một công cụ kéo theo cả hệ
 *  thiết kế sẽ vỡ mỗi lần hệ thiết kế đổi. */
function indexPage() {
  const rows = SAMPLES.map(
    (s) => `<li>
      <a href="/t/${s.slug}">${escapeHtml(s.title)}</a>
      <p>${escapeHtml(s.note)}</p>
    </li>`,
  ).join('')

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><title>Mẫu mail PV One</title>
<style>
  body{font:15px/1.6 Inter,-apple-system,'Segoe UI',Roboto,sans-serif;
       max-width:44rem;margin:3rem auto;padding:0 1.5rem;color:#0F172A}
  h1{font-size:1.4rem;margin:0 0 .25rem}
  header p{color:#5E6B80;margin:0 0 2rem}
  ul{list-style:none;padding:0}
  li{padding:.9rem 0;border-bottom:1px solid #E5E7EB}
  a{color:#2E63E6;font-weight:600;text-decoration:none}
  a:hover{text-decoration:underline}
  li p{margin:.2rem 0 0;color:#5E6B80;font-size:.85rem}
</style></head>
<body><header><h1>Mẫu mail PV One</h1>
<p>Sửa file trong <code>packages/mail-templates/src</code> rồi F5 — thân thư dựng lại mỗi lần tải.</p>
</header><ul>${rows}</ul></body></html>`
}

function escapeHtml(value) {
  return value.replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  )
}

const MIME = { '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' }

const vite = await createViteServer({
  root: fileURLToPath(ROOT),
  appType: 'custom',
  server: { middlewareMode: true },
  /* `info` nuốt mất dòng nào? Không dòng nào đáng — ở chế độ middleware Vite
     in mỗi lần nạp lại module, và với một trang render lại toàn bộ cây thì đó
     là hàng chục dòng mỗi lần F5, che mất chính lỗi ta đang tìm. */
  logLevel: 'warn',
})

const server = createHttpServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN)

  try {
    if (url.pathname === '/') {
      return send(res, 200, 'text/html; charset=utf-8', indexPage())
    }

    /* Ảnh nhận diện phục vụ thẳng từ `apps/web/public/brand` — đúng thư mục
       mà bản triển khai thật phục vụ, nên nếu một file thiếu ở đây thì nó
       cũng thiếu trong thư thật. Một thư mục ảnh riêng cho bản xem trước sẽ
       giấu mất đúng lỗi đó. */
    if (url.pathname.startsWith('/brand/')) {
      const name = url.pathname.slice('/brand/'.length)
      /* Chặn `..` và mọi đường dẫn có gạch chéo: thư mục này chỉ có file
         phẳng, nên bất cứ thứ gì phức tạp hơn một tên file đều là dấu hiệu
         của một request không thật thà. */
      if (!/^[\w.-]+$/.test(name) || name.includes('..')) return send(res, 400, 'text/plain', 'no')
      const body = await readFile(new URL(name, BRAND_DIR))
      return send(res, 200, MIME[extname(name)] ?? 'application/octet-stream', body)
    }

    if (url.pathname.startsWith('/t/')) {
      const sample = SAMPLES.find((s) => s.slug === url.pathname.slice('/t/'.length))
      if (!sample) return send(res, 404, 'text/plain; charset=utf-8', 'Không có mẫu này.')

      const templates = await vite.ssrLoadModule(ENTRY)
      const { html } = await sample.render(templates, `${ORIGIN}/brand`)
      return send(res, 200, 'text/html; charset=utf-8', html)
    }

    return send(res, 404, 'text/plain; charset=utf-8', 'Không có trang này.')
  } catch (error) {
    /* Lỗi in RA MÀN HÌNH TRÌNH DUYỆT chứ không chỉ ra terminal, kèm stack đã
       được Vite ánh xạ về đúng dòng trong file `.tsx`. Người đang sửa mẫu thư
       đang nhìn tab trình duyệt, không nhìn terminal. */
    if (error instanceof Error) vite.ssrFixStacktrace(error)
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)
    send(res, 500, 'text/html; charset=utf-8', `<pre>${escapeHtml(detail)}</pre>`)
  }
})

function send(res, status, type, body) {
  res.writeHead(status, {
    'content-type': type,
    /* Không cache gì hết. Cả điểm của công cụ này là F5 thấy bản mới. */
    'cache-control': 'no-store',
  })
  res.end(body)
}

server.listen(PORT, () => {
  console.log(`\n  Mẫu mail PV One  →  ${ORIGIN}\n`)
})
