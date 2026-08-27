# Tích hợp landing page → PV One CRM

Endpoint công khai:

```http
POST https://<api-domain>/sales/leads/intake?from=landingpage&landingPage=<ma-trang>
Content-Type: application/json
```

Ví dụ:

```text
https://api.example.com/sales/leads/intake?from=landingpage&landingPage=pv-one-demo
```

`from=landingpage` là giá trị bắt buộc. `landingPage` là mã chữ thường dạng
slug (`pv-one-demo`, `erp-2026`), phải được backend allowlist trước khi dùng.
Không đặt API key hay secret vào query string: JavaScript chạy trong trình
duyệt không giữ bí mật được, và query string còn đi vào history/log.

## Payload

| Trường        | Bắt buộc | Giới hạn/ý nghĩa                        |
| ------------- | -------- | --------------------------------------- |
| `company`     | có       | tên công ty, tối đa 200 ký tự           |
| `contactName` | có       | người liên hệ, tối đa 120 ký tự         |
| `email`       | có       | được trim và chuyển chữ thường          |
| `phone`       | không    | 8–15 chữ số, chấp nhận khoảng trắng/dấu |
| `province`    | không    | tỉnh/thành, tối đa 64 ký tự             |
| `pain`        | không    | nhu cầu/vấn đề, tối đa 1.000 ký tự      |
| `website`     | không    | honeypot; nên luôn gửi và phải để rỗng  |

Backend tự đóng dấu `source.kind=LANDING_PAGE`, `motion=INBOUND`; landing page
không được gửi owner, stage, tier, score hay chiến dịch nội bộ.

Có thể chuyển UTM qua query string với các tên chuẩn:

```text
utm_source · utm_medium · utm_campaign · utm_content · utm_term
```

## HTML và JavaScript mẫu

Honeypot không dùng `type="hidden"`; để nó ngoài màn hình để bot điền form theo
tên trường vẫn nhìn thấy, còn người dùng và bàn phím không chạm vào:

```html
<form id="lead-form">
  <input name="company" required placeholder="Công ty" />
  <input name="contactName" required placeholder="Họ tên" />
  <input name="email" type="email" required placeholder="Email" />
  <input name="phone" inputmode="tel" placeholder="Điện thoại" />
  <textarea name="pain" placeholder="Bạn đang cần giải quyết việc gì?"></textarea>

  <div
    aria-hidden="true"
    style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden"
  >
    <label>
      Website
      <input name="website" tabindex="-1" autocomplete="off" />
    </label>
  </div>

  <button type="submit">Gửi thông tin</button>
  <p id="lead-message" role="status"></p>
</form>
```

```js
const API_URL = 'https://api.example.com'
const LANDING_PAGE = 'pv-one-demo'

document.querySelector('#lead-form').addEventListener('submit', async (event) => {
  event.preventDefault()

  const form = event.currentTarget
  const button = form.querySelector('button[type="submit"]')
  const message = document.querySelector('#lead-message')
  const data = new FormData(form)

  const query = new URLSearchParams({
    from: 'landingpage',
    landingPage: LANDING_PAGE,
  })

  // Giữ UTM của URL landing page nếu có.
  const pageQuery = new URLSearchParams(window.location.search)
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const value = pageQuery.get(key)
    if (value) query.set(key, value)
  }

  button.disabled = true
  message.textContent = ''

  try {
    const response = await fetch(`${API_URL}/sales/leads/intake?${query}`, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: data.get('company'),
        contactName: data.get('contactName'),
        email: data.get('email'),
        phone: data.get('phone'),
        pain: data.get('pain'),
        website: data.get('website') ?? '',
      }),
    })

    if (response.status === 202) {
      form.reset()
      message.textContent = 'Đã nhận thông tin. Chúng tôi sẽ liên hệ lại sớm.'
      return
    }

    if (response.status === 429) {
      const wait = Number(response.headers.get('Retry-After') ?? 60)
      message.textContent = `Bạn gửi hơi nhanh. Vui lòng thử lại sau ${Math.ceil(wait / 60)} phút.`
      return
    }

    const problem = await response.json().catch(() => null)
    message.textContent =
      response.status === 400
        ? 'Thông tin chưa hợp lệ. Kiểm tra lại các ô vừa nhập.'
        : (problem?.title ?? 'Chưa gửi được. Vui lòng thử lại sau.')
  } catch {
    message.textContent = 'Không nối được máy chủ. Kiểm tra mạng rồi thử lại.'
  } finally {
    button.disabled = false
  }
})
```

