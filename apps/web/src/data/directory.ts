import { queryOptions, useQuery } from '@tanstack/react-query'
import type { Actor } from '@pv/engines'
import type { DirectoryResponse } from '@pv/contracts'
import { api, type ApiNeed } from '@/app/api'
import { toActor } from '@/data/auth'

/** AI LÀM Ở ĐÂY — `GET /users/directory`, sổ người dùng chung của mọi màn.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO ĐỨNG RIÊNG, KHÔNG NẰM TRONG `data/users.ts`
 *  ------------------------------------------------------------------
 *  `data/users.ts` là màn Quản trị: bốn cửa, một quyền (`người-dùng.quản-lý`),
 *  và dữ liệu của nó là trạng thái TÀI KHOẢN — đã đặt mật khẩu chưa, khoá từ
 *  bao giờ, mở ngày nào. File này hỏi một câu khác hẳn mà mọi Sale hỏi chục
 *  lần mỗi ngày: giao việc này cho ai được, đơn kia ai đứng tên, ô select này
 *  đổ tên ai ra. Câu đó không cần quyền quản trị, và trộn hai câu vào một query
 *  thì hoặc là cả công ty nhìn thấy ai đang bị khoá, hoặc là người giao việc
 *  không thấy được ai để giao.
 *
 *  ------------------------------------------------------------------
 *  ĐÂY LÀ THỨ THAY `dasVina.actors` — MỘT SỔ NGƯỜI, KHÔNG PHẢI BẢY TÊN
 *  ------------------------------------------------------------------
 *  Trước 28/08 mười hai chỗ trong app đọc thẳng `dasVina.actors`: bảy cái tên
 *  đóng băng trong fixture, không ai mở tài khoản mới mà chúng biết. Giờ mọi
 *  chỗ đó đi qua đây, nên thêm một người ở màn Quản trị là ô select nào cũng
 *  thấy — kể cả những ô không ai nhớ là có.
 *
 *  ------------------------------------------------------------------
 *  `need: {}` — CHỈ CẦN MỘT PHIÊN CÒN SỐNG
 *  ------------------------------------------------------------------
 *  Khai rỗng chứ không bỏ trống: `AccessNeed` không có `branch` và không có
 *  `permission` nghĩa là E2 chỉ còn một rào duy nhất — chưa đăng nhập thì
 *  không qua. Máy chủ khai đúng chữ đó (`@Need({})` ở `users.controller.ts`),
 *  nên hai bên vẫn diff được bằng hai dòng như mọi cửa khác. */

const DIRECTORY_NEED: ApiNeed = {}

export const DIRECTORY_KEY = ['platform', 'directory'] as const

/** Cả sổ người, đã dịch sang `Actor` của engine.
 *
 *  Dịch NGAY trong `queryFn` chứ không để chỗ gọi tự lo: mọi chỗ tiêu thụ danh
 *  sách này đều đưa nó cho E2 hoặc cho một hàm nhận `Actor[]`, và `roleId` trên
 *  dây là ASCII còn `roleId` mà ma trận quyền tra là tiếng Việt. Để chỗ gọi tự
 *  dịch là mười hai bản dịch, và bản quên dịch không hỏng ra lỗi — nó chỉ làm
 *  một người mất sạch quyền mà không có dòng log nào nói vì sao (xem
 *  `ENGINE_ROLE` trong `data/auth.ts`).
 *
 *  KHÔNG có `load` — cửa này có route thật, và theo nghi thức của
 *  `app/api/client.ts` thì vắng `load` chính là dấu hiệu duy nhất cho biết nó
 *  đã cắt sang máy chủ. */
export const directoryQuery = queryOptions({
  queryKey: DIRECTORY_KEY,
  queryFn: ({ signal }) =>
    api
      .read<DirectoryResponse>('/users/directory', { need: DIRECTORY_NEED, signal })
      .then((r) => r.rows.map(toActor)),
})

