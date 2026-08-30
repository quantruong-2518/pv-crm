import { Injectable } from '@nestjs/common'
import type { Actor } from '@pv/engines'
import {
  ConfigBundle,
  ConfigListResponse,
  type ConfigEntryCreate,
  type ConfigEntryPatch,
  type ConfigList,
  type ConfigOrderPatch,
} from '@pv/contracts'
import { conflict, invalid, notFound } from '@api/platform/http/problem'
import { SalesConfigGate, type ConfigChange, type ConfigReceipt } from './config.approval'
import { toBundle, toContract, toUsage } from './config.mapper'
import { SalesConfigRepository } from './config.repository'
import type { ConfigRowDb } from './config.schema'

/** Cấu hình danh mục Sales — nơi DUY NHẤT biết cả repository lẫn engine.
 *
 *  Ở module lead, engine mà service biết là E2. Ở đây là **E3**, và nó được
 *  biết qua đúng một cửa: `SalesConfigGate`. Ranh giới vẫn y hệt và vẫn là thứ
 *  chịu lực của cả `apps/api` — repository `async` và không quyết định gì;
 *  engine đồng bộ, nhận dữ liệu đã nạp, trả một quyết định; service nối hai
 *  thứ đó.
 *
 *  ------------------------------------------------------------------
 *  ĐỌC THÌ TRẢ, GHI THÌ ĐỀ NGHỊ
 *  ------------------------------------------------------------------
 *  Ba hàm ghi dưới đây kiểm xong xuôi — hình dữ liệu, thuộc tính có đúng danh
 *  mục không, tên có trùng không, người phụ trách có thật không — rồi KHÔNG
 *  ghi. Chúng dựng một `ConfigChange` và đưa cho cửa duyệt. Lý do nằm ở ma trận
 *  quyền: E2 chỉ cấp `cấu-hình.đề-nghị`, không có `cấu-hình.sửa`.
 *
 *  Kiểm trước rồi mới đề nghị chứ không đề nghị rồi kiểm lúc gật: người gõ sai
 *  phải biết mình gõ sai ngay lúc gõ, không phải ba ngày sau khi trưởng phòng
 *  bấm nút và nhận một lỗi không phải của họ. */
@Injectable()
export class SalesConfigService {
  constructor(
    private readonly repo: SalesConfigRepository,
    private readonly gate: SalesConfigGate,
  ) {}

  /** Cả sáu danh mục. Một lần gọi, một câu truy vấn. */
  async bundle(): Promise<ConfigBundle> {
    /* Kiểm chính dữ liệu MÌNH trả ra bằng hợp đồng — cùng lý do với
       `LeadBookResponse.parse`: một cột đổi kiểu hoặc một trường quên map đều
       lọt qua `tsc` nếu mapper sai theo, nhưng không lọt qua đây. Giá phải trả
       bị chặn trên bởi kích thước của chính sáu danh mục, vài chục dòng. */
    /* The two queries run side by side, not in sequence: neither depends on the
       other, and the config screen waits on both before it can draw a row. */
    const [rows, tallies] = await Promise.all([this.repo.all(), this.repo.usage()])
    return ConfigBundle.parse(toBundle(rows, toUsage(tallies)))
  }

  async list(list: ConfigList): Promise<ConfigListResponse> {
    const rows = await this.repo.list(list)
    return ConfigListResponse.parse({ list, rows: rows.map(toContract) })
  }

  async create(who: Actor, list: ConfigList, body: ConfigEntryCreate): Promise<ConfigReceipt> {
    this.assertAttrs(list, body, true)
    await this.assertOwnerReal(body.ownerId)
    this.assertNameFree(await this.repo.list(list), body.name)

    return this.propose(who, {
      kind: 'tao',
      list,
      draft: {
        name: body.name,
        ...(body.limitDays === undefined ? {} : { limitDays: body.limitDays }),
        ...(body.ownerId === undefined ? {} : { ownerId: body.ownerId }),
        ...(body.kind === undefined ? {} : { kind: body.kind }),
      },
    })
  }

  async patch(
    who: Actor,
    list: ConfigList,
    id: string,
    body: ConfigEntryPatch,
  ): Promise<ConfigReceipt> {
    this.assertAttrs(list, body, false)

    const rows = await this.repo.list(list)
    if (!rows.some((r) => r.id === id)) throw notFound(`mục của danh mục ${list}`, id)

    if (body.ownerId) await this.assertOwnerReal(body.ownerId)
    if (body.name !== undefined) this.assertNameFree(rows, body.name, id)

    return this.propose(who, { kind: 'sua', list, id, patch: body })
  }

