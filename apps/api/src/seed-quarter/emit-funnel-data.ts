import type { CostKind } from '@pv/contracts'

/** Content the funnel emitter writes: what each campaign cost, how it reads on
 *  its page, and the letters of its waves. Prose is Vietnamese product content;
 *  every address and link is under `.example` so nothing here can be posted. */

export type CostLine = { kind: CostKind; label: string; amount: number; daysFromStart: number }

export const COSTS: Record<string, CostLine[]> = {
  'event-aug': [
    { kind: 'EVENT', label: 'Thuê hội trường và âm thanh', amount: 68_000_000, daysFromStart: -6 },
    { kind: 'EVENT', label: 'Tiệc trà giữa giờ', amount: 14_500_000, daysFromStart: 2 },
    { kind: 'CONTENT', label: 'In tài liệu và standee', amount: 11_200_000, daysFromStart: -3 },
    { kind: 'CHANNEL', label: 'Quảng cáo mời đăng ký', amount: 18_000_000, daysFromStart: -10 },
  ],
  'mail-electronics': [
    {
      kind: 'DATA',
      label: 'Danh sách 2.000 liên hệ ngành điện tử',
      amount: 9_000_000,
      daysFromStart: -2,
    },
    { kind: 'CHANNEL', label: 'Gói gửi thư hàng loạt quý 3', amount: 5_400_000, daysFromStart: 0 },
    { kind: 'CONTENT', label: 'Viết và dựng ba thư', amount: 7_500_000, daysFromStart: -4 },
  ],
  'expo-sep': [
    { kind: 'EVENT', label: 'Thuê gian hàng 18 m²', amount: 120_000_000, daysFromStart: -20 },
    { kind: 'EVENT', label: 'Dựng gian hàng', amount: 46_000_000, daysFromStart: 0 },
    { kind: 'CONTENT', label: 'Brochure và video demo', amount: 21_000_000, daysFromStart: -8 },
    { kind: 'TOOL', label: 'Máy quét thẻ khách tham quan', amount: 4_800_000, daysFromStart: -1 },
  ],
  recycle: [
    { kind: 'TOOL', label: 'Công cụ làm sạch danh sách', amount: 2_400_000, daysFromStart: -1 },
    { kind: 'CONTENT', label: 'Viết hai thư chăm lại', amount: 4_000_000, daysFromStart: 0 },
  ],
  'webinar-mes': [
    { kind: 'TOOL', label: 'Gói webinar một lần', amount: 6_500_000, daysFromStart: -5 },
    { kind: 'CHANNEL', label: 'Quảng cáo mời đăng ký', amount: 12_000_000, daysFromStart: -4 },
    { kind: 'CONTENT', label: 'Làm slide và dựng bản ghi', amount: 5_500_000, daysFromStart: 3 },
  ],
  'mail-auto': [
    {
      kind: 'DATA',
      label: 'Danh sách 1.500 liên hệ ngành ô tô',
      amount: 8_500_000,
      daysFromStart: -3,
    },
    { kind: 'CHANNEL', label: 'Gói gửi thư quý 4', amount: 5_400_000, daysFromStart: 0 },
    { kind: 'CONTENT', label: 'Viết thư và ảnh minh hoạ', amount: 6_000_000, daysFromStart: -2 },
  ],
  expansion: [
    { kind: 'CONTENT', label: 'Bộ tài liệu cho khách cũ', amount: 3_500_000, daysFromStart: -2 },
    { kind: 'CHANNEL', label: 'Gửi thư riêng cho khách cũ', amount: 800_000, daysFromStart: 0 },
  ],
  'tet-2027': [
    { kind: 'CONTENT', label: 'Đặt cọc thiết kế thiệp Tết', amount: 3_000_000, daysFromStart: 0 },
    { kind: 'DATA', label: 'Danh sách khách gửi thiệp', amount: 4_000_000, daysFromStart: 0 },
  ],
}

