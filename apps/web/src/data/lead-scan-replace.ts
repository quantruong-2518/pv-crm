import { create } from 'zustand'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toastOf } from '@/app/toast'
import { addScanFiles, scanBatchKey, startScanBatch } from './lead-scan'
import { prepareFile, releasePrepWorker, type Picked } from './lead-scan-prep'
import { failureOf, putOnceMore } from './lead-scan-run'

/** Replace-file — one new file stands in for one FAILED file of a started batch.
 *
 *  Same path as step 1, one file wide: prepare → declare (`replaces`) → PUT →
 *  `start` with the new id, retiring the FAILED one only then — a replace that
 *  dies before `start` leaves the old row standing and retryable. A module store for the reason `lead-scan-run.ts`
 *  gives: leaving the page must not drop the upload. The row itself is redrawn
 *  by the batch poll, which runs again once `start` puts the batch back to
 *  READING — so a job ends only after that refetch has landed. */

export type ReplacePhase = 'preparing' | 'uploading' | 'starting'
export type ReplaceJob = { phase: ReplacePhase; progress: number }

/** Keyed by the id of the FAILED file being replaced. */
export const useScanReplaces = create<{ jobs: Record<string, ReplaceJob> }>()(() => ({ jobs: {} }))

const toastWarn = toastOf('warning')
const toastFail = toastOf('danger')

function setJob(id: string, job: ReplaceJob | null) {
  useScanReplaces.setState((s) => {
    const jobs = { ...s.jobs }
    if (job) jobs[id] = job
    else delete jobs[id]
    return { jobs }
  })
}

async function replaceOne(code: string, id: string, picked: Picked) {
  setJob(id, { phase: 'preparing', progress: 0 })
  const prepared = await prepareFile(picked).finally(releasePrepWorker)

  const { files } = await addScanFiles(code, { files: [prepared.declared], replaces: id })
  const slot = files[0]
  if (!slot || 'duplicateOf' in slot) {
    return toastWarn('Tệp này đã có trong lô', 'Chọn một ảnh khác để thay.')
  }

  setJob(id, { phase: 'uploading', progress: 0 })
  await putOnceMore(slot.putUrl, prepared.upload, prepared.declared.mime, (progress) =>
    setJob(id, { phase: 'uploading', progress }),
  ).catch(() => {
    throw new Error('Tải lên không được')
  })
  /* A missing thumbnail costs a grey tile later, not the file. */
  if (slot.thumbPutUrl && prepared.thumb) {
    await putOnceMore(slot.thumbPutUrl, prepared.thumb, 'image/jpeg').catch(() => undefined)
  }

  setJob(id, { phase: 'starting', progress: 1 })
  await startScanBatch(code, [slot.id], [id])
}

async function runReplace(code: string, id: string, picked: Picked, client: QueryClient) {
  try {
    await replaceOne(code, id, picked)
  } catch (error) {
    /* `prepareFile` and the PUT throw ready-made Vietnamese; the API throws `ApiError`. */
    toastFail(`Chưa thay được ${picked.file.name}`, failureOf(error, (error as Error).message))
  } finally {
    await client.invalidateQueries({ queryKey: scanBatchKey(code) })
    setJob(id, null)
  }
}

/** One replace per row: a second pick on a row already working is ignored. */
export function useReplaceScanFile() {
  const client = useQueryClient()
  return (code: string, id: string, picked: Picked) => {
    if (useScanReplaces.getState().jobs[id]) return
    void runReplace(code, id, picked, client)
  }
}
