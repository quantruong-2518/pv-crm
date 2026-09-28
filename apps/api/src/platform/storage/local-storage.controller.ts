import { Controller, Get, Header, HttpCode, Param, Put, Req, Res } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { Public } from '../access/need.decorator'
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

  @Put(':token')
  @HttpCode(200)
  @Public()
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

/** A GET grant carries no type, and the two upload types sign themselves in
 *  their first bytes — more honest than trusting a key's extension. */
function mimeOf(bytes: Buffer): string {
  if (bytes.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf'
  if (bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg'
  return 'application/octet-stream'
}
