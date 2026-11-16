/** Short Vietnamese content the comms emitter draws from: what a salesperson
 *  would type into a call note, a letter or a meeting minute. */

export const CALL_NOTES = [
  'Gọi hỏi nhu cầu, khách đang xem xét giải pháp quản lý sản xuất.',
  'Khách nghe máy, hẹn sẽ trao đổi kỹ hơn với bộ phận sản xuất.',
  'Gọi nhắc lại thông tin đã gửi, khách chưa xem hết.',
  'Khách hỏi thêm về thời gian triển khai và chi phí.',
  'Trao đổi nhanh, khách nhờ gửi tài liệu qua email.',
]

export const MAIL_OUT = [
  'Chào anh/chị, em gửi lại thông tin giải pháp như đã trao đổi. Anh/chị xem giúp em và phản hồi khi tiện nhé.',
  'Chào anh/chị, em gửi tài liệu giới thiệu và bảng tính năng. Em sẵn sàng hẹn gọi nếu anh/chị cần giải thích thêm.',
  'Chào anh/chị, em xin gửi đề xuất sơ bộ theo nhu cầu của nhà máy. Mong nhận được góp ý của anh/chị.',
  'Chào anh/chị, em nhắc lại lịch hẹn tuần này. Anh/chị cho em biết thời gian phù hợp nhé.',
]

export const CHAT_OUT = [
  'Em chào anh/chị, em gửi thông tin giải pháp qua đây cho tiện theo dõi ạ.',
  'Anh/chị cho em xin thời gian để gọi trao đổi thêm nhé.',
  'Em gửi lại lịch demo, anh/chị xác nhận giúp em ạ.',
  'Em cảm ơn anh/chị đã dành thời gian. Em gửi tài liệu đã nói trong buổi gọi.',
]

export const REPLIES = [
  'Cảm ơn em, anh/chị đã nhận. Để xem rồi báo lại.',
  'Ok em, tuần sau mình trao đổi tiếp nhé.',
  'Anh/chị cần thêm báo giá chi tiết, em gửi giúp.',
  'Đã xem, anh/chị sẽ hỏi bên sản xuất rồi phản hồi.',
]

export const TALK_SUMMARIES = [
  'Khách đang theo dõi sản xuất bằng Excel, muốn xem demo. Hẹn gọi lại tuần sau.',
  'Khách quan tâm phần báo cáo sản lượng. Cần gửi thêm tài liệu và báo giá sơ bộ.',
  'Đã nói chuyện với người phụ trách sản xuất, khách chưa có ngân sách trong quý này.',
  'Khách hỏi về thời gian triển khai và đào tạo. Hẹn gặp trực tiếp để trao đổi thêm.',
  'Khách đang so sánh với một giải pháp khác, cần gửi bảng so sánh tính năng.',
  'Trao đổi ngắn, khách đồng ý nhận tài liệu và sẽ phản hồi trong tuần.',
]

export const MEETING_SUMMARIES = [
  'Giới thiệu giải pháp cho ban quản lý. Khách quan tâm báo cáo sản lượng, cần thêm báo giá.',
  'Đi một vòng nhà xưởng cùng quản đốc, ghi nhận quy trình hiện tại. Hẹn gửi đề xuất trong tuần.',
  'Demo cho bộ phận sản xuất, khách hỏi nhiều về kết nối máy và báo cáo theo ca.',
  'Thống nhất phạm vi triển khai giai đoạn một. Khách sẽ trình lãnh đạo duyệt ngân sách.',
  'Trao đổi điều khoản và tiến độ. Còn hai điểm khách cần xin ý kiến nội bộ.',
  'Họp với lãnh đạo khách, hai bên đồng ý bước tiếp theo là gửi báo giá chính thức.',
]

export const LEAD_MEETING_TITLES = [
  'Gặp giới thiệu giải pháp',
  'Khảo sát nhu cầu tại nhà máy',
  'Trao đổi nhu cầu ban đầu',
]

export const DEAL_MEETING_TITLES = [
  'Demo giải pháp',
  'Họp thống nhất phạm vi',
  'Họp báo giá',
  'Họp chốt điều khoản',
]

export const MEETING_GOALS = [
  'Hiểu quy trình sản xuất hiện tại',
  'Giới thiệu giải pháp và giải đáp thắc mắc',
  'Thống nhất bước tiếp theo',
  'Trao đổi báo giá và điều khoản',
]

/** One next-step wording per STEP_KIND name; unknown names fall back to the last. */
export const NEXT_TEXT: Record<string, (name: string) => string> = {
  'Gọi lại': (n) => `Gọi lại ${n} xác nhận nhu cầu`,
  'Hẹn gặp': (n) => `Hẹn ${n} gặp trực tiếp`,
  'Gửi tài liệu': (n) => `Gửi tài liệu giới thiệu cho ${n}`,
  'Gửi mẫu': (n) => `Gửi mẫu thử cho ${n}`,
  'Gửi báo giá': (n) => `Gửi báo giá cho ${n}`,
  'Theo dõi phản hồi': (n) => `Theo dõi phản hồi của ${n}`,
}