/** Campaign page copy, and the lead origin it files under (`lead_origin.name`). */
export const PAGE: Record<string, { slogan: string; origin: string }> = {
  'event-aug': { slogan: 'Một buổi sáng xem nhà máy thông minh chạy thật', origin: 'Hội thảo' },
  'mail-electronics': { slogan: 'Truy xuất một lô linh kiện trong 30 giây', origin: 'Email lạnh' },
  'expo-sep': { slogan: 'Gặp PV One tại gian hàng triển lãm', origin: 'Triển lãm' },
  recycle: { slogan: 'Hỏi thăm khách đã tạm dừng', origin: 'Lead cũ' },
  'webinar-mes': { slogan: 'MES cho nhà máy vừa, làm được trong một quý', origin: 'Webinar' },
  'mail-auto': { slogan: 'Thư dành cho nhà máy phụ tùng ô tô', origin: 'Email lạnh' },
  expansion: { slogan: 'Mua thêm cho nhà máy thứ hai', origin: 'Khách cũ' },
  'tet-2027': { slogan: 'Thiệp chúc Tết gửi khách cũ và khách đang theo', origin: 'Email lạnh' },
}

/** Category a campaign speaks to; its top-up audience prefers these companies. */
export const THEME: Record<string, string> = {
  'mail-electronics': 'Điện tử',
  'mail-auto': 'Ô tô',
}

export type Letter = { label: string; subject: string; body: string; cta: [string, string] }

const CASE = 'https://pebblevina.example/case-study'
const DEMO = 'https://pebblevina.example/dat-lich-demo'

