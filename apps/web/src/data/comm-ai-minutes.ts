import { useCallback, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { DebriefView } from '@pv/contracts'
import { isApiError, userMessage, type ApiError } from '@/app/api'
import { getLang, message, translate, type Lang } from '@/app/i18n'
import { dmy } from '@/lib/date'
import { COMM_RECORDS_KEY, deleteCommFile, uploadCommFile } from '@/data/comm-record-detail'

/** Saving the AI's minutes as a file on the record: its own press, apart from the
 *  form's boxes. The copy this form saved last is replaced, never doubled. */

/** Already gone is what a replace wanted: the person may have removed it from the list. */
async function dropFile(id: string, fileId: string) {
  try {
    await deleteCommFile(id, fileId)
  } catch (error) {
    if (!isApiError(error) || error.kind !== 'not-found') throw error
  }
}

function minutesFileName(record: DebriefView, lang: Lang): string {
  const day = dmy(record.meeting?.at ?? record.createdAt).replaceAll('/', '-')
  const name = translate(message('Biên bản', 'Minutes', '회의록'), lang)
  return `${name} ${record.subject.code} ${day}.txt`
}

/** `current` is the editable text now, or null while no report is held. */
export function useSaveMinutes(
  record: DebriefView,
  current: string | null,
  onSaved: (text: string) => void,
) {
  const client = useQueryClient()
  const [problem, setProblem] = useState<string | null>(null)
  /* Outside the report: a save of a newer report still replaces the file this form saved. */
  const [savedFile, setSavedFile] = useState<string | null>(null)

  const save = useMutation<string, ApiError, { text: string; replaces: string | null }>({
    mutationFn: async ({ text, replaces }) => {
      const file = new File([text], minutesFileName(record, getLang()), { type: 'text/plain' })
      const fileId = await uploadCommFile(record.id, file, 'text/plain')
      /* New file first, so a failure never leaves the record with none. An old copy
         that will not delete stays in the list, where the person can remove it. */
      if (replaces) await dropFile(record.id, replaces).catch(() => undefined)
      return fileId
    },
    onSuccess: (fileId, { text }) => {
      setSavedFile(fileId)
      onSaved(text)
    },
    onError: (error) =>
      setProblem(
        isApiError(error)
          ? userMessage(error)
          : translate(
              message(
                'Không lưu được biên bản. Thử lại.',
                'Could not save the minutes. Try again.',
                '회의록을 저장하지 못했습니다. 다시 시도해 주세요.',
              ),
            ),
      ),
    onSettled: () => void client.invalidateQueries({ queryKey: COMM_RECORDS_KEY }),
  })

  const saveMinutes = () => {
    if (current === null || save.isPending) return
    const text = current.trim()
    if (text === '')
      return setProblem(
        translate(
          message('Biên bản đang trống.', 'The minutes are empty.', '회의록이 비어 있습니다.'),
        ),
      )
    setProblem(null)
    save.mutate({ text, replaces: savedFile })
  }

  /* Stable: the report hook lists it as a dependency of `land`. */
  const clearProblem = useCallback(() => setProblem(null), [])

  return { saveMinutes, saving: save.isPending, problem, clearProblem }
}