/** Sổ người cho một component. Rỗng trong lúc còn đang tải.
 *
 *  Rỗng chứ không `undefined`: mọi chỗ gọi đều đang đổ danh sách này vào một ô
 *  select hoặc một phép `find`, và `[]` cho ra một ô select trống — đúng thứ
 *  người dùng nhìn thấy trong 200ms đầu — còn `undefined` cho ra một chuỗi `?.`
 *  ở mười hai chỗ, trong đó có chỗ quên. */
export function useDirectory(): Actor[] {
  return useQuery(directoryQuery).data ?? []
}

/** Người của phòng Kinh doanh — trục LICENSE, không phải trục vai.
 *
 *  Lọc bằng `branches` vì câu hỏi là "ai làm việc trên màn Sales", và đó đúng
 *  là điều `branches` nói. Lọc bằng `roleId` sẽ phải liệt kê bốn vai rồi quên
 *  vai thứ năm vào ngày công ty thêm nó. */
export function useSalesPeople(): Actor[] {
  return useDirectory().filter((a) => a.branches.includes('Sales'))
}

/** Tên người GẬT của phòng — thứ từng là hằng số `HEAD_OF_SALES` trong fixture.
 *
 *  Tra bằng `roleId` chứ không bằng tên: "ai là trưởng phòng" là một sự thật
 *  của bảng người dùng, đổi được ở màn Quản trị, và câu chữ trên màn ("chờ ...
 *  gật") phải đổi theo trong cùng một lượt tải.
 *
 *  Chưa ai giữ vai đó thì trả về nhãn vai. Đó KHÔNG phải chỗ dựng tạm: một
 *  công ty vừa mở hệ, chưa gán trưởng phòng, vẫn phải đọc được câu "chờ trưởng
 *  phòng kinh doanh gật" — bịa một cái tên vào đó thì tệ hơn hẳn. */
export const APPROVER_ROLE_LABEL = 'trưởng phòng kinh doanh'

export function useApproverName(): string {
  const head = useDirectory().find((a) => a.roleId === 'trưởng-phòng')
  return head?.name ?? APPROVER_ROLE_LABEL
}

// ---------------------------------------------------------------------------
// Hai bảng option, và chúng KHÔNG thay nhau được
// ---------------------------------------------------------------------------

/** Sổ lead giữ TÊN ở `Lead.owner`; sổ cơ hội giữ ID ở `saleOwners`/`bdOwners`
 *  ("tên đổi được, id thì không" — docblock của `OpportunityDraft`). Dùng nhầm
 *  bảng thì tệp nạp xong trông vẫn đúng trên bảng, mà mọi phép lọc theo người
 *  đều trượt — kiểu sai không compiler nào bắt được vì cả hai đều là `string`.
 *
 *  Hai hàm, không phải một hàm với cờ `byId`: một tham số boolean là thứ rồi sẽ
 *  có chỗ truyền nhầm, và cái nhầm đó im lặng đúng như trên. */
export type PersonOption = { value: string; label: string }

export const peopleNameOptions = (people: readonly Actor[]): PersonOption[] =>
  people.map((a) => ({ value: a.name, label: a.name }))

export const peopleIdOptions = (people: readonly Actor[]): PersonOption[] =>
  people.map((a) => ({ value: a.id, label: a.name }))

/** Tên kèm vai — dạng dài, cho ô select của hồ sơ lead. */
export const peopleRoleOptions = (people: readonly Actor[]): PersonOption[] =>
  people.map((a) => ({ value: a.name, label: `${a.name} · ${a.role}` }))

/** Id → tên, và id lạ thì in ra chính nó.
 *
 *  In id thay vì "—" hay chuỗi rỗng: một id không còn trong sổ nghĩa là người
 *  đó đã bị khoá hoặc bị xoá, và dòng dữ liệu vẫn mang tên họ ở chỗ nó được
 *  ghi. Nuốt mất thì người đọc màn không có cách nào lần ra ai đã làm việc đó. */
export const personName = (people: readonly Actor[], id: string): string =>
  people.find((a) => a.id === id)?.name ?? id
