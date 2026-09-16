import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  MeetingListResponse,
  MeetingRow,
  type MeetingCreate,
  type MeetingPatch,
} from '@pv/contracts'
import type { Db } from '@api/platform/db/db.module'
import { conflict, invalid, notFound } from '@api/platform/http/problem'
import { TouchService, byOf } from '../touch/touch.service'
import { MeetingRepository } from './meeting.repository'
import { firstMeetingId, toContract } from './meeting.mapper'
import type { MeetingAttendeeValues, MeetingRowDb } from './meeting.schema'

/** Sổ cuộc họp — một facility, đúng hình `TouchService`.
 *
 *  KHÔNG có controller và KHÔNG kiểm quyền. Cả bốn đường sống trên
 *  `LeadController` dưới tiền tố `/sales/leads/:code/meetings`, nên câu "lead
 *  này có thật không, có đứng tên bạn không" đã được `LeadService` hỏi xong
 *  bằng `repo.byCode` trước khi gọi xuống đây — cùng đường mà `touches` và
 *  `mailTimeline` đã đi.
 *
 *  Đặt `:id` DƯỚI `:code` chứ không mở một `@Controller('sales/meetings')`
 *  riêng là quyết định có lý do: `@Need` là metadata tĩnh, nên một cửa
 *  `/sales/meetings/:id` sẽ phải tự đi tra lead của buổi họp RỒI mới biết cắt
 *  theo phạm vi của ai — tức trục phạm vi được quyết định sau khi đã đọc dữ
 *  liệu. Có `:code` trên đường thì trục ấy có mặt trước, và việc còn lại chỉ là
 *  xác nhận buổi họp đúng là của lead đó. */
@Injectable()
export class MeetingService {
  constructor(
    private readonly repo: MeetingRepository,
    private readonly touch: TouchService,
  ) {}

  /** Mọi buổi họp của một lead, mới trước, kèm cờ lần gặp đầu. */
  async timeline(code: string): Promise<MeetingListResponse> {
    const rows = await this.repo.byLead(code)
    const attendees = await this.repo.attendeesOf(rows.map((r) => r.id))
    const firstId = firstMeetingId(rows)

    return MeetingListResponse.parse({
      rows: rows.map((row) =>
        toContract(
          row,
          attendees.filter((a) => a.meetingId === row.id),
          row.id === firstId,
        ),
      ),
    })
  }

  /** Ghi một buổi vừa họp xong.
   *
   *  Ba lượt ghi trong MỘT transaction: dòng buổi họp, danh sách người dự, và
   *  một dòng `touch`. Tách ra thì một lần mất kết nối giữa chừng để lại một
   *  buổi họp không ai dự, hoặc một dòng thời gian kể về một buổi không tồn
   *  tại.
   *
   *  Loại của dòng `touch` đọc từ SỔ chứ không từ dữ liệu người gửi:
   *  `countOf` bên trong transaction trả 0 nghĩa đây là buổi đầu tiên, và dòng
   *  đó là `first-meeting` — writer đầu tiên của loại ấy kể từ khi `TouchKind`
   *  được viết ra. Đọc trong transaction chứ không trước nó vì hai người cùng
   *  ghi buổi đầu tiên của một lead là chuyện có thật, và ở ngoài thì cả hai
   *  cùng thấy 0.
   *
   *  Lưu ý một chỗ CỐ Ý không đối xứng với `isFirst`: dòng `touch` nói "buổi
   *  đầu tiên ĐƯỢC GHI", còn ngôi sao trên màn nói "buổi SỚM NHẤT". Ghi bù một
   *  buổi cũ hơn sẽ đổi ngôi sao mà không đổi dòng thời gian đã viết — và đó là
   *  đúng: dòng thời gian ghi việc đã xảy ra lúc nào, không được viết lại. */
  async record(who: Actor, code: string, body: MeetingCreate): Promise<MeetingRow> {
    const id = await this.repo.run(async (tx) => {
      const already = await this.repo.countOf(tx, code)

      const meetingId = await this.repo.insert(tx, {
        leadCode: code,
        at: new Date(body.at),
        title: body.title,
        link: body.link ?? null,
        transcript: body.transcript ?? null,
        by: who.name,
        createdBy: who.id,
      })

      await this.guestsBelongHere(tx, code, body.guests)
      await this.repo.setAttendees(tx, meetingId, attendeesOf(meetingId, body))

      await this.touch.record(tx, [
        {
          subjectCode: code,
          subjectKind: 'lead',
          kind: already === 0 ? 'first-meeting' : 'contacted',
          ...byOf(who),
          note: already === 0 ? `Gặp lần đầu: ${body.title}` : `Họp: ${body.title}`,
          /* Mốc của dòng thời gian là lúc HỌP, không phải lúc gõ — ghi bù một
             buổi tuần trước phải nằm đúng chỗ của nó trong dòng thời gian. */
          at: new Date(body.at),
        },
      ])

      return meetingId
    })

    return this.one(code, id)
  }

