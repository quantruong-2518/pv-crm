import { Logger, type OnApplicationBootstrap } from '@nestjs/common'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { SCAN_PUT_HEADERS } from '@pv/contracts'
import type { Env } from '../config/env'
import {
  GET_TTL_SECONDS,
  PUT_TTL_SECONDS,
  StorageObjectMissingError,
  StorageService,
} from './storage.service'

/** Tigris through the AWS SDK, configured from the variable names `fly storage
 *  create` sets, so attaching a bucket needs no renaming.
 *
 *  Checksums are `WHEN_REQUIRED` because since SDK 3.729 a presigned PUT
 *  otherwise carries a CRC32 of the EMPTY body, and every browser upload then
 *  fails the checksum. Virtual-hosted addressing (no `forcePathStyle`) is
 *  what Tigris documents for new buckets.
 *
 *  Bucket CORS is ensured on every boot: the rule set is small, `PutBucketCors`
 *  replaces it whole, and an origin added to `PV_CORS_ORIGINS` then reaches
 *  the bucket on the next deploy without a runbook step anyone can forget. */
export class S3Storage extends StorageService implements OnApplicationBootstrap {
  private readonly log = new Logger('storage.s3')
  private readonly client: S3Client
  private readonly bucket: string

  constructor(private readonly env: Env) {
    super()
    this.bucket = env.BUCKET_NAME
    this.client = new S3Client({
      region: env.AWS_REGION,
      endpoint: env.AWS_ENDPOINT_URL_S3,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  }

  presignPut(key: string, mime: string, bytes: number): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mime,
      ContentLength: bytes,
      IfNoneMatch: SCAN_PUT_HEADERS['If-None-Match'],
    })
    /* The presigner leaves headers unsigned unless told: unsigned `content-type`
       lets any type land under a WebP key, and unsigned `if-none-match` lets a
       retry drop the condition and overwrite bytes the reader already read. */
    return getSignedUrl(this.client, command, {
      expiresIn: PUT_TTL_SECONDS,
      signableHeaders: new Set(['content-type', 'if-none-match']),
    })
  }

  presignGet(key: string, ttlSeconds = GET_TTL_SECONDS): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key })
    return getSignedUrl(this.client, command, { expiresIn: ttlSeconds })
  }

  async read(key: string): Promise<Buffer> {
    const out = await this.client
      .send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
      .catch((error: unknown) => {
        throw error instanceof NoSuchKey ? new StorageObjectMissingError(key) : error
      })
    if (!out.Body) throw new Error(`storage: empty body for ${key}`)
    return Buffer.from(await out.Body.transformToByteArray())
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  onApplicationBootstrap(): void {
    const origins = this.env.PV_CORS_ORIGINS
    if (origins.length === 0) return
    const rule = {
      AllowedOrigins: origins,
      AllowedMethods: ['PUT', 'GET', 'HEAD'],
      AllowedHeaders: ['Content-Type', ...Object.keys(SCAN_PUT_HEADERS)],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600,
    }
    /* Not awaited: a bucket that refuses the rule must not keep the API from
       serving everything that is not an upload. The warning names the fix. */
    void this.client
      .send(
        new PutBucketCorsCommand({ Bucket: this.bucket, CORSConfiguration: { CORSRules: [rule] } }),
      )
      .then(() => this.log.log(`bucket CORS ensured for ${origins.length} origin(s)`))
      .catch((error: unknown) =>
        this.log.warn(`bucket CORS not set, browser uploads will fail preflight: ${String(error)}`),
      )
  }
}
