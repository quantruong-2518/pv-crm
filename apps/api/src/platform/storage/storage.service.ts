/** OBJECT STORAGE — bytes in, bytes out, and URLs the browser talks to directly.
 *
 *  An abstract class rather than an interface so it is its own DI token: a
 *  caller writes `constructor(private readonly storage: StorageService)` and
 *  never learns which driver `STORAGE_DRIVER` picked. `s3` is Tigris on Fly;
 *  `disk` is a dev machine with no bucket, signing its own URLs.
 *
 *  Presigned URLs are the point: file bytes never cross the API's JSON path
 *  and never meet its 1 MiB body limit. */
export abstract class StorageService {
  /** Valid ~15 minutes, bound to this content type and this exact length — the
   *  browser's `Content-Length` must equal `bytes` or the PUT is refused. */
  abstract presignPut(key: string, mime: string, bytes: number): Promise<string>
  abstract presignGet(key: string, ttlSeconds?: number): Promise<string>
  abstract read(key: string): Promise<Buffer>
  /** Absent is success: removing twice must not fail the second sweep. */
  abstract remove(key: string): Promise<void>
}

/** `read()` of a key that holds nothing — a PUT that never happened, or bytes
 *  already swept. Final: waiting will not make the object appear. */
export class StorageObjectMissingError extends Error {
  constructor(key: string) {
    super(`storage: no object at ${key}`)
    this.name = 'StorageObjectMissingError'
  }
}

export const PUT_TTL_SECONDS = 15 * 60
export const GET_TTL_SECONDS = 600
