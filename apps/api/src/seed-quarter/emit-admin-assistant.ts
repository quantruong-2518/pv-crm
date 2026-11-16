import { assistantMessage, assistantSession } from '@api/platform/assistant/assistant.schema'
import type { Db } from '@api/platform/db/db.module'
import { dayOf, vnAt } from './clock'
import { ADMIN, WINDOW_START } from './params'
import type { Ctx } from './types'

/** Assistant chats with every turn already over. Answers are drafting and
 *  advice that name no record and no figure, and no tool call is written, so
 *  a reload shows each answer whole whoever the reader is. `assistant_report`
 *  stays empty: a report is a person's complaint, not a thing to invent. */

const PROMPT_VERSION = 'assistant@v14'

const CHATS: readonly (readonly [question: string, answer: string])[] = [
  [
    'Viết giúp mình mail nhắc khách về báo giá đã gửi tuần trước',
    'Chào anh/chị,\n\nTuần trước bên em đã gửi báo giá. Anh/chị đã có dịp xem chưa ạ? Nếu cần điều chỉnh phạm vi hay tiến độ, em sẵn sàng trao đổi trong tuần này.\n\nTrân trọng.',
  ],
  [
    'Soạn tin Zalo hẹn khách demo vào thứ Năm',
    'Chào anh/chị, em muốn hẹn anh/chị buổi demo khoảng 45 phút vào thứ Năm. Anh/chị tiện sáng hay chiều ạ? Em sẽ gửi lịch ngay khi anh/chị chốt giờ.',
  ],
  [
    'Gợi ý cách hỏi khách về ngân sách mà không bị gượng',
    'Có thể hỏi theo hướng khoảng giá: "Để em đề xuất đúng gói, anh/chị đang dự kiến đầu tư trong khoảng nào ạ?" Nếu khách ngại, đưa hai ba mức để khách chọn.',
  ],
  [
    'Khách im lặng sau buổi demo thì nên nhắn lại thế nào?',
    'Nhắn ngắn, có một việc cụ thể để khách trả lời. Ví dụ gửi lại tóm tắt buổi demo kèm một câu hỏi: "Anh/chị muốn em khảo sát thử một chuyền sản xuất trước không ạ?"',
  ],
  [
    'Viết lời cảm ơn khách sau khi ký hợp đồng',
    'Chào anh/chị, bên em cảm ơn anh/chị đã tin tưởng. Em sẽ gửi kế hoạch triển khai và người phụ trách từng giai đoạn trong hôm nay. Có gì cần gấp, anh/chị cứ gọi em.',
  ],
  [
    'Làm sao nhắc khách thanh toán đợt tiếp theo cho lịch sự?',
    'Nhắc kèm mốc trong hợp đồng và lời đề nghị giúp: "Đợt tiếp theo đến hạn ngày trong hợp đồng. Anh/chị cần bên em gửi lại hóa đơn hay thông tin chuyển khoản không ạ?"',
  ],
  [
    'Tóm tắt giúp mình ba điểm cần chuẩn bị trước buổi gặp khách',
    'Một là mục tiêu của buổi gặp, một câu thôi. Hai là hai ba câu hỏi để hiểu vấn đề của khách. Ba là việc cụ thể bạn muốn khách đồng ý trước khi kết thúc.',
  ],
  [
    'Mình nên mở đầu cuộc gọi lạnh thế nào?',
    'Nói tên, công ty và lý do gọi trong mười giây, rồi hỏi xin phép: "Em xin hai phút để hỏi một việc về quản lý sản xuất, anh/chị có tiện không ạ?"',
  ],
  [
    'Viết mail xin lỗi vì trả lời khách chậm',
    'Chào anh/chị, em xin lỗi vì phản hồi chậm. Em đã xem yêu cầu của anh/chị và sẽ gửi đề xuất cụ thể trước cuối ngày mai. Cảm ơn anh/chị đã kiên nhẫn.',
  ],
  [
    'Cách trả lời khi khách chê giá cao?',
    'Đừng giảm giá ngay. Hỏi khách đang so với cái gì, rồi nói lại phần giá trị khách nhận được. Nếu cần, đề xuất bỏ bớt hạng mục thay vì hạ giá.',
  ],
  [
    'Gợi ý tiêu đề mail gửi khách nhà máy điện tử',
    'Ba gợi ý: "Truy xuất một lô hàng trong 30 giây", "Giảm thời gian chốt số liệu cuối ngày", "Ví dụ từ một nhà máy điện tử cùng quy mô".',
  ],
  [
    'Viết ghi chú sau cuộc gọi với khách để lưu vào hồ sơ',
    'Mẫu: Khách quan tâm gì, đã thống nhất việc gì, ai làm, hạn khi nào. Ví dụ: "Khách muốn xem demo kho. Hẹn gửi báo giá thứ Sáu. Em phụ trách."',
  ],
]

