/** Tầng dữ liệu từ ngoài vào — cửa chính của zone.
 *
 *  | File        | Giữ cái gì                                                 |
 *  |-------------|------------------------------------------------------------|
 *  | `client.ts` | chuỗi interceptor: gắn phiên · chặn phiên chết · kiểm quyền |
 *  | `errors.ts` | `ApiError` và bảng mã lỗi → câu nói với người dùng          |
 *
 *  `data/*.ts` khai query đi qua đây. Màn thì không: màn gọi `useQuery`, và đó
 *  là ranh giới giữ cho màn không biết gì về HTTP. */

export {
  api,
  type ApiNeed,
  type ApiRequest,
  type Fetcher,
  type Method,
  type ReadOptions,
  type WriteOptions,
} from './client'
export { ApiError, isApiError, userMessage, type ApiFailure, type FieldErrors } from './errors'
export { ServerDown } from './server-down'
