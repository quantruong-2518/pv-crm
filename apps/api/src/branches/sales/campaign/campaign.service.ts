import { Inject, Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  CampaignBookResponse,
  CampaignCreateResponse,
  CampaignMemberListResponse,
  CampaignMemberPatchResponse,
  CampaignPatchResponse,
  CampaignProfile,
  CampaignStartResponse,
  CampaignStopResponse,
  CampaignWaveAddResponse,
  type CampaignBookQuery,
  type CampaignCreate,
  type CampaignMemberPatch,
  type CampaignMemberQuery,
  type CampaignPatch,
  type CampaignStart,
  type CampaignWaveAdd,
  type CampaignWaveRow,
  type MailRunPatchResponse,
  type MasSendResponse,
} from '@pv/contracts'
import { ENV, type Env } from '@api/platform/config/env'
import { MailRunRepository } from '@api/platform/mail/mail-run.repository'
import { PvError, conflict, denied, notFound } from '@api/platform/http/problem'
import { toContract, toMemberRow, toProfile } from './campaign.mapper'
import { CampaignRepository } from './campaign.repository'
import { MasService } from './mas.service'

/** Sổ chiến dịch — nơi DUY NHẤT biết cả repository lẫn engine, cùng luật chịu
 *  lực `lead.service.ts` đã đặt ra.
 *
 *  Không tự viết logic gửi/huỷ: `start()` gọi `MasService.send()`, `stop()`
 *  gọi `MasService.cancel()` — cả hai đã có suppression, hàng đợi, cầu dao
 *  bounce và quy tắc huỷ của A6. Viết lại ở đây là hai nơi cho một luật, và
 *  luật thứ hai sẽ trôi khỏi luật thứ nhất ngay lần sửa tiếp theo. */
@Injectable()
export class CampaignService {
  constructor(
    private readonly repo: CampaignRepository,
    private readonly runs: MailRunRepository,
    private readonly mas: MasService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Không chạy `E2.visible()` như lưới thứ hai của `LeadService.book()`: đó
   *  là lưới cho object graph, và `sales.campaign` chưa là `ObjectKind` (nợ
   *  B4, xem docblock `campaign.schema.ts`) — chạy nó ở đây là gọi một hàng
   *  rào không thứ gì đứng sau. SQL của `repo.book()` là hàng rào thật. */
  async book(who: Actor, q: CampaignBookQuery): Promise<CampaignBookResponse> {
    const page = await this.repo.book(who, q, true)
    return CampaignBookResponse.parse({
      rows: page.rows.map(toContract),
      total: page.total,
      hidden: page.hidden,
    })
  }

  async profile(who: Actor, code: string): Promise<CampaignProfile> {
    const found = await this.repo.byCode(who, code, true)
    if (!found) throw notFound('chiến dịch', code)
    if (!found.inScope) {
      throw denied('out-of-scope', `Chiến dịch ${code} không đứng tên bạn — hỏi người đang giữ nó.`)
    }

    const waves = await this.wavesOf(code)
    return CampaignProfile.parse(toProfile(found, waves))
  }

  /** The creator owns it unless the form says otherwise.
   *
   *  Falling back to `null` left almost every campaign ownerless, because the
   *  form defaults to unassigned: the owner column read as a dash, its filter
   *  had nothing to offer, and for an `ownOnly` actor the scope axis
   *  (`ownerId = who.id`) then cut away the very rows they had just made.
   *
   *  Read back rather than hand-building the response: with an owner now
   *  attached, `ownerName` has to be the real name, and only the join inside
   *  `byCode` knows it. Unscoped read — this is the row the caller just wrote. */
  async create(who: Actor, body: CampaignCreate): Promise<CampaignCreateResponse> {
    const code = await this.repo.nextCode()
    await this.repo.create({
      code,
      name: body.name,
      ownerId: body.ownerId ?? who.id,
      sourceId: body.sourceId ?? null,
      slogan: body.slogan ?? null,
      thumbnailUrl: body.thumbnailUrl ?? null,
    })

    const created = await this.repo.byCode(who, code, false)
    if (!created) throw notFound('chiến dịch', code)
    return CampaignCreateResponse.parse(toContract(created))
  }

  async patch(who: Actor, code: string, body: CampaignPatch): Promise<CampaignPatchResponse> {
    const found = await this.repo.byCode(who, code, true)
    if (!found) throw notFound('chiến dịch', code)
    if (!found.inScope) {
      throw denied('out-of-scope', `Chiến dịch ${code} không đứng tên bạn — hỏi người đang giữ nó.`)
    }

    await this.repo.patch(code, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.ownerId !== undefined ? { ownerId: body.ownerId } : {}),
      ...(body.sourceId !== undefined ? { sourceId: body.sourceId } : {}),
      ...(body.slogan !== undefined ? { slogan: body.slogan } : {}),
      ...(body.thumbnailUrl !== undefined ? { thumbnailUrl: body.thumbnailUrl } : {}),
    })

