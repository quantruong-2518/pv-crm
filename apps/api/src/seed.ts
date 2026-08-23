import { createDb } from '@api/platform/db/create-db'
import { dasVina, LEADS } from '@pv/engines/fixtures/das-vina'
import type { ExitReason } from '@pv/contracts'
import { lead } from '@api/branches/sales/lead/lead.schema'
import { actor, edge, objectRef } from '@api/platform/db/platform.schema'
import { loadEnv } from '@api/platform/config/env'

/** Nạp kịch bản 2 · DAS Vina vào Postgres tại máy.
 *
 *  Nguồn là FIXTURE ĐÓNG BĂNG, không phải dữ liệu bịa: cùng 100 dòng sổ mà
 *  `apps/web` đang vẽ, nên hai đầu so được với nhau bằng mắt trong lúc cắt
 *  từng endpoint sang backend. Đây là chỗ DUY NHẤT trong `apps/api` được phép
 *  nhập fixture — chỗ khác nhập là đưa tên khách hàng vào đường chạy thật.
 *
 *  Chạy: `pnpm db:up && pnpm db:push && pnpm db:seed`. */

/** Nhãn tiếng Việt (fixture) → khoá ASCII (hợp đồng).
 *
 *  Bảng này TỒN TẠI vì nợ số 4 chưa trả xong ở phía fixture: `Lead.exitReason`
 *  đang lưu thẳng nhãn hiển thị làm giá trị. Nó biến mất khi bước B của
 *  `docs/ban-giao-backend.md` đổi fixture sang khoá. */
const EXIT_KEY: Record<string, ExitReason> = {
  'Không gọi được ai': 'khong-goi-duoc',
  'Không phải khách của mình': 'khong-phai-khach-cua-minh',
  'Năm nay không có tiền': 'khong-co-ngan-sach',
  'Người liên hệ nghỉ việc': 'nguoi-lien-he-nghi',
  'Khách chọn bên khác': 'chon-ben-khac',
  'Im sau báo giá': 'im-sau-bao-gia',
}

/** Dịch nhãn sang khoá, và NỔ khi gặp nhãn lạ.
 *
 *  Bản trước viết `EXIT_KEY[label] ?? null` — fixture thêm lý do thứ bảy thì
 *  52 dòng sổ lặng lẽ mất trường `exitReason`, seed vẫn báo thành công, và cái
 *  sai chỉ lộ ra ở một biểu đồ nào đó vài tuần sau. Seed hỏng to còn hơn seed
 *  hỏng nhỏ mà im. */
function exitKeyOf(label: string): ExitReason {
  const key = EXIT_KEY[label]
  if (!key) {
    throw new Error(
      `Lý do rơi "${label}" chưa có khoá ASCII trong EXIT_KEY. ` +
        `Thêm vào cả \`packages/contracts/src/sales/enums.ts\` lẫn bảng ở seed.`,
    )
  }
  return key
}

async function seed(): Promise<void> {
  const env = loadEnv()
  const { db, close, kind } = await createDb(env.DATABASE_URL)

  const actors = dasVina.actors
  const idOf = new Map(actors.map((a) => [a.name, a.id]))

  const orphans = LEADS.filter((l) => l.owner && !idOf.has(l.owner)).map((l) => l.code)
  if (orphans.length > 0) {
    throw new Error(
      `${orphans.length} lead có người giữ không khớp actor nào: ${orphans.join(', ')}`,
    )
  }

  await db.transaction(async (tx) => {
    /* Xoá theo thứ tự NGƯỢC khoá ngoại. Seed là thao tác dựng LẠI, không phải
       thêm chồng — chạy hai lần phải ra cùng một cơ sở dữ liệu. */
    await tx.delete(edge)
    await tx.delete(lead)
    await tx.delete(objectRef)
    await tx.delete(actor)

    await tx.insert(actor).values(
      actors.map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        role: a.role,
        roleId: a.roleId,
        branches: a.branches,
        ownOnly: a.ownOnly ?? false,
      })),
    )

    /* E1 · đồ thị. Object trước, cạnh sau — cạnh có khoá ngoại hai đầu. */
    await tx.insert(objectRef).values(
      dasVina.objects.map((o) => ({
        code: o.code,
        kind: o.kind,
        branch: o.branch,
        label: o.label,
        owner: o.owner ?? null,
        state: o.state ?? null,
        amount: o.amount ?? null,
      })),
    )
    await tx
      .insert(edge)
      .values(dasVina.edges.map((e) => ({ fromCode: e.from, toCode: e.to, kind: e.kind })))

    await tx.insert(lead).values(
      LEADS.map((l) => ({
        code: l.code,
        company: l.company,
        province: l.province,
        category: l.category,
        tier: l.tier,
        requiredFilled: l.requiredFilled,
        optionalFilled: l.optionalFilled,
        ownerId: l.owner ? (idOf.get(l.owner) ?? null) : null,
        stage: l.stage ?? null,
        dealCode: l.dealCode ?? null,
        contractCode: l.contractCode ?? null,
        daysHere: l.daysHere,
        source: l.source,
        createdAt: new Date(l.createdAt),
        exitReason: l.exitReason ? exitKeyOf(l.exitReason) : null,
        exitedAt: l.exitedAt ? new Date(l.exitedAt) : null,
      })),
    )
  })

  console.log(
    `Đã nạp ${actors.length} actor · ${dasVina.objects.length} object · ` +
      `${dasVina.edges.length} cạnh · ${LEADS.length} lead · driver ${kind}.`,
  )
  await close()
}

void seed().catch((e: unknown) => {
  console.error(e)
  process.exitCode = 1
})