  /** Sửa một buổi đã ghi. Không đẻ thêm dòng `touch`: dòng thời gian ghi việc
   *  đã xảy ra, và sửa chính tả một tiêu đề không phải một việc đã xảy ra với
   *  khách hàng. */
  async amend(code: string, id: string, body: MeetingPatch): Promise<MeetingRow> {
    await this.mine(code, id)

    /* Đọc bản hiện tại TRƯỚC khi mở transaction, không đọc bên trong: hai danh
       sách người dự chỉ cần thiết khi lượt PATCH đụng tới đúng một trong hai,
       và một lượt đọc lồng trong transaction bằng `this.db` (chứ không bằng
       `tx`) là một lượt đọc NGOÀI transaction đội lốt trong — thứ trông đúng
       trong review và sai lúc có tranh chấp. */
    const before =
      body.hosts === undefined || body.guests === undefined
        ? (await this.timeline(code)).rows.find((r) => r.id === id)
        : undefined

    await this.repo.run(async (tx) => {
      await this.repo.update(tx, id, {
        ...(body.at === undefined ? {} : { at: new Date(body.at) }),
        ...(body.title === undefined ? {} : { title: body.title }),
        /* `link` và `transcript` phân biệt "không gửi" với "gửi rỗng": vắng mặt
           là không đụng tới, còn chuỗi rỗng đã bị zod biến thành vắng mặt ở
           cửa. Nên không có đường nào xoá được link bằng PATCH hôm nay — nói ra
           chứ không giả vờ là đã xử lý. */
        ...(body.link === undefined ? {} : { link: body.link }),
        ...(body.transcript === undefined ? {} : { transcript: body.transcript }),
      })

      if (body.hosts !== undefined || body.guests !== undefined) {
        await this.guestsBelongHere(tx, code, body.guests)
        await this.repo.setAttendees(
          tx,
          id,
          attendeesOf(id, {
            hosts: body.hosts ?? (before?.hosts ?? []).map(requireActor),
            guests:
              body.guests ??
              (before?.guests ?? []).map((g) => ({
                name: g.name,
                ...(g.role ? { role: g.role } : {}),
                /* Carry `contactCode` over when this PATCH does not touch the
                   guest list: `setAttendees` REPLACES the whole list, so
                   dropping it here would mean fixing a typo in the title and
                   silently unlinking every guest from the contact book. */
                ...(g.contactCode ? { contactCode: g.contactCode } : {}),
              })),
          }),
        )
      }
    })

    return this.one(code, id)
  }

  async drop(code: string, id: string): Promise<void> {
    const row = await this.mine(code, id)
    if (row.at.getTime() <= Date.now()) {
      throw conflict('Lịch họp đã diễn ra nên không thể xoá.')
    }
    await this.repo.run((tx) => this.repo.remove(tx, id))
  }

