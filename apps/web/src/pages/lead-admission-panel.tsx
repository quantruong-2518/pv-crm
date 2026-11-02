import { useEffect, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, CircleAlert, Icon } from '@pv/ui'
import {
  type AdmissionCandidate,
  type AdmissionLeadChoice,
  type AdmissionMatch,
  type AdmissionMatchKey,
} from '@pv/contracts'
import type { AdmissionAction, AdmissionPanel } from '@/data/lead-admission'
import { message, translate, useI18n, type Lang } from '@/app/i18n'

/** Module 2 · what the admission gate found, and the choices that verdict
 *  allows — drawn INSIDE the form card, on its surface, with no ground of its
 *  own (law 12) and no tint, so the text keeps the card's own contrast.
 *
 *  Nobody holds a company, only a lead: every reader is told which lead matched
 *  and who holds it, and anyone may open a new lead on the same company. A lead
 *  the reader cannot open (`outOfScope`) keeps its code and owner and loses only
 *  its buttons. A company with several open leads lists them, one row each. */

const leadPath = (code: string) => `/sales/leads/${code}`
const accountPath = (code: string) => `/sales/accounts/${code}`

const say = (lang: Lang, vi: string, en: string, ko: string) => translate(message(vi, en, ko), lang)

const VERDICT = {
  'new-account': message('Công ty mới', 'New company', '새 회사'),
  'same-lead': message('Đã có trong sổ', 'Already in the list', '이미 등록됨'),
  'new-contact': message(
    'Người liên hệ mới của lead đang mở',
    'New contact for an open lead',
    '진행 중인 리드의 새 연락처',
  ),
  'returning-account': message('Khách cũ quay lại', 'Returning customer', '기존 고객 재방문'),
  'needs-review': message('Cần kiểm tra trùng', 'Review possible match', '중복 여부 확인 필요'),
} as const

const MATCH_KEY: Record<AdmissionMatchKey, ReturnType<typeof message>> = {
  'tax-code': message('Mã số thuế', 'Tax ID', '세금번호'),
  email: message('Email', 'Email', '이메일'),
  phone: message('Số điện thoại', 'Phone', '전화번호'),
  'company-name': message('Tên công ty', 'Company name', '회사 이름'),
  'email-domain': message('Tên miền email', 'Email domain', '이메일 도메인'),
  'person-name': message('Tên người liên hệ', 'Contact name', '연락처 담당자 이름'),
}

/** Empty when an API older than this build sent no owner at all: silence, not
 *  a false "nobody holds it". */
const ownerText = (ownerName: string | null | undefined, lead: string, lang: Lang) =>
  ownerName === undefined
    ? ''
    : lead +
      (ownerName === null
        ? say(lang, 'chưa có người phụ trách', 'unassigned', '담당자 없음')
        : say(lang, `do ${ownerName} phụ trách`, `owned by ${ownerName}`, `${ownerName} 담당`))

const keysText = (keys: readonly AdmissionMatchKey[], lang: Lang) =>
  keys.map((key) => translate(MATCH_KEY[key], lang)).join(' · ')

function Code({ children }: { children: string }) {
  return <span className="font-mono">{children}</span>
}

const companyText = (account: AdmissionMatch['account'], lang: Lang) =>
  account
    ? `${account.name} (${account.code})`
    : say(lang, 'Công ty này', 'This company', '이 회사')

const noAccess = (lang: Lang) =>
  say(
    lang,
    'Bạn không có quyền mở lead này.',
    'You cannot open this lead.',
    '이 리드를 열 권한이 없습니다.',
  )

type Choice = { label: ReactNode; primary?: boolean; run: () => void }

