import type { PipeTransform } from '@nestjs/common'
import type { ZodType } from 'zod'
import { PvError } from './problem'

/** Kiểm dữ liệu vào bằng CHÍNH schema của hợp đồng.
 *
 *  ------------------------------------------------------------------
 *  VÌ SAO KHÔNG DÙNG class-validator
 *  ------------------------------------------------------------------
 *  Idiom mặc định của Nest là DTO class kèm decorator trên từng field. Làm thế
 *  là mô hình hoá lần thứ hai đúng cái hình dữ liệu mà `@pv/contracts` đã mô
 *  tả bằng zod — và bản thứ hai sẽ lệch bản thứ nhất, không phải nếu mà là khi.
 *  Quyết định #4 của `docs/ban-giao-backend.md` nói zod là nguồn kiểu DUY NHẤT;
 *  hai mươi dòng dưới đây là toàn bộ giá phải trả để giữ đúng lời đó.
 *
 *  Khi cần OpenAPI, thêm `nestjs-zod` để `@nestjs/swagger` đọc được zod —
 *  không phải để thay chỗ này. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value)
    if (parsed.success) return parsed.data

    /* Gom lỗi theo TRƯỜNG, không trả một chuỗi dài. Màn cần tô đỏ đúng ô sai,
       và nó chỉ làm được thế nếu biết ô nào. */
    const fields: Record<string, string[]> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '(gốc)'
      ;(fields[key] ??= []).push(issue.message)
    }

    throw new PvError({
      kind: 'invalid',
      status: 400,
      title: 'Dữ liệu gửi lên không hợp lệ.',
      fields,
    })
  }
}

/** Cú pháp gọn ở controller: `@Query(zod(LeadBookQuery)) q: LeadBookQuery`. */
export const zod = <T>(schema: ZodType<T>) => new ZodPipe(schema)