type Turn = {
  messageId: string
  actorId: string
  at: Date
  model: string
  rounds: number
  failed: boolean
}

export type AssistantLedger = { turns: Turn[]; sessions: number; messages: number }

/** Sessions start between `WINDOW_START` and today, kept inside the 90-day purge. */
export async function writeAssistant(tx: Db, ctx: Ctx, model: string): Promise<AssistantLedger> {
  const rng = ctx.rng.fork('assistant')
  const seats = [...ctx.world.actors.keys()]
  const leads = ctx.plan.lead
  const sessions: (typeof assistantSession.$inferInsert)[] = []
  const messages: (typeof assistantMessage.$inferInsert)[] = []
  const turns: Turn[] = []
  const floor = Math.max(
    Date.parse(`${WINDOW_START}T00:00:00Z`),
    ctx.now.getTime() - 80 * 86_400_000,
  )
  for (let i = 0; i < ADMIN.assistantSessions; i++) {
    const owner = rng.pick(seats)
    const startDay = dayOf(new Date(rng.real(floor, ctx.now.getTime() - 3.6e6)))
    let at = vnAt(startDay, rng.int(8, 17), rng.int(0, 59))
    const mine = leads.filter((l) => l.ownerId === owner && !l.disabledAt)
    const subject = mine.length > 0 && rng.chance(0.35) ? rng.pick(mine) : null
    const id = rng.uuid()
    const chats = Array.from(
      {
        length: rng.weighted([
          [1, 5],
          [2, 3],
          [3, 2],
        ]),
      },
      () => rng.pick(CHATS),
    )
    let seq = 0
    let last = at
    for (const [question, answer] of chats) {
      at = new Date(Math.min(at.getTime() + rng.int(1, 40) * 60_000, ctx.now.getTime() - 60_000))
      messages.push({
        id: rng.uuid(),
        sessionId: id,
        actorId: owner,
        seq: ++seq,
        role: 'user',
        body: question,
        state: 'done',
        createdAt: at,
        finishedAt: at,
      })
      const reply = new Date(at.getTime() + rng.int(4, 25) * 1000)
      const fate = rng.weighted([
        ['done', 92],
        ['failed', 4],
        ['stopped', 4],
      ] as const)
      const messageId = rng.uuid()
      const text = fate === 'failed' ? '' : fate === 'stopped' ? answer.slice(0, 60) : answer
      messages.push({
        id: messageId,
        sessionId: id,
        actorId: owner,
        seq: ++seq,
        role: 'assistant',
        body: text,
        state: fate,
        endedBy: fate === 'done' ? 'answer' : fate === 'failed' ? 'vendor' : 'stopped',
        model,
        rounds: 1,
        firstTextMs: fate === 'failed' ? null : rng.int(900, 3800),
        promptVersion: PROMPT_VERSION,
        createdAt: reply,
        finishedAt: new Date(reply.getTime() + rng.int(2, 14) * 1000),
      })
      turns.push({
        messageId,
        actorId: owner,
        at: reply,
        model,
        rounds: 1,
        failed: fate === 'failed',
      })
      last = reply
    }
    sessions.push({
      id,
      ownerId: owner,
      title: chats[0]![0].slice(0, 60),
      subjectKind: subject ? 'lead' : null,
      subjectCode: subject ? subject.code : null,
      pinnedAt: i % 12 === 0 ? last : null,
      lastOpenedAt: last,
      createdAt: vnAt(startDay, 8),
    })
  }
  await tx.insert(assistantSession).values(sessions)
  for (let i = 0; i < messages.length; i += 200)
    await tx.insert(assistantMessage).values(messages.slice(i, i + 200))
  return { turns, sessions: sessions.length, messages: messages.length }
}
