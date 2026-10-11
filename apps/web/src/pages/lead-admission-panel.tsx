import { useEffect, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, CircleAlert, Icon } from '@pv/ui'
import {
  ADMISSION_MATCH_KEY_LABEL,
  ADMISSION_VERDICT_LABEL,
  type AdmissionCandidate,
  type AdmissionMatch,
  type AdmissionMatchKey,
} from '@pv/contracts'
import { useCan } from '@/app/auth'
import type { AdmissionAction, AdmissionPanel } from '@/data/lead-admission'

/** Module 2 · what the admission gate found, and the choices that verdict
 *  allows — drawn INSIDE the form card, on its surface, with no ground of its
 *  own (law 12) and no tint, so the text keeps the card's own contrast.
 *
 *  A lead in someone else's book arrives without its code or its company. The
 *  panel then says only that the customer is taken and who to ask: no link, no
 *  name. Creating anyway is offered to a `lead.assign` holder alone — the one
 *  caller the server does not answer 403 to. */

const leadPath = (code: string) => `/sales/leads/${code}`
const accountPath = (code: string) => `/sales/accounts/${code}`

const HELD_ELSEWHERE = 'Liên hệ trưởng phòng để được giao.'
/** The bar's submit is shut while a panel is up; this is the other way out. */
const EDIT_TO_RECHECK = 'Sửa thông tin để kiểm tra lại.'

const keysText = (keys: readonly AdmissionMatchKey[]) =>
  keys.map((key) => ADMISSION_MATCH_KEY_LABEL[key]).join(' · ')

function Code({ children }: { children: string }) {
  return <span className="font-mono">{children}</span>
}

/** Name and code of the company — a plain noun when the gate named none. */
function Company({ account }: { account: AdmissionMatch['account'] }) {
  if (!account) return <>Công ty này</>
  return (
    <>
      Công ty <span className="font-semibold">{account.name}</span> (<Code>{account.code}</Code>)
    </>
  )
}

type Choice = { label: ReactNode; primary?: boolean; run: () => void }

