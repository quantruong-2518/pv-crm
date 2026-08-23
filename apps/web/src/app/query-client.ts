import { QueryClient } from '@tanstack/react-query'
import { useSession } from '@/app/auth'

/** TanStack Query — tầng "dữ liệu từ ngoài vào".
 *
 *  Hôm nay dữ liệu là fixture đóng băng, không có server nào để gọi. Đặt query
 *  vào ngay từ giờ vẫn có lãi, vì nó là ĐƯỜNG NỐI đã hẹn trong CLAUDE.md:
 *  "engine đã có interface để sau này cắm backend thật mà không phải sửa màn".
 *  Màn gọi `useQuery`, không gọi thẳng fixture; đổi `queryFn` sang `fetch` là
 *  xong, màn không đụng dòng nào.
 *
 *  Cấu hình bám đúng sự thật hiện tại: dữ liệu ĐÓNG BĂNG nên không bao giờ cũ,
 *  không refetch, không retry. Bật lại mấy thứ đó lúc có server thật. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: Infinity,
      /* Không thử lại, kể cả khi có server: thử lại một request bị 403 chỉ để
         bị từ chối ba lần. Thử lại là việc của `app/api/client.ts`, nơi biết
         lỗi thuộc loại nào — nó gia hạn vé rồi thử ĐÚNG một lần cho 401. */
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
})

/** Đổi người thì cache PHẢI chết theo.
 *
 *  Cache của TanStack Query nằm trong bộ nhớ và không biết gì về phiên. Không
 *  dọn thì người đăng nhập sau trên cùng máy thấy nguyên sổ lead của người
 *  trước — dữ liệu cũ hiện ngay lập tức vì `staleTime: Infinity`, trước cả khi
 *  query đầu tiên của người mới kịp chạy. Đây là rò rỉ dữ liệu thật, không phải
 *  lỗi hiển thị.
 *
 *  Hai cửa, và CHỈ hai: đăng xuất, và đăng nhập bằng người khác.
 *
 *  Phiên `hết-hạn` cố tình KHÔNG dọn. Lớp khoá giữ màn cũ nằm nguyên phía sau
 *  để người dùng vào lại là làm tiếp (`app/auth/expiry.tsx`); dọn cache ở đây
 *  thì họ vào lại và thấy một màn trắng đang tải — tức là mất đúng thứ lớp khoá
 *  sinh ra để giữ. Đổi lại, dữ liệu cũ còn trong bộ nhớ sau lớp mờ; ai cần dọn
 *  thật thì bấm "Đăng xuất", và đường đó đi qua đúng nhánh đầu tiên dưới đây. */
useSession.subscribe((now, before) => {
  if (before.status === 'đã-vào' && now.status === 'khách') queryClient.clear()
  else if (now.actor && before.actor && now.actor.id !== before.actor.id) queryClient.clear()
})
