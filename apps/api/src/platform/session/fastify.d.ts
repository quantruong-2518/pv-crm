import type { Actor } from '@pv/engines'

/** Gắn người đang gọi vào request. Một dòng khai báo, để `req.actor` có kiểu ở
 *  mọi chỗ thay vì `as any` ở bốn chỗ. */
declare module 'fastify' {
  interface FastifyRequest {
    actor?: Actor | null
    /** Set by `ActorGuard`, read by `PasswordChangeGuard`. A separate field
     *  rather than one more key on `actor`, because `actor` is the engines'
     *  shape and the engines have no concept of a password. */
    owesPasswordChange?: boolean
  }
}