  /** Đổi thứ tự cả danh mục.
   *
   *  Đòi danh sách ĐẦY ĐỦ và ĐÚNG bằng những gì đang có. Một danh sách thiếu
   *  dòng sẽ để lại dòng đó mang `ord` cũ, tức chèn nó vào một chỗ ngẫu nhiên
   *  giữa các số mới — và `ord` ở đây là thứ chở nghĩa nghiệp vụ ("bậc nào",
   *  "cột thứ mấy"), nên một thứ tự sai không phải chuyện hiển thị. */
  async reorder(who: Actor, list: ConfigList, body: ConfigOrderPatch): Promise<ConfigReceipt> {
    const have = (await this.repo.list(list)).map((r) => r.id)
    const missing = have.filter((id) => !body.ids.includes(id))
    const strange = body.ids.filter((id) => !have.includes(id))

    if (missing.length > 0 || strange.length > 0) {
      throw invalid(
        {
          ids: [
            ...(missing.length > 0 ? [`Thiếu: ${missing.join(', ')}`] : []),
            ...(strange.length > 0 ? [`Không thuộc danh mục này: ${strange.join(', ')}`] : []),
          ],
        },
        'Thứ tự mới phải liệt kê đúng và đủ các mục của danh mục.',
      )
    }

    return this.propose(who, { kind: 'thu-tu', list, ids: body.ids })
  }

  // ── CHỖ NỐI E3 · một điểm cho cả ba đường ghi ─────────────────────────────

  /** Mọi thay đổi đi qua ĐÚNG hàm này. Không có đường vòng.
   *
   *  Hôm nay `gate.propose` ném lỗi vì E3 chưa có nơi lưu — xem
   *  `config.approval.ts`, chỗ đó ghi rõ ba việc phải làm để mở. Nhánh
   *  `approved` bên dưới là đường sẽ chạy ngày E3 gật ngay (chuỗi duyệt rỗng,
   *  hoặc người đề nghị cũng là người gật); nhánh `waiting` KHÔNG ghi gì cả, và
   *  đó là toàn bộ điểm của việc tách hai bước. */
  private async propose(who: Actor, change: ConfigChange): Promise<ConfigReceipt> {
    const receipt = await this.gate.propose(who, change)
    if (receipt.state === 'approved') await this.apply(change)
    return receipt
  }

  /** Áp dụng một thay đổi ĐÃ ĐƯỢC GẬT. Không ai gọi thẳng hàm này. */
  private async apply(change: ConfigChange): Promise<void> {
    if (change.kind === 'tao') {
      await this.repo.create(change.list, change.draft)
      return
    }
    if (change.kind === 'sua') {
      await this.repo.patch(change.list, change.id, change.patch)
      return
    }
    await this.repo.reorder(change.list, change.ids)
  }

  // ── kiểm · ba câu hỏi mà zod của thân yêu cầu không trả lời được ──────────

  /** Thuộc tính riêng phải đúng danh mục của nó.
   *
   *  zod kiểm được HÌNH của thân yêu cầu, nhưng `list` nằm ở ĐƯỜNG DẪN — nên
   *  quan hệ "chỉ `STAGE` mới có `limitDays`" không nằm trong tầm nhìn của nó.
   *  Ở đây là chỗ duy nhất thấy đủ cả hai. `CHECK config_limit_only_stage` ở
   *  tầng bảng là lưới thứ hai; nó bắt được chuyện tương tự nhưng chỉ nói được
   *  bằng tiếng của Postgres. */
  private assertAttrs(
    list: ConfigList,
    v: { limitDays?: number; ownerId?: string | null; kind?: string },
    requireLimit: boolean,
  ): void {
    const wrong: Record<string, string[]> = {}
    const only = (field: string, owner: ConfigList, given: boolean): void => {
      if (given && list !== owner) wrong[field] = [`Chỉ danh mục ${owner} mới có ô này.`]
    }

    only('limitDays', 'STAGE', v.limitDays !== undefined)
    only('ownerId', 'CATEGORY', v.ownerId !== undefined)
    only('kind', 'SOURCE', v.kind !== undefined)

    /* Chỉ đòi lúc TẠO. Lúc sửa, vắng mặt nghĩa là "giữ nguyên hạn cũ", còn
       xoá hạn của một cột phễu thì không có đường nào — đúng như CHECK ở bảng. */
    if (requireLimit && list === 'STAGE' && v.limitDays === undefined) {
      wrong.limitDays = ['Cột của phễu bắt buộc có hạn, tính bằng ngày.']
    }

    if (Object.keys(wrong).length > 0) throw invalid(wrong)
  }

  /** Tên không trùng trong phần ĐANG SỐNG của danh mục.
   *
   *  `config_name_live` ở tầng bảng mới là hàng rào thật (nó không phân biệt
   *  hoa thường và không cửa vào nào quên được). Câu hỏi ở đây chỉ để trả lời
   *  sớm và trả lời tử tế — nói ra mã của dòng đang chiếm tên, thứ mà một lỗi
   *  `23505` từ driver không nói được. */
  private assertNameFree(rows: ConfigRowDb[], name: string, exceptId?: string): void {
    const key = name.toLowerCase()
    const clash = rows.find((r) => r.active && r.id !== exceptId && r.name.toLowerCase() === key)
    if (clash) throw conflict(`Danh mục này đã có mục tên "${clash.name}" (${clash.id}).`)
  }

  /** Người phụ trách phải có trong sổ nhân sự. */
  private async assertOwnerReal(ownerId: string | null | undefined): Promise<void> {
    if (!ownerId) return
    if (await this.repo.actorExists(ownerId)) return
    throw invalid({ ownerId: [`Không có người nào mang mã "${ownerId}".`] })
  }
}
