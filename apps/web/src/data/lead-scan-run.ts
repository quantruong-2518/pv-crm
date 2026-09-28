import { create } from 'zustand'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { isApiError, userMessage } from '@/app/api'
import { toastOf } from '@/app/toast'
import { createScanBatch, scanBatchKey, startScanBatch } from './lead-scan'
import {
  inPool,
  prepareFile,
  releasePrepWorker,
  type Picked,
  type Prepared,
} from './lead-scan-prep'

/** The browser's half of one scan batch: prepare → declare → upload → start.
 *
 *  A MODULE store, not screen state: the route changes from `/scan` to
 *  `/scan/:code` the moment the batch has a code, and a user may walk to the
 *  lead book mid-upload. Both unmount the page; neither may kill the uploads
 *  or lose the row-by-row progress. Closing the TAB still does — only after
 *  `start` does the batch belong to the server alone.
 *
 *  One retry per PUT, three in flight: enough to ride out a blip on hotel
 *  wifi without hammering a storage endpoint that is actually down. */

export type LocalPhase = 'preparing' | 'uploading' | 'uploaded' | 'failed'

export type LocalFile = {
  key: string
  name: string
  pdf: boolean
  phase: LocalPhase
  /** 0–1 of the main upload. */
  progress: number
  id: string | null
  error: string | null
}

export type ScanRun = {
  code: string | null
  files: LocalFile[]
  /** `start` accepted — the server owns the batch from here on. */
  started: boolean
  failure: string | null
}

export const useScanRun = create<{ run: ScanRun | null }>()(() => ({ run: null }))

/** True while the browser still has work to do for the run. */
export const inFlight = (run: ScanRun | null): run is ScanRun =>
  run !== null && !run.started && run.failure === null

const PREP_LANES = 3
const UPLOAD_LANES = 3

const toastWarn = toastOf('warning')
const toastFail = toastOf('danger')

function patchRun(patch: Partial<ScanRun>) {
  useScanRun.setState((s) => (s.run ? { run: { ...s.run, ...patch } } : s))
}

function patchFile(key: string, patch: Partial<LocalFile>) {
  useScanRun.setState((s) =>
    s.run
      ? {
          run: {
            ...s.run,
            files: s.run.files.map((f) => (f.key === key ? { ...f, ...patch } : f)),
          },
        }
      : s,
  )
}

function dropFiles(keys: ReadonlySet<string>) {
  useScanRun.setState((s) =>
    s.run ? { run: { ...s.run, files: s.run.files.filter((f) => !keys.has(f.key)) } } : s,
  )
}

function put(url: string, blob: Blob, mime: string, onProgress?: (f: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', mime)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status)))
    xhr.onerror = () => reject(new Error('network'))
    xhr.send(blob)
  })
}

async function putOnceMore(
  url: string,
  blob: Blob,
  mime: string,
  onProgress?: (f: number) => void,
) {
  try {
    await put(url, blob, mime, onProgress)
  } catch {
    onProgress?.(0)
    await put(url, blob, mime, onProgress)
  }
}

const failureOf = (error: unknown, fallback: string) =>
  isApiError(error) ? userMessage(error) : fallback

type Ready = { key: string; prepared: Prepared }

/** Prepares every picked file; drops repeats of the same bytes inside the pick. */
async function prepareAll(picked: Picked[], keys: string[]): Promise<Ready[]> {
  const prepared = await inPool(picked, PREP_LANES, async (item, i) => {
    const key = keys[i] as string
    try {
      return { key, prepared: await prepareFile(item) }
    } catch (error) {
      patchFile(key, { phase: 'failed', error: (error as Error).message })
      return null
    }
  })
  releasePrepWorker()

  const seen = new Set<string>()
  const repeats = new Set<string>()
  const ready = prepared.filter((r): r is Ready => {
    if (!r) return false
    const sha = r.prepared.declared.sha256
    if (seen.has(sha)) {
      repeats.add(r.key)
      return false
    }
    seen.add(sha)
    return true
  })
  if (repeats.size > 0) {
    dropFiles(repeats)
    toastWarn(`Bỏ ${repeats.size} tệp trùng`, 'Cùng một tệp được chọn hơn một lần.')
  }
  return ready
}

async function upload(ready: Ready[], slots: Awaited<ReturnType<typeof createScanBatch>>['files']) {
  const repeats = new Set<string>()
  const jobs = ready.flatMap((r, i) => {
    const slot = slots[i]
    if (!slot || 'duplicateOf' in slot) {
      repeats.add(r.key)
      return []
    }
    return [{ ...r, slot }]
  })
  if (repeats.size > 0) {
    dropFiles(repeats)
    toastWarn(`Bỏ ${repeats.size} tệp trùng`, 'Máy chủ đã có đúng tệp này trong lô.')
  }

  const ids = await inPool(jobs, UPLOAD_LANES, async ({ key, prepared, slot }) => {
    patchFile(key, { phase: 'uploading', id: slot.id })
    try {
      await putOnceMore(slot.putUrl, prepared.upload, prepared.declared.mime, (progress) =>
        patchFile(key, { progress }),
      )
      /* A missing thumbnail costs a grey tile later, not the file. */
      if (slot.thumbPutUrl && prepared.thumb) {
        await putOnceMore(slot.thumbPutUrl, prepared.thumb, 'image/jpeg').catch(() => undefined)
      }
      patchFile(key, { phase: 'uploaded', progress: 1 })
      return slot.id
    } catch {
      patchFile(key, { phase: 'failed', error: 'Tải lên không được' })
      return null
    }
  })
  return ids.filter((id): id is string => id !== null)
}

async function runScan(
  picked: Picked[],
  keys: string[],
  campaignCode: string | undefined,
  client: QueryClient,
) {
  const ready = await prepareAll(picked, keys)
  if (ready.length === 0) return patchRun({ failure: 'Không tệp nào chuẩn bị được.' })

  let created: Awaited<ReturnType<typeof createScanBatch>>
  try {
    created = await createScanBatch({ campaignCode, files: ready.map((r) => r.prepared.declared) })
  } catch (error) {
    return patchRun({ failure: failureOf(error, 'Không mở được lô mới.') })
  }
  patchRun({ code: created.code })

  const ids = await upload(ready, created.files)
  if (ids.length === 0) return patchRun({ failure: 'Không tệp nào tải lên được.' })
  try {
    await startScanBatch(created.code, ids)
    patchRun({ started: true })
    void client.invalidateQueries({ queryKey: scanBatchKey(created.code) })
  } catch (error) {
    patchRun({ failure: failureOf(error, 'Không bắt đầu đọc được lô này.') })
  }
}

/** Starts a run and returns at once; the store carries its progress. */
export function useBeginScan() {
  const client = useQueryClient()
  return (picked: Picked[], campaignCode: string | undefined) => {
    const keys = picked.map((_, i) => `f${i}`)
    useScanRun.setState({
      run: {
        code: null,
        started: false,
        failure: null,
        files: picked.map((p, i) => ({
          key: keys[i] as string,
          name: p.file.name,
          pdf: p.mime === 'application/pdf',
          phase: 'preparing',
          progress: 0,
          id: null,
          error: null,
        })),
      },
    })
    runScan(picked, keys, campaignCode, client).catch((error: unknown) => {
      patchRun({ failure: failureOf(error, 'Lô này dừng giữa chừng.') })
      toastFail('Lô này dừng giữa chừng')
    })
  }
}