## Quy ước response

- `202 { "accepted": true }`: luôn dùng cho lead mới, email trùng và honeypot.
  Landing page chỉ hiện lời cảm ơn; không suy luận email đã có trong CRM.
- `400 application/problem+json`: query hoặc payload sai; `errors` chỉ ra ô.
- `403`: origin hoặc `landingPage` chưa được cho phép.
- `413`: JSON lớn hơn 16 KB.
- `429`: quá giới hạn; đọc header `Retry-After`, không retry liên tục.
- `500`: lỗi hệ thống; không tự động phát lại POST vô hạn.

## Cấu hình backend trước khi deploy

Trong `apps/api/.env` khi chạy local:

```dotenv
PV_CORS_ORIGINS=http://localhost:5173,https://landing.example.com
PV_INTAKE_LANDING_PAGES=pv-one-demo,erp-2026
PV_INTAKE_IP_HASH_SECRET=development-only-intake-secret
```

Production bắt buộc secret ngẫu nhiên ít nhất 32 ký tự:

```bash
openssl rand -hex 32
fly secrets set \
  PV_CORS_ORIGINS=https://landing.example.com \
  PV_INTAKE_LANDING_PAGES=pv-one-demo,erp-2026 \
  PV_INTAKE_IP_HASH_SECRET=<chuoi-vua-tao> \
  --app pvone-crm-api
```

Chạy migration trước khi đưa code mới nhận traffic:

```bash
pnpm db:migrate
```

Migration `0003_futuristic_cerebro.sql` tạo bảng audit intake và bộ đếm rate
limit. Hãy kiểm tra `DATABASE_URL` đang trỏ đúng database trước khi chạy.

## Các hàng rào đang bật

- Giới hạn mặc định một IP: `5/phút`, `30/ngày`, vượt ngưỡng khóa 15 phút.
- Giới hạn một landing page: `120/phút`, `5.000/ngày`, chống botnet vượt IP.
- Bộ đếm atomic trong Postgres, dùng chung giữa nhiều Fly Machine.
- Tối đa 8 request intake đang xử lý trong mỗi API process.
- Body tối đa 16 KB; JSON lạ hoặc trường hệ thống bị từ chối.
- Origin browser và mã landing page đều có allowlist.
- Production chỉ tin `Fly-Client-IP`; không tin `X-Forwarded-For` do client tự gửi.
- IP được HMAC trước khi lưu; bảng không giữ IP thô.
- Email trùng, honeypot và lead mới cùng trả một response để chống dò dữ liệu.
- Fly Proxy đo tải theo request với `soft_limit=30`, `hard_limit=50` mỗi Machine.

CORS/origin không phải cơ chế xác thực vì script ngoài trình duyệt có thể giả
header. Hàng rào chịu lực là rate limit dùng chung, giới hạn tải, honeypot và
việc thu hẹp payload công khai.

## Gọi nhanh bằng curl

```bash
curl -i -X POST \
  'http://localhost:3000/sales/leads/intake?from=landingpage&landingPage=pv-one-demo&utm_source=google' \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://localhost:5173' \
  --data '{
    "company": "Công ty Demo",
    "contactName": "Nguyễn Văn A",
    "email": "a@example.com",
    "phone": "0912 345 678",
    "pain": "Cần quản lý lead tập trung",
    "website": ""
  }'
```
