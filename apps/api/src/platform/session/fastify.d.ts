import type { Actor } from '@pv/engines'

/** Gắn người đang gọi vào request. Một dòng khai báo, để `req.actor` có kiểu ở
 *  mọi chỗ thay vì `as any` ở bốn chỗ. */
declare module 'fastify' {
  interface FastifyRequest {
    actor?: Actor | null
  }
}
