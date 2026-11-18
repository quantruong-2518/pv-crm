import { queryOptions } from '@tanstack/react-query'
import {
  COMM_CONFIRM_WITHIN_HOURS,
  MY_WORK_SECTION_LABEL,
  MyWorkResponse,
  type MyWorkSection,
} from '@pv/contracts'
import { api } from '@/app/api'
import { message, type Message } from '@/app/i18n'
import { USE_NEED } from './assistant'

/** "Today's work" of the assistant, panel card and page home (ADR 0154): the
 *  asker's own work, read live from `GET /assistant/my-work`.
 *
 *  Never cached across openings and never part of a chat session: the card
 *  must show the work as it stands now, not as the last opening left it. */

export const myWorkQuery = queryOptions({
  queryKey: ['platform', 'assistant', 'my-work'] as const,
  queryFn: ({ signal }) =>
    api.read('/assistant/my-work', { need: USE_NEED, schema: MyWorkResponse, signal }),
  staleTime: 0,
  gcTime: 0,
})

export const BRIEF_COPY = {
  title: message('Việc hôm nay', "Today's work", '오늘 할 일'),
  skipped: message(
    'Không tải được mục này.',
    'This section could not be loaded.',
    '이 항목을 불러오지 못했습니다.',
  ),
  empty: message('Hôm nay không có việc nào.', 'Nothing to do today.', '오늘 할 일이 없습니다.'),
  rest: (n: string) => message(`+ ${n} việc nữa`, `+ ${n} more`, `+ ${n}건 더`),
  askAbout: message('Hỏi về mục này', 'Ask about this', '이 항목 질문하기'),
  written: (time: string) =>
    message(
      `Tóm tắt sáng · viết lúc ${time}`,
      `Morning brief · written at ${time}`,
      `아침 요약 · ${time} 작성`,
    ),
}

/** Vietnamese comes from the contracts ledger the bell and the email also print. */
export const SECTION_LABEL: Record<MyWorkSection, Message> = {
  'next-step': message(MY_WORK_SECTION_LABEL['next-step'], 'Next steps due', '기한이 된 다음 단계'),
  approval: message(MY_WORK_SECTION_LABEL.approval, 'Waiting for your approval', '승인 대기'),
  meeting: message(MY_WORK_SECTION_LABEL.meeting, "Today's meetings", '오늘 미팅'),
  parked: message(
    MY_WORK_SECTION_LABEL.parked,
    'On-hold customers due for contact',
    '연락 시점이 된 보류 고객',
  ),
  'stale-deal': message(
    MY_WORK_SECTION_LABEL['stale-deal'],
    'Opportunities with no recent activity',
    '활동이 없는 영업 기회',
  ),
  'late-debrief': message(
    MY_WORK_SECTION_LABEL['late-debrief'],
    `Contacts unconfirmed for over ${COMM_CONFIRM_WITHIN_HOURS} hours`,
    `${COMM_CONFIRM_WITHIN_HOURS}시간 넘게 확인되지 않은 연락`,
  ),
  'overdue-contract': message(
    MY_WORK_SECTION_LABEL['overdue-contract'],
    'Contracts with overdue payments',
    '결제 기한이 지난 계약',
  ),
}

/** The question a row sends, worded as the user would type it. */
export const SECTION_QUESTION: Record<MyWorkSection, Message> = {
  'next-step': message(
    'Hôm nay tôi có bước tiếp theo nào đến hạn?',
    'Which next steps are due today?',
    '오늘 기한이 된 다음 단계가 무엇인가요?',
  ),
  approval: message(
    'Những yêu cầu nào đang chờ tôi duyệt?',
    'Which requests are waiting for my approval?',
    '내 승인을 기다리는 요청이 무엇인가요?',
  ),
  meeting: message(
    'Hôm nay tôi có cuộc họp nào?',
    'Which meetings do I have today?',
    '오늘 어떤 미팅이 있나요?',
  ),
  parked: message(
    'Khách tạm hoãn nào đã đến hạn liên hệ lại?',
    'Which on-hold customers are due for contact?',
    '다시 연락할 시점이 된 보류 고객이 누구인가요?',
  ),
  'stale-deal': message(
    'Cơ hội nào của tôi lâu chưa có hoạt động?',
    'Which of my opportunities have had no activity for a while?',
    '내 영업 기회 중 한동안 활동이 없는 것은 무엇인가요?',
  ),
  'late-debrief': message(
    'Liên hệ nào của tôi chưa xác nhận?',
    'Which of my contacts are still unconfirmed?',
    '내 연락 중 아직 확인하지 않은 것은 무엇인가요?',
  ),
  'overdue-contract': message(
    'Hợp đồng nào của tôi có đợt thu quá hạn?',
    'Which of my contracts have overdue payments?',
    '결제 기한이 지난 내 계약은 무엇인가요?',
  ),
}
