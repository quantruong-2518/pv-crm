/** `pnpm mail:preview` — opens every mail template in the browser, re-rendering
 *  on every F5.
 *
 *  ==================================================================
 *  WHY THIS NEEDS ITS OWN COMMAND
 *  ==================================================================
 *  Mail templates are the one corner of the repo with NOTHING watching over
 *  them. Screens have `pnpm dev`, types have `tsc`, Aurora laws have eslint —
 *  but a mail body has no compiler that knows it's broken, no test that
 *  renders it, and the first person to find out is the recipient.
 *  `ops-mail-bits.tsx` wrote exactly that into a warning comment; this file
 *  is the answer to it.
 *
 *  Before this command existed, the only way to look at a mail body was to
 *  write a throwaway `*.test.ts` file that dumped HTML to disk and then
 *  delete it — exactly the loop `CLAUDE.md` doesn't want anyone repeating.
 *
 *  ------------------------------------------------------------------
 *  RE-RENDERS ON EVERY CALL, NEVER PRE-BUILDS TO A FOLDER
 *  ------------------------------------------------------------------
 *  Every request reloads the module via `ssrLoadModule` and rebuilds the mail
 *  body. Edit one line in `brand-shell.tsx` and F5 shows it right away,
 *  without re-running the command. The tradeoff: there's no output folder to
 *  accidentally commit — something that still happens with every tool that
 *  writes to disk.
 *
 *  ------------------------------------------------------------------
 *  NO NEW DEPENDENCY ADDED
 *  ------------------------------------------------------------------
 *  `vite` is already a devDependency at the repo root, and its
 *  `ssrLoadModule` already compiles TSX. A second TS-runner package (`tsx`,
 *  `vite-node`) would be a second module resolver in the tree — one more
 *  place for "works with this tool, breaks with that one."
 *
 *  ------------------------------------------------------------------
 *  THE SAMPLE DATA HERE IS SAMPLE DATA, NOT A FIXTURE
 *  ------------------------------------------------------------------
 *  The numbers in `SAMPLES` below are NOT the numbers of the `sao-do` or
 *  `das-vina` scenario, and must not be copied back anywhere. They exist to force
 *  the mail template into its hardest state: long names, long addresses,
 *  long URLs with a token, optional fields that come and go. A pretty
 *  template with pretty data proves nothing.
 *
 *  That's why this file does NOT load `@pv/engines/fixtures`: the rule "add a
 *  new number to a fixture and it needs a test locking that number" exists to
 *  protect demo data, and pulling a fixture into a preview tool would only
 *  create one more place for a real number to leak outside its scenario. */
import { createServer as createHttpServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer as createViteServer } from 'vite'

const ROOT = new URL('../../', import.meta.url)
const ENTRY = fileURLToPath(new URL('packages/mail-templates/src/index.ts', ROOT))
const BRAND_DIR = new URL('apps/web/public/brand/', ROOT)

/** Its own port, not touching `pnpm dev`'s 5173 — the two often run at the
 *  same time, and if Vite jumps port when 5173 is taken, the address printed
 *  here would be wrong. */
const PORT = Number(process.env.PV_MAIL_PREVIEW_PORT ?? 5175)
const ORIGIN = `http://localhost:${PORT}`

/** Timestamps DRIFT WITH the time the script runs, not a fixed ISO constant.
 *
 *  Three mail templates print a time distance ("60 minutes left", "open for
 *  12 days"), and a fixed timestamp would make them print "already expired"
 *  after a few days — the viewer would think they'd just broken something. */
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
        link: `${ORIGIN}/reset-password?token=b7f3c9a12b4de40a18a1c6e5d0b93f27a4c8e1d6`,
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
        link: `${ORIGIN}/reset-password?token=7f3c9a12b4de40a18a1c6e5d0b93`,
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
        // Deliberately uses all three structures `mail-markup.ts` understands
        // — bold, italic, list — because this is the ONLY place they can be
        // seen with human eyes.
        blocks: m.parseMailBody(
          [
            'Chào anh/chị,',
            '',
            'Trong ba tháng vừa rồi chúng tôi làm việc với **chín xưởng cơ khí chính xác** ở miền Bắc, và cả chín đều dừng ở cùng một chỗ: khâu đo kiểm vẫn làm tay trong khi mọi khâu trước nó đã tự động.',
            '',
            'Bốn cách các xưởng đó đã rút ngắn vòng kiểm tra:',
            '- Đo mẫu đầu chuyền thay vì đo toàn lô',
            '- Chuyển thước cặp tay sang đầu đo gắn máy',
            '- Ghi số thẳng vào phiếu điện tử, _không chép lại_',
            '- Đặt ngưỡng cảnh báo trước khi hàng ra khỏi chuyền',
            '',
            'Kèm con số trước và sau ở từng nơi.',
          ].join('\n'),
        ),
        cta: { label: 'Đọc bản ghi chép', url: 'https://pebblevina.com/ghi-chep/do-kiem' },
        // Both buttons at once, because the pair is the only thing worth
        // looking at here: the filled CTA over the outlined booking button is a
        // contrast judgement no test can make, and rule 13 applies to email
        // with no token layer to lean on.
        bookingUrl: 'https://calendly.com/vivian-pebblevina/30min',
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

/** The listing page. Deliberately plain HTML, importing nothing from `@pv/ui`:
 *  this is a tool, not a product screen, and a tool that drags in the whole
 *  design system would break every time the design system changes. */
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
  /* Does `info` swallow any line worth seeing? No — in middleware mode Vite
     logs on every module reload, and for a page that re-renders the whole
     tree that's dozens of lines per F5, burying the very error we're
     looking for. */
  logLevel: 'warn',
})

const server = createHttpServer(async (req, res) => {
  const url = new URL(req.url, ORIGIN)

  try {
    if (url.pathname === '/') {
      return send(res, 200, 'text/html; charset=utf-8', indexPage())
    }

    /* Brand images served straight from `apps/web/public/brand` — the exact
       folder the real deployment serves, so if a file is missing here it's
       also missing in the real mail. A separate image folder just for the
       preview would hide that very bug. */
    if (url.pathname.startsWith('/brand/')) {
      const name = url.pathname.slice('/brand/'.length)
      /* Blocks `..` and any path with a slash: this folder only holds flat
         files, so anything more complex than a filename is a sign of a
         dishonest request. */
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
    /* Errors print TO THE BROWSER SCREEN, not just to the terminal, with the
       stack already mapped by Vite back to the right line in the `.tsx`
       file. Whoever is editing a mail template is looking at the browser
       tab, not the terminal. */
    if (error instanceof Error) vite.ssrFixStacktrace(error)
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error)
    send(res, 500, 'text/html; charset=utf-8', `<pre>${escapeHtml(detail)}</pre>`)
  }
})

function send(res, status, type, body) {
  res.writeHead(status, {
    'content-type': type,
    /* No caching, period. The entire point of this tool is F5 shows the latest version. */
    'cache-control': 'no-store',
  })
  res.end(body)
}

server.listen(PORT, () => {
  console.log(`\n  Mẫu mail PV One  →  ${ORIGIN}\n`)
})