    const after = await this.repo.byCode(who, code, true)
    if (!after) throw notFound('chiến dịch', code)
    return CampaignPatchResponse.parse(toContract(after))
  }

  async members(
    who: Actor,
    code: string,
    body: CampaignMemberPatch,
  ): Promise<CampaignMemberPatchResponse> {
    const found = await this.repo.byCode(who, code, true)
    if (!found) throw notFound('chiến dịch', code)
    if (!found.inScope) {
      throw denied('out-of-scope', `Chiến dịch ${code} không đứng tên bạn — hỏi người đang giữ nó.`)
    }

    const [added, removed] = await this.repo.run(async (tx) => {
      const added = await this.repo.addMembers(tx, code, body.add ?? [])
      const removed = await this.repo.removeMembers(tx, code, body.remove ?? [])
      return [added, removed] as const
    })

    const audienceCount = await this.repo.activeMemberCount(code)
    return CampaignMemberPatchResponse.parse({ added, removed, audienceCount })
  }

  /** Who is in the audience — the read half of `CampaignMemberPatch`.
   *
   *  `hidden` is 0 by construction, and that is not laziness: the campaign is
   *  the object the scope axis cuts, and it was already cut two lines up. A
   *  member of a campaign you are allowed to read is never itself out of
   *  scope, so there is no row here for the hidden-by-permission line to count. */
  async memberList(
    who: Actor,
    code: string,
    q: CampaignMemberQuery,
  ): Promise<CampaignMemberListResponse> {
    const found = await this.repo.byCode(who, code, true)
    if (!found) throw notFound('chiến dịch', code)
    if (!found.inScope) {
      throw denied('out-of-scope', `Chiến dịch ${code} không đứng tên bạn — hỏi người đang giữ nó.`)
    }

    const page = await this.repo.members(code, q)
    return CampaignMemberListResponse.parse({
      rows: page.rows.map(toMemberRow),
      total: page.total,
      hidden: 0,
    })
  }

  /** Chuyển `DRAFT` → `RUNNING` và bắn đợt đầu.
   *
   *  Trạng thái được nâng TRƯỚC vòng lặp gửi, không phải sau: một đợt lỗi
   *  giữa chừng (mẫu sai, MAS đang tắt, vượt trần lô) thì chiến dịch vẫn đúng
   *  là ĐANG CHẠY với những đợt đã gửi thành công trước đó — không phải NHÁP
   *  giả vờ chưa có gì rời máy trong khi thư đã nằm trong hàng đợi. Đợt lỗi
   *  gửi lại được từng cái một qua `POST /sales/mail/runs` với `campaignCode`,
   *  không phải gọi lại `/start` (guard `state !== 'DRAFT'` chặn đúng điều
   *  đó, tức chặn gửi trùng đợt đã thành công khi ai đó bấm `/start` lần hai). */
  async start(who: Actor, code: string, body: CampaignStart): Promise<CampaignStartResponse> {
    const found = await this.repo.byCode(who, code, true)
    if (!found) throw notFound('chiến dịch', code)
    if (!found.inScope) {
      throw denied('out-of-scope', `Chiến dịch ${code} không đứng tên bạn — hỏi người đang giữ nó.`)
    }
    if (found.row.state !== 'DRAFT') {
      throw conflict(
        `Chỉ chiến dịch NHÁP mới bắt đầu chạy được — chiến dịch này đang ${found.row.state}.`,
      )
    }

    /* A DRAFT can already have waves: the MAS modal on the lead book can pin a
       batch to one, which writes `campaign_run` and sends real mail while
       `state` stays DRAFT. Without this the DRAFT gate above waves `/start`
       through and the whole audience is mailed a second time. Kept out of the
       UPDATE below on purpose — merged in, 0 rows could not tell "no longer a
       draft" from "already has a wave", and the two send the user elsewhere. */
    if (found.waveCount > 0) {
      throw conflict(
        `Chiến dịch ${code} đã có đợt đi rồi — mở hồ sơ chiến dịch và thêm đợt mới ở đó, đừng bắt đầu chạy lại.`,
      )
    }

    const leadCodes = await this.repo.activeMemberCodes(code)
    if (leadCodes.length === 0) {
      throw conflict('Chiến dịch chưa có người nhận nào — thêm thành viên trước khi chạy.')
    }

    /* Early gate, NOT a second fence: `MasService.send()` keeps enforcing
       `PV_MAS_BATCH_MAX`. The audience is built here on the server, so the zod
       recipient cap never sees it and the fence downstream would surface as a
       400 pinned to a `leadCodes` field this screen has no box for. */
    if (leadCodes.length > this.env.PV_MAS_BATCH_MAX) {
      throw conflict(
        `Tệp người nhận có ${leadCodes.length} lead, vượt trần ${this.env.PV_MAS_BATCH_MAX} lead mỗi đợt — bớt thành viên rồi bắt đầu chạy lại.`,
      )
    }

    /* Conditional write, not `setState`: the DRAFT check above is a read, and
       two overlapping requests both pass it. See `startIfDraft`. */
    if (!(await this.repo.startIfDraft(code))) {
      throw conflict(
        `Chiến dịch ${code} vừa rời trạng thái NHÁP ở một lượt khác — tải lại để xem trạng thái hiện tại trước khi bắn.`,
      )
    }

    const waves: MasSendResponse[] = []
    for (const wave of body.waves) {
      waves.push(await this.mas.send(who, { ...wave, leadCodes, campaignCode: code }))
    }

    return CampaignStartResponse.parse({ state: 'RUNNING', waves })
  }

  /** Wave two onwards, on the audience the campaign already froze.
   *
   *  Until this door existed every later wave detoured through the MAS modal
   *  on the lead book, where the sender RE-PICKS the recipients by hand —
   *  exactly what `campaign_member` exists to make unnecessary, and a hand
   *  pick is a DIFFERENT set. Nothing of the send path is rewritten here:
   *  `MasService.send()` still owns suppression, the queue, the bounce
   *  breaker, `PV_MAS_BATCH_MAX`, and the `campaign_run` row with the next
   *  `waveNo`. */
  async addWave(who: Actor, code: string, body: CampaignWaveAdd): Promise<CampaignWaveAddResponse> {
    const found = await this.repo.byCode(who, code, true)
    if (!found) throw notFound('chiến dịch', code)
    if (!found.inScope) {
      throw denied('out-of-scope', `Chiến dịch ${code} không đứng tên bạn — hỏi người đang giữ nó.`)
    }
    /* DONE gets through because RUNNING is a passing state, not a resting one:
       `CampaignSweeper` runs `closeFinished()` on a timer and drops a campaign
       to DONE the moment its every batch settles, so a one-wave campaign is
       DONE within minutes and demanding RUNNING here would shut the door this
       endpoint exists to open. A new wave reopens the campaign; the sweeper
       closes it again by itself once that wave settles.

       STOPPED does not get through: stopping is a deliberate act that pulled
       queued mail back out, so resuming has to be its own decision rather than
       a side effect of adding a wave. A DRAFT that already carries waves is the
       legacy shape the MAS modal used to write, and this door is its only way
       back to a normal life cycle. */
    if (found.row.state === 'STOPPED') {
      throw conflict(
        `Chiến dịch ${code} đã dừng — không nối đợt vào chiến dịch đã dừng; tạo chiến dịch mới nếu muốn gửi tiếp.`,
      )
    }
    if (found.row.state === 'DRAFT' && found.waveCount === 0) {
      throw conflict(
        `Chiến dịch ${code} chưa bắn đợt nào — bấm "Bắt đầu chạy" trong hồ sơ để gửi đợt đầu tiên.`,
      )
    }

    const leadCodes = await this.repo.activeMemberCodes(code)
    if (leadCodes.length === 0) {
      throw conflict('Chiến dịch chưa có người nhận nào — thêm thành viên trước khi bắn đợt mới.')
    }

    /* Same early gate as `start()` — `MasService.send()` stays the real fence. */
    if (leadCodes.length > this.env.PV_MAS_BATCH_MAX) {
      throw conflict(
        `Tệp người nhận có ${leadCodes.length} lead, vượt trần ${this.env.PV_MAS_BATCH_MAX} lead mỗi đợt — bớt thành viên rồi bắn lại.`,
      )
    }

    /* Raised BEFORE the send, on the reasoning `start()` already spells out: a
       wave that fails halfway still leaves a campaign that truly is running,
       with its batch already in the queue. */
    if (found.row.state !== 'RUNNING') await this.repo.setState(code, 'RUNNING')

    return CampaignWaveAddResponse.parse(
      await this.mas.send(who, { ...body.wave, leadCodes, campaignCode: code }),
    )
  }

  /** Dừng: RÚT các đợt CHƯA GỬI khỏi hàng đợi. Tái dùng nguyên
   *  `MasService.cancel()` của A6 cho từng lô thay vì viết lại quy tắc huỷ —
   *  cùng lý do docblock đầu file. */
  async stop(who: Actor, code: string): Promise<CampaignStopResponse> {
    const found = await this.repo.byCode(who, code, true)
    if (!found) throw notFound('chiến dịch', code)
    if (!found.inScope) {
      throw denied('out-of-scope', `Chiến dịch ${code} không đứng tên bạn — hỏi người đang giữ nó.`)
    }
    if (found.row.state !== 'RUNNING') {
      throw conflict(
        `Chỉ chiến dịch ĐANG CHẠY mới dừng được — chiến dịch này đang ${found.row.state}.`,
      )
    }

    const cancelled: MailRunPatchResponse[] = []
    /* One read for the whole chain, through the same `wavesOf` the profile
       uses — the old loop asked `runs.byId` once per wave, two lanes for one
       question with the N+1 on the lane nobody looked at. */
    for (const { run } of await this.wavesOf(code)) {
      if (run.state === 'SENT' || run.state === 'CANCELLED') continue

      /* Một lô do người KHÁC đứng tên (`created_by`) có thể bị `MasService.cancel`
         từ chối bằng out-of-scope khi `who.ownOnly` — bỏ qua lô đó thay vì làm
         hỏng cả lượt dừng. Lô đó vẫn huỷ được riêng, qua Sổ lô gửi, bởi đúng
         người đã bắn nó. */
      try {
        cancelled.push(await this.mas.cancel(who, run.id, { state: 'CANCELLED' }))
      } catch (e) {
        /* Only THAT refusal is skippable. A bare `catch` also swallowed DB and
           network failures and then filed the campaign STOPPED anyway — the
           screen reported a clean stop while a batch was still in the air. */
        if (e instanceof PvError && e.reason === 'out-of-scope') continue
        throw e
      }
    }

    await this.repo.setState(code, 'STOPPED')

    return CampaignStopResponse.parse({ state: 'STOPPED', cancelled })
  }

  /** Chuỗi đợt cho hồ sơ — gắn số thứ tự (`campaign_run`) vào NGUYÊN
   *  `MailRunRow`, không dựng lại 11 con số của lô gửi.
   *
   *  Qua `MailRunRepository.list()`, KHÔNG qua `byId()`: `byId` trả hàng
   *  DB trần của `mail_run` (đúng cho việc `stop()` chỉ cần `.state`/`.id`),
   *  còn `MailRunRow` — hình hợp đồng `sent`/`delivered`/`opened`/… — chỉ
   *  `list()` mới gộp qua hai lượt đọc `email_delivery`/`mail_event` mà
   *  `MailRunRepository` tự làm. Một đợt mà lô của nó không còn trong kết quả
   *  (không nên xảy ra, `mail_run_id` có khoá ngoại) bị bỏ qua thay vì làm vỡ
   *  cả hồ sơ. */
  private async wavesOf(code: string): Promise<CampaignWaveRow[]> {
    const waveRows = await this.repo.waves(code)
    if (waveRows.length === 0) return []

    const ids = waveRows.map((w) => w.mailRunId)
    const page = await this.runs.list(
      { page: 1, size: Math.min(ids.length, 200), sort: 'createdAt', dir: 'asc' },
      ids,
    )
    const runById = new Map(page.rows.map((run) => [run.id, run]))

    const waves: CampaignWaveRow[] = []
    for (const w of waveRows) {
      const run = runById.get(w.mailRunId)
      if (run) waves.push({ waveNo: w.waveNo, run })
    }
    return waves
  }
}
