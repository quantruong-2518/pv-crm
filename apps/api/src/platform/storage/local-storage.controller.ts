import { Controller, Get, Header, HttpCode, Param, Put, Req, Res } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { Public } from '../access/need.decorator'
import { MachineDoor } from '../http/cross-site.guard'
import { conflict, invalid, notFound } from '../http/problem'
import { DiskStorage } from './disk.storage'
import { StorageService } from './storage.service'

/** The disk driver's stand-in for a bucket — `PUT`/`GET /storage/local/:token`.
 *
 *  `@Public()` for the reason a presigned S3 URL needs no login: the signed
 *  token in the path IS the credential, and the browser sends it with no
 *  cookie. Answers 404 on the `s3` driver, so production has no such door.
 *  The raw body arrives through the parser `main.ts` registers for the two
 *  upload types, only when this driver is on. */
@Controller('storage/local')
export class LocalStorageController {
  constructor(private readonly storage: StorageService) {}

  /* The signed token is the credential, as on one-click unsubscribe; without
     this, a comm transcript's `text/plain` body is refused as a CSRF shape. */
  @Put(':token')
  @HttpCode(200)
  @Public()
  @MachineDoor()
  async put(@Param('token') token: string, @Req() req: FastifyRequest): Promise<void> {
    const disk = this.disk()
    const grant = disk.verify(token)
    if (grant?.o !== 'put') throw notFound('tệp')

    const body = req.body
    const type = (req.headers['content-type'] ?? '').split(';')[0]?.trim()
    if (!Buffer.isBuffer(body) || type !== grant.m || body.length !== grant.b) {
      throw invalid({ body: ['Tệp không khớp loại hoặc dung lượng đã khai.'] })
    }
    await disk.write(grant.k, body).catch((error: NodeJS.ErrnoException) => {
      throw error.code === 'EEXIST' ? conflict('Tệp này đã được tải lên.') : error
    })
  }

  @Get(':token')
  @Header('Cache-Control', 'private, no-store')
  @Public()
  async get(
    @Param('token') token: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const disk = this.disk()
    const grant = disk.verify(token)
    if (grant?.o !== 'get') throw notFound('tệp')

    const bytes = await disk.read(grant.k).catch(() => null)
    if (!bytes) throw notFound('tệp')
    void reply.header('Content-Type', mimeOf(bytes))
    return bytes
  }

  private disk(): DiskStorage {
    if (!(this.storage instanceof DiskStorage)) throw notFound('tệp')
    return this.storage
  }
}

/** A GET grant carries no type, and every upload type signs itself in its
 *  first bytes — more honest than trusting a key's extension. A file with no
 *  signature and no NUL byte is the one text type a comm takes. */
function mimeOf(bytes: Buffer): string {
  const at = (from: number, to: number) => bytes.subarray(from, to).toString('latin1')
  if (at(0, 4) === '%PDF') return 'application/pdf'
  if (at(8, 12) === 'WEBP') return 'image/webp'
  if (at(8, 12) === 'WAVE') return 'audio/wav'
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg'
  if (at(1, 4) === 'PNG') return 'image/png'
  if (at(0, 3) === 'ID3' || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)) {
    return 'audio/mpeg'
  }
  if (at(4, 8) === 'ftyp') return 'audio/mp4'
  if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'audio/webm'
  if (at(0, 4) === 'OggS') return 'audio/ogg'
  if (at(0, 4) === 'PK\x03\x04') {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }
  if (!bytes.subarray(0, 512).includes(0)) return 'text/plain; charset=utf-8'
  return 'application/octet-stream'
}