export function LeadAdmissionPanel({
  panel,
  pending,
  onChoose,
}: {
  panel: AdmissionPanel
  pending: boolean
  onChoose: (action: AdmissionAction) => void
}) {
  const { match, bookChanged } = panel
  const navigate = useNavigate()
  /* The submit button sits in the sticky bar, far below the card: without
     this the press would look like it did nothing. */
  const box = useRef<HTMLDivElement>(null)
  /* Centred, not nearest: the sticky bar would cover the panel's buttons. */
  useEffect(() => box.current?.scrollIntoView({ block: 'center' }), [match])
  const canAssign = useCan('lead.assign')

  const { said, held, choices } = verdictOf(match, canAssign, {
    open: (code) => navigate(leadPath(code)),
    choose: onChoose,
  })

  return (
    <div ref={box} className="flex flex-col gap-3">
      {/* The live region holds the words only: buttons inside it are re-read. */}
      <div role="status" className="flex flex-col gap-3">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <Icon icon={CircleAlert} size={16} className="text-warning shrink-0" />
          {ADMISSION_VERDICT_LABEL[match.verdict]}
        </span>

        {bookChanged && (
          <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.5]">
            Sổ vừa thay đổi sau lần kiểm tra trước. Dưới đây là kết quả mới.
          </p>
        )}

        <p className="m-0 max-w-[640px] text-[12.5px] leading-[1.6]">{said}</p>

        {held && (
          <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.5]">{EDIT_TO_RECHECK}</p>
        )}

        {match.matchedOn.length > 0 && (
          <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.5]">
            Trùng theo: {keysText(match.matchedOn)}
          </p>
        )}
      </div>

      {match.verdict === 'needs-review' && match.candidates.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {match.candidates.map((candidate, i) => (
            <CandidateRow
              key={candidate.lead?.code ?? candidate.account?.code ?? i}
              candidate={candidate}
              onOpen={navigate}
            />
          ))}
        </ul>
      )}

      {choices.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {choices.map((choice, i) => (
            <Button
              key={i}
              size="md"
              variant={choice.primary ? 'default' : 'ghost'}
              className="pointer-coarse:h-12"
              disabled={pending}
              onClick={choice.run}
            >
              {choice.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}

/** The sentence and the buttons of one verdict. A lead the reader cannot see
 *  (`outOfScope`, or no code) is `held`: the sentence, and creating anyway only
 *  for a caller who may assign leads. */
function verdictOf(
  match: AdmissionMatch,
  canAssign: boolean,
  act: { open: (code: string) => void; choose: (action: AdmissionAction) => void },
): { said: ReactNode; held?: boolean; choices: Choice[] } {
  const code = match.lead?.code
  const createLead = (label: string, primary = false): Choice => ({
    label,
    primary,
    run: () => act.choose('create-lead'),
  })

  const heldChoices = canAssign ? [createLead('Vẫn tạo lead mới')] : []

  switch (match.verdict) {
    case 'same-lead':
      if (code === undefined || match.outOfScope) {
        return {
          said: `Khách này đã có trong sổ và đang do người khác phụ trách. ${HELD_ELSEWHERE}`,
          held: true,
          choices: heldChoices,
        }
      }
      return {
        said: (
          <>
            Khách này đã có trong sổ, ở lead <Code>{code}</Code>.
          </>
        ),
        choices: [
          { label: <OpenLead code={code} />, primary: true, run: () => act.open(code) },
          createLead('Vẫn tạo lead mới cho công ty này'),
        ],
      }
    case 'new-contact':
      if (code === undefined || match.outOfScope) {
        return {
          said: `Công ty này đã có lead đang mở trong sổ, do người khác phụ trách. ${HELD_ELSEWHERE}`,
          held: true,
          choices: heldChoices,
        }
      }
      return {
        said: (
          <>
            <Company account={match.account} /> có lead đang mở <Code>{code}</Code>, và người liên
            hệ này chưa có trong lead đó.
          </>
        ),
        choices: [
          {
            label: (
              <>
                Thêm vào lead <Code>{code}</Code>
              </>
            ),
            primary: true,
            run: () => act.choose('add-contact'),
          },
          createLead('Tạo lead riêng cho công ty này'),
        ],
      }
    case 'returning-account':
      return {
        said: (
          <>
            <Company account={match.account} /> đã có trong sổ và hiện không có lead nào đang mở.
            Lead mới sẽ gắn vào công ty này.
          </>
        ),
        choices: [createLead('Tạo lead mới cho công ty này', true)],
      }
    case 'needs-review':
      return {
        said: 'Chưa chắc đây là khách mới: trong sổ có hồ sơ gần giống thông tin vừa nhập. Xem lại trước khi tạo.',
        choices: [createLead('Vẫn tạo lead mới')],
      }
    case 'new-account':
      return { said: null, choices: [] }
  }
}

function OpenLead({ code }: { code: string }) {
  return (
    <>
      Mở lead <Code>{code}</Code>
    </>
  )
}

/** One possible match. A candidate in someone else's book is one neutral line:
 *  no company, no code, no button — and never a name taken from elsewhere. */
function CandidateRow({
  candidate,
  onOpen,
}: {
  candidate: AdmissionCandidate
  onOpen: (path: string) => void
}) {
  const { account, lead, outOfScope, matchedOn } = candidate
  const leadCode = outOfScope ? undefined : lead?.code
  const shown = outOfScope ? null : account
  const hidden = shown === null && leadCode === undefined

  return (
    <li className="flex flex-wrap items-center justify-between gap-3">
      <span className="flex min-w-0 flex-col gap-1 text-[12.5px] leading-[1.5]">
        <span className="font-semibold">
          {hidden && 'Một hồ sơ trong sổ, do người khác phụ trách'}
          {shown && (
            <>
              {shown.name} · <Code>{shown.code}</Code>
            </>
          )}
          {leadCode && (
            <>
              {shown ? ' · lead ' : 'Lead '}
              <Code>{leadCode}</Code>
            </>
          )}
        </span>
        {matchedOn.length > 0 && (
          <span className="text-muted-foreground">Trùng theo: {keysText(matchedOn)}</span>
        )}
      </span>

      {leadCode ? (
        <Button
          size="md"
          variant="ghost"
          className="pointer-coarse:h-12"
          onClick={() => onOpen(leadPath(leadCode))}
        >
          <OpenLead code={leadCode} />
        </Button>
      ) : (
        shown && (
          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12"
            onClick={() => onOpen(accountPath(shown.code))}
          >
            Mở công ty <Code>{shown.code}</Code>
          </Button>
        )
      )}
    </li>
  )
}