  /** Every `contactCode` in the body must name somebody in THIS lead's own
   *  contact book — the lead on the path, not any lead.
   *
   *  The foreign key cannot ask this. It asks "is this code in `sales.contact`",
   *  which every code in the customer book answers yes to — so without this
   *  check a salesperson with `ownOnly`, standing on a lead that really is
   *  theirs, could attach another department's `CT-…` to a meeting and read that
   *  person's name back out. The scope axis would be dropped at the exact moment
   *  a new link to scoped data is created, which is the one moment it has to
   *  hold.
   *
   *  Refuses an UNKNOWN code here too rather than letting the foreign key take
   *  it: the FK's sentence cannot name a field, and this one reddens the guest
   *  list. Same 400 for "not in the book" and "belongs to another lead" on
   *  purpose — telling the two apart would confirm that `CT-0412` exists
   *  somewhere the caller may not look, the reasoning `mine()` below spells out.
   *
   *  `guests === undefined` means this PATCH is not touching the list at all,
   *  and the codes already on the rows were checked when they were written. */
  private async guestsBelongHere(
    tx: Db,
    leadCode: string,
    guests: MeetingCreate['guests'] | undefined,
  ): Promise<void> {
    if (guests === undefined) return

    const codes = [...new Set(guests.map((g) => g.contactCode).filter((c) => c !== undefined))]
    if (codes.length === 0) return

    const found = await this.repo.contactLeadsOf(tx, codes)
    const stray = codes.filter((c) => found.find((f) => f.code === c)?.leadCode !== leadCode)
    if (stray.length === 0) return

    throw invalid(
      {
        guests: [
          `Người liên hệ ${stray.join(', ')} không thuộc lead ${leadCode} — chỉ chọn được người trong sổ liên hệ của chính lead này.`,
        ],
      },
      'Người dự không thuộc lead này.',
    )
  }

  /** Buổi họp có thật VÀ treo đúng vào lead trên đường dẫn.
   *
   *  Hai câu trong một, và câu thứ hai mới là câu giữ cửa: quyền đã được cắt
   *  theo `:code`, nên một `:id` của lead khác lọt qua đây sẽ là một người sửa
   *  được buổi họp nằm ngoài phạm vi của mình. Trả 404 chứ không 403 — người
   *  gọi không được biết buổi họp đó có tồn tại ở đâu đó hay không. */
  private async mine(code: string, id: string): Promise<MeetingRowDb> {
    const row = await this.repo.byId(id)
    if (!row || row.leadCode !== code) throw notFound('cuộc họp', id)
    return row
  }

  private async one(code: string, id: string): Promise<MeetingRow> {
    const list = await this.timeline(code)
    const row = list.rows.find((r) => r.id === id)
    if (!row) throw notFound('cuộc họp', id)
    return MeetingRow.parse(row)
  }
}

/** Hai danh sách của hợp đồng thành một bảng con.
 *
 *  `side` được ĐẶT ở đây chứ không nhận từ người gọi: hợp đồng ghi hai mảng
 *  riêng đúng vì phía nào là chuyện của hình dữ liệu, không phải một ô người
 *  dùng chọn — và một client gửi `side: 'host'` trong mảng `guests` không được
 *  quyền tạo ra một dòng tự mâu thuẫn. */
function attendeesOf(
  meetingId: string,
  body: { hosts?: MeetingCreate['hosts']; guests?: MeetingCreate['guests'] },
): MeetingAttendeeValues[] {
  return [
    ...(body.hosts ?? []).map((h) => ({
      meetingId,
      side: 'host' as const,
      actorId: h.actorId,
      name: h.name,
      role: null,
    })),
    ...(body.guests ?? []).map((g) => ({
      meetingId,
      side: 'guest' as const,
      actorId: null,
      /* The guest half only — `meeting_attendee_contact_only_guest` refuses a
         host row carrying one, which is why the host branch above has no such
         field. Still optional: typing a name is not a fallback being phased
         out, it is the ONLY option for somebody the contact book does not
         hold. */
      contactCode: g.contactCode ?? null,
      name: g.name,
      role: g.role ?? null,
    })),
  ]
}

/** Người chủ trì đọc lên từ sổ luôn có `actorId` — `meeting_attendee_host_is_actor`
 *  không cho dòng nào khác tồn tại. Kiểu thì không biết điều đó, nên chỗ này
 *  nói ra một lần thay vì rải `?? ''` khắp nơi. */
function requireActor(h: { actorId?: string; name: string }): { actorId: string; name: string } {
  if (!h.actorId) throw new Error('meeting_attendee: dòng host thiếu actor_id')
  return { actorId: h.actorId, name: h.name }
}
