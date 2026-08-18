import { QueryClient } from '@tanstack/react-query'

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
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
})
