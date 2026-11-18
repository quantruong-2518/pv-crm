import type { ChainStep, RailObject } from '@pv/ui'
import type { ApprovalKind, ApprovalRequestView, ApprovalState } from '@pv/contracts'
import { message, type Message } from '@/app/i18n'
import { chainPath } from '@/data/opportunities'

/** Pure wording and ordering for the approval inbox — no React, no queries. */

export type ApprovalTab = 'waiting' | 'sent'

/** The kind as a reader says it. Keyed by the contract's enum, so a new kind
 *  fails to compile here instead of printing its wire key. */
export const KIND_LABEL: Record<ApprovalKind, Message> = {
  'config-change': message('Thay đổi cấu hình', 'Settings change', '설정 변경'),
  'contract-sign': message('Ký hợp đồng', 'Contract signing', '계약 체결'),
}

export const STATE_LABEL: Record<ApprovalState, Message> = {
  waiting: message('Chờ duyệt', 'Awaiting approval', '승인 대기'),
  approved: message('Đã duyệt', 'Approved', '승인됨'),
  rejected: message('Đã từ chối', 'Rejected', '거절됨'),
}

export const STATE_TONE = {
  waiting: 'warning',
  approved: 'success',
  rejected: 'danger',
} as const satisfies Record<ApprovalState, 'warning' | 'success' | 'danger'>

/** The deal a `contract-sign` request is about: its first linked object. */
export function signedCodeOf(request: ApprovalRequestView): string | undefined {
  return request.kind === 'contract-sign' ? request.links[0]?.objectCode : undefined
}

/** The one title, for the list row and the detail headline. Parts, not a
 *  string, so the screen can set the code in mono (law 6). */
export function titleOf(request: ApprovalRequestView): { label: Message; code?: string } {
  const code = signedCodeOf(request)
  return code ? { label: KIND_LABEL[request.kind], code } : { label: KIND_LABEL[request.kind] }
}

/** Oldest first: the request that has waited longest is the one to clear. */
export function sortOldestFirst(rows: ApprovalRequestView[]): ApprovalRequestView[] {
  return [...rows].sort((a, b) => a.raisedAt.localeCompare(b.raisedAt))
}

/** The chain as M-03 draws it, led by the requester: `ok` behind, `current` on
 *  the person waited on, `next` ahead. The role rides beside the name because
 *  a reader three links down needs to know why that person is in the chain,
 *  and the waiting step says so in words, not by colour alone (law 16). */
export function chainSteps(
  request: ApprovalRequestView,
  requesterLabel: string,
  waitingLabel: string,
): ChainStep[] {
  return [
    { label: requesterLabel, state: 'ok' },
    ...request.chain.map((link): ChainStep => {
      const who = `${link.person} · ${link.role}`
      return link.state === 'waiting'
        ? { label: `${who} · ${waitingLabel}`, state: 'current' }
        : { label: who, state: link.state === 'approved' ? 'ok' : 'next' }
    }),
  ]
}

/** The objects behind a request as ContextRail chips: the request's own links
 *  first (the first is the azure one), then the lead and contracts of its deal
 *  when the profile was readable. A kind with no screen draws but opens nothing. */
export function railOf(
  request: ApprovalRequestView,
  profile: { leadCode: string; contractCodes: readonly string[] } | undefined,
  go: (path: string) => void,
): RailObject[] {
  const codes = [
    ...request.links.map((link) => link.objectCode),
    ...(profile ? [profile.leadCode, ...profile.contractCodes] : []),
  ]
  return [...new Set(codes)].map((code, i) => {
    const path = chainPath(code.split('-')[0] ?? '', code)
    return {
      code,
      ...(i === 0 ? { source: true } : {}),
      ...(path ? { onOpen: () => go(path) } : {}),
    }
  })
}
