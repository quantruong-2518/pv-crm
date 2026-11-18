import { COMM_AI_JOB_STEPS, type CommAiJobStepKey } from '@pv/contracts'
import { message, type Message } from '@/app/i18n'

/** The steps of a comm report job, named once for the form and the AI tray. */

export const COMM_AI_STEP_LABEL: Record<CommAiJobStepKey, Message> = {
  'read-sources': message('Đọc ghi chú và tệp', 'Read the notes and files', '메모와 파일 읽기'),
  listen: message('Nghe ghi âm', 'Listen to the recording', '녹음 듣기'),
  write: message('Viết tóm tắt và biên bản', 'Write the summary and minutes', '요약과 회의록 작성'),
}

export const COMM_AI_STEP_TOTAL = COMM_AI_JOB_STEPS.length

/** `finished` counts done steps, so the one running is the next. A queued job
 *  has run nothing yet and says so instead of naming step 1. */
export function commAiStepLine(finished: number, queued: boolean): Message {
  if (queued) return message('Đang chờ tới lượt', 'Waiting for its turn', '순서를 기다리는 중')
  const at = Math.min(finished + 1, COMM_AI_STEP_TOTAL)
  const label = COMM_AI_STEP_LABEL[COMM_AI_JOB_STEPS[at - 1] ?? 'write']
  const total = COMM_AI_STEP_TOTAL
  return message(
    `${label.vi} · bước ${at}/${total}`,
    `${label.en} · step ${at}/${total}`,
    `${label.ko} · ${at}/${total}단계`,
  )
}