export function LeadAdmissionPanel({
  panel,
  pending,
  onChoose,
}: {
  panel: AdmissionPanel
  pending: boolean
  onChoose: (action: AdmissionAction, leadCode?: string) => void
}) {
  const { lang } = useI18n()
  const { match, bookChanged } = panel
  const navigate = useNavigate()
  /* The submit button sits in the sticky bar, far below the card: without
     this the press would look like it did nothing. */
  const box = useRef<HTMLDivElement>(null)
  /* Centred, not nearest: the sticky bar would cover the panel's buttons. */
  useEffect(() => box.current?.scrollIntoView({ block: 'center' }), [match])
  const open = (code: string) => navigate(leadPath(code))

  const { said, rows, choices } = verdictOf(match, { open, choose: onChoose }, lang)

  return (
    <div ref={box} className="flex flex-col gap-3">
      {/* The live region holds the words only: buttons inside it are re-read. */}
      <div role="status" className="flex flex-col gap-3">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <Icon icon={CircleAlert} size={16} className="text-warning shrink-0" />
          {translate(VERDICT[match.verdict], lang)}
        </span>

        {bookChanged && (
          <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.5]">
            {say(
              lang,
              'Sổ vừa thay đổi. Đây là kết quả mới.',
              'The list changed. Review this updated result.',
              '목록이 변경되었습니다. 새 결과를 확인하세요.',
            )}
          </p>
        )}

        <p className="m-0 max-w-[640px] text-[12.5px] leading-[1.6]">{said}</p>

        {match.matchedOn.length > 0 && (
          <p className="text-muted-foreground m-0 text-[12.5px] leading-[1.5]">
            {say(lang, 'Trùng theo', 'Matched on', '일치 항목')}: {keysText(match.matchedOn, lang)}
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

      {rows.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {rows.map((lead, i) => (
            <LeadRow
              key={lead.code}
              lead={lead}
              primary={i === rows.findIndex((row) => !row.outOfScope)}
              pending={pending}
              onOpen={open}
              onJoin={(code) => onChoose('add-contact', code)}
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

/** Every open lead the entry may join, matched one first. An API older than
 *  this build sends no list, so the single matched lead stands in for it. */
function leadsOf(match: AdmissionMatch): AdmissionLeadChoice[] {
  if (match.leads.length > 0) return match.leads
  const { lead, outOfScope, newPeople } = match
  return lead?.code ? [{ code: lead.code, ownerName: lead.ownerName, outOfScope, newPeople }] : []
}

/** Joining a lead that already holds the person adds nobody: it is a merge. */
const joinLabel = (lead: AdmissionLeadChoice, lang: Lang) =>
  lead.newPeople === 0
    ? say(lang, 'Gộp vào lead', 'Merge into lead', '리드에 병합')
    : say(lang, 'Thêm vào lead', 'Add to lead', '리드에 추가')

/** The sentence and the buttons of one verdict. Several open leads go out as
 *  `rows`, each with its own buttons. */
function verdictOf(
  match: AdmissionMatch,
  act: { open: (code: string) => void; choose: (action: AdmissionAction, code?: string) => void },
  lang: Lang,
): { said: ReactNode; rows: AdmissionLeadChoice[]; choices: Choice[] } {
  const createLead = (label: string, primary = false): Choice => ({
    label,
    primary,
    run: () => act.choose('create-lead'),
  })

  switch (match.verdict) {
    case 'same-lead':
    case 'new-contact': {
      const known = match.verdict === 'same-lead'
      const leads = leadsOf(match)
      const held = leads.every((lead) => lead.outOfScope)
      const [only] = leads
      const company = companyText(match.account, lang)
      const create = say(
        lang,
        'Tạo lead mới cho công ty này',
        'Create a new lead for this company',
        '이 회사의 새 리드 만들기',
      )
      if (leads.length !== 1 || !only) {
        const said =
          leads.length <= 1
            ? say(
                lang,
                `${company} đã có lead đang mở trong sổ.`,
                `${company} already has an open lead.`,
                `${company}에 진행 중인 리드가 있습니다.`,
              )
            : held
              ? say(
                  lang,
                  `${company} có nhiều lead đang mở. Bạn không có quyền mở các lead đó.`,
                  `${company} has multiple open leads. You cannot open them.`,
                  `${company}에 진행 중인 리드가 여러 개 있지만 열 권한이 없습니다.`,
                )
              : say(
                  lang,
                  `${company} có nhiều lead đang mở. Chọn một lead hoặc tạo lead mới.`,
                  `${company} has multiple open leads. Choose one or create a new lead.`,
                  `${company}에 진행 중인 리드가 여러 개 있습니다. 하나를 선택하거나 새 리드를 만드세요.`,
                )
        return {
          said: known
            ? `${say(lang, 'Khách này đã có trong sổ.', 'This customer is already in the list.', '이 고객은 이미 등록되어 있습니다.')} ${said}`
            : said,
          rows: leads,
          choices: [createLead(create, held)],
        }
      }
      const { code } = only
      const owner = ownerText(only.ownerName, ', ', lang)
      const access = only.outOfScope ? ` ${noAccess(lang)}` : ''
      return {
        said: known
          ? say(
              lang,
              `Khách này đã có trong sổ ở lead ${code}${owner}.${access}`,
              `This customer already has lead ${code}${owner}.${access}`,
              `이 고객은 이미 리드 ${code}에 등록되어 있습니다${owner}.${access}`,
            )
          : say(
              lang,
              `${company} có lead đang mở ${code}${owner}. Người liên hệ này chưa có trong lead đó.${access}`,
              `${company} has open lead ${code}${owner}. This contact is not on that lead yet.${access}`,
              `${company}에 진행 중인 리드 ${code}이(가) 있습니다${owner}. 이 연락처는 아직 해당 리드에 없습니다.${access}`,
            ),
        rows: [],
        choices: [
          ...(only.outOfScope
            ? []
            : [
                {
                  label: (
                    <>
                      {joinLabel(only, lang)} <Code>{code}</Code>
                    </>
                  ),
                  primary: true,
                  run: () => act.choose('add-contact', code),
                },
                { label: <OpenLead code={code} />, run: () => act.open(code) },
              ]),
          createLead(create, held),
        ],
      }
    }
    case 'returning-account':
      return {
        said: say(
          lang,
          `${companyText(match.account, lang)} đã có trong sổ, hiện không có lead đang mở. Lead mới sẽ gắn vào công ty này.`,
          `${companyText(match.account, lang)} is already in the list with no open leads. The new lead will link to this company.`,
          `${companyText(match.account, lang)}은(는) 이미 등록되어 있지만 진행 중인 리드가 없습니다. 새 리드는 이 회사에 연결됩니다.`,
        ),
        rows: [],
        choices: [
          createLead(
            say(
              lang,
              'Tạo lead mới cho công ty này',
              'Create a new lead for this company',
              '이 회사의 새 리드 만들기',
            ),
            true,
          ),
        ],
      }
    case 'needs-review':
      return {
        said: say(
          lang,
          'Có hồ sơ gần giống thông tin vừa nhập. Xem lại trước khi tạo.',
          'A similar record exists. Review it before creating a lead.',
          '입력한 정보와 비슷한 기록이 있습니다. 리드를 만들기 전에 확인하세요.',
        ),
        rows: [],
        choices: [
          createLead(
            say(lang, 'Vẫn tạo lead mới', 'Create new lead anyway', '그래도 새 리드 만들기'),
          ),
        ],
      }
    case 'new-account':
      return { said: null, rows: [], choices: [] }
  }
}

function OpenLead({ code }: { code: string }) {
  const { lang } = useI18n()
  return (
    <>
      {say(lang, 'Mở lead', 'Open lead', '리드 열기')} <Code>{code}</Code>
    </>
  )
}

/** One open lead of the matched company: who holds it, whether the person is
 *  already on it, and — for a lead the reader can open — joining or opening it. */
function LeadRow({
  lead,
  primary,
  pending,
  onOpen,
  onJoin,
}: {
  lead: AdmissionLeadChoice
  primary: boolean
  pending: boolean
  onOpen: (code: string) => void
  onJoin: (code: string) => void
}) {
  const { lang } = useI18n()
  const { code, ownerName, outOfScope, newPeople } = lead

  return (
    <li className="flex flex-wrap items-center justify-between gap-3">
      <span className="flex min-w-0 flex-col gap-1 text-[12.5px] leading-[1.5]">
        <span className="font-semibold">
          Lead <Code>{code}</Code>
          {ownerText(ownerName, ' · ', lang)}
        </span>
        <span className="text-muted-foreground">
          {newPeople === 0
            ? say(
                lang,
                'Người liên hệ này đã có trong lead.',
                'This contact is already on the lead.',
                '이 연락처는 이미 리드에 있습니다.',
              )
            : say(
                lang,
                'Người liên hệ này chưa có trong lead.',
                'This contact is not on the lead yet.',
                '이 연락처는 아직 리드에 없습니다.',
              )}
          {outOfScope && ` ${noAccess(lang)}`}
        </span>
      </span>

      {!outOfScope && (
        <span className="flex flex-wrap items-center gap-2">
          <Button
            size="md"
            variant={primary ? 'default' : 'ghost'}
            className="pointer-coarse:h-12"
            disabled={pending}
            onClick={() => onJoin(code)}
          >
            {joinLabel(lead, lang)}
          </Button>
          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12"
            disabled={pending}
            onClick={() => onOpen(code)}
          >
            {say(lang, 'Mở lead', 'Open lead', '리드 열기')}
          </Button>
        </span>
      )}
    </li>
  )
}

/** One possible match. Its company, lead and owner are shown to every reader;
 *  a candidate the reader cannot open only loses its button. */
function CandidateRow({
  candidate,
  onOpen,
}: {
  candidate: AdmissionCandidate
  onOpen: (path: string) => void
}) {
  const { lang } = useI18n()
  const { account, lead, outOfScope, matchedOn } = candidate
  const leadCode = lead?.code

  return (
    <li className="flex flex-wrap items-center justify-between gap-3">
      <span className="flex min-w-0 flex-col gap-1 text-[12.5px] leading-[1.5]">
        <span className="font-semibold">
          {account && (
            <>
              {account.name} · <Code>{account.code}</Code>
            </>
          )}
          {lead && (
            <>
              {account ? ' · lead' : 'Lead'}
              {leadCode && (
                <>
                  {' '}
                  <Code>{leadCode}</Code>
                </>
              )}
              {ownerText(lead.ownerName, ' · ', lang)}
            </>
          )}
        </span>
        {matchedOn.length > 0 && (
          <span className="text-muted-foreground">
            {say(lang, 'Trùng theo', 'Matched on', '일치 항목')}: {keysText(matchedOn, lang)}
          </span>
        )}
        {outOfScope && (
          <span className="text-muted-foreground">
            {say(
              lang,
              'Bạn không có quyền mở hồ sơ này.',
              'You cannot open this record.',
              '이 기록을 열 권한이 없습니다.',
            )}
          </span>
        )}
      </span>

      {!outOfScope &&
        (leadCode ? (
          <Button
            size="md"
            variant="ghost"
            className="pointer-coarse:h-12"
            onClick={() => onOpen(leadPath(leadCode))}
          >
            <OpenLead code={leadCode} />
          </Button>
        ) : (
          account && (
            <Button
              size="md"
              variant="ghost"
              className="pointer-coarse:h-12"
              onClick={() => onOpen(accountPath(account.code))}
            >
              {say(lang, 'Mở công ty', 'Open company', '회사 열기')} <Code>{account.code}</Code>
            </Button>
          )
        ))}
    </li>
  )
}