export const LETTERS: Record<string, Letter[]> = {
  'event-aug': [
    {
      label: 'Đợt 1 · cảm ơn khách dự hội thảo',
      subject: 'Cảm ơn {{contactName}} đã dự hội thảo',
      body: 'Chào {{contactName}},\n\nCảm ơn anh/chị đã dành buổi sáng cho hội thảo. Em gửi lại bản ghi phần demo và tài liệu trình bày.\n\nNếu {{company}} muốn xem lại trên số liệu của mình, anh/chị chọn giờ ở nút bên dưới.',
      cta: ['Xem bản ghi', CASE],
    },
    {
      label: 'Đợt 2 · mời xem demo riêng',
      subject: '{{company}} có muốn xem demo riêng không?',
      body: 'Chào {{contactName}},\n\nDemo ở hội thảo chạy trên số liệu mẫu. Anh/chị gửi một file sản lượng bất kỳ, bên em dựng lại đúng màn đó trên số liệu của {{company}}.\n\n- Không cần kết nối hệ thống\n- Không ràng buộc gì sau buổi demo',
      cta: ['Đặt lịch demo', DEMO],
    },
  ],
  'mail-electronics': [
    {
      label: 'Đợt 1 · giới thiệu truy xuất lô',
      subject: 'Truy xuất một lô hàng của {{company}} trong 30 giây',
      body: 'Chào {{contactName}},\n\nMột nhà máy điện tử ở Bắc Ninh vừa rút thời gian truy vết một lô hàng lỗi từ 4 giờ xuống dưới 30 giây.\n\nEm gửi anh/chị bản mô tả ngắn, đọc hết trong 3 phút.',
      cta: ['Đọc bản mô tả', CASE],
    },
    {
      label: 'Đợt 2 · số liệu sau ba tháng',
      subject: 'Số liệu đo được sau 3 tháng ở một nhà máy cùng quy mô {{company}}',
      body: 'Chào {{contactName}},\n\nTiếp nối thư trước, đây là con số đo được ở một nhà máy cùng quy mô:\n\n- Dựng báo cáo ca: 45 phút còn 17 phút\n- Sai lệch tồn kho cuối ca: 3,1% còn 0,4%',
      cta: ['Xem số liệu', CASE],
    },
    {
      label: 'Đợt 3 · mời trao đổi 30 phút',
      subject: '30 phút trao đổi về báo cáo ca của {{company}}',
      body: 'Chào {{contactName}},\n\nEm xin 30 phút để nghe cách {{company}} đang làm báo cáo ca và chỉ ra chỗ có thể bớt việc tay.\n\nAnh/chị chọn giờ thuận tiện ở nút bên dưới.',
      cta: ['Chọn giờ', DEMO],
    },
  ],
  'expo-sep': [
    {
      label: 'Đợt 1 · cảm ơn khách ghé gian hàng',
      subject: 'Cảm ơn {{contactName}} đã ghé gian hàng PV One',
      body: 'Chào {{contactName}},\n\nCảm ơn anh/chị đã ghé gian hàng tại triển lãm. Em gửi bản ghi phần demo truy xuất lô và một case study ngắn.',
      cta: ['Xem case study', CASE],
    },
  ],
  recycle: [
    {
      label: 'Đợt 1 · hỏi thăm lại',
      subject: '{{contactName}} ơi, bên mình còn cần theo dõi sản xuất không?',
      body: 'Chào {{contactName}},\n\nLần trước {{company}} tạm dừng trao đổi với bên em. Em hỏi thăm xem nhu cầu theo dõi sản xuất đã thay đổi gì chưa.\n\nNếu cần, anh/chị trả lời thư này, em gọi lại trong ngày.',
      cta: ['Đặt lịch gọi lại', DEMO],
    },
    {
      label: 'Đợt 2 · gửi thêm một ví dụ',
      subject: 'Một ví dụ gần với {{company}}',
      body: 'Chào {{contactName}},\n\nEm gửi thêm một ví dụ nhà máy cùng ngành đã bắt đầu từ một chuyền và mở rộng dần.',
      cta: ['Xem ví dụ', CASE],
    },
  ],
  'webinar-mes': [
    {
      label: 'Đợt 1 · gửi bản ghi webinar',
      subject: 'Bản ghi webinar MES và tài liệu đi kèm',
      body: 'Chào {{contactName}},\n\nCảm ơn anh/chị đã đăng ký webinar. Em gửi bản ghi và bộ slide để anh/chị xem lại lúc rảnh.\n\nPhần hỏi đáp có câu về thời gian triển khai, em để ở phút 38.',
      cta: ['Xem bản ghi', CASE],
    },
  ],
  'mail-auto': [
    {
      label: 'Đợt 1 · giới thiệu cho nhà máy ô tô',
      subject: 'Theo dõi lỗi theo lô cho nhà máy phụ tùng ô tô',
      body: 'Chào {{contactName}},\n\nNhà máy phụ tùng ô tô thường bị khách hàng yêu cầu truy vết theo lô trong vài giờ. Em gửi cách một nhà máy làm việc này trong vài phút.',
      cta: ['Đọc bản mô tả', CASE],
    },
    {
      label: 'Đợt 2 · số liệu từ một nhà máy ô tô',
      subject: 'Số liệu từ một nhà máy ô tô gần {{company}}',
      body: 'Chào {{contactName}},\n\nTiếp nối thư trước, đây là kết quả sau hai tháng chạy thử ở một nhà máy ô tô.\n\n- Thời gian truy vết lô: 3 giờ còn 12 phút\n- Số lô phải giữ lại kiểm: giảm một nửa',
      cta: ['Xem số liệu', CASE],
    },
    {
      label: 'Đợt 3 · mời xem demo',
      subject: 'Mời {{contactName}} xem demo cho nhà máy ô tô',
      body: 'Chào {{contactName}},\n\nEm mời anh/chị xem demo 30 phút trên số liệu giả lập của một nhà máy ô tô.',
      cta: ['Đặt lịch demo', DEMO],
    },
  ],
  expansion: [
    {
      label: 'Đợt 1 · mua thêm cho nhà máy khác',
      subject: '{{company}} có nhà máy khác cần triển khai không?',
      body: 'Chào {{contactName}},\n\nPV One đã chạy ổn ở {{company}}. Nếu có thêm nhà máy hoặc chuyền mới, em có bộ tài liệu triển khai nhanh dành cho khách cũ.',
      cta: ['Xem tài liệu', CASE],
    },
  ],
}
