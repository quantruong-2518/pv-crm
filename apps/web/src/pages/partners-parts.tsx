import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Combobox, Eye, EyeOff, Icon, Input, Modal, SectionTitle } from '@pv/ui'
import { isApiError, userMessage, type ApiError } from '@/app/api'
import { toastDone } from '@/app/toast'
import { PARTNER_NAME_MAX, type PartnerPatch, type PartnerRow as Partner } from '@pv/contracts'
import { contactBookQuery, DEFAULT_CONTACT_BOOK_QUERY } from '@/data/contacts'
import { useCreatePartner, usePatchPartner } from '@/data/partners'
import { useReferrerMotions } from '@/data/sales-motions'
import { OriginSelect } from '@/components/lead-origin-pickers'
import { searchableText } from '@/lib/search-box'
import { message, useI18n } from '@/app/i18n'

/** The two modals of the partner book (`pages/partners.tsx`).
 *
 *  One edit modal per partner, like the origin catalog: rename, re-file and
 *  hide act on the same row. Every write answers with the list re-read —
 *  nothing is painted ahead of the server. */

const failed = (error: ApiError | null) => (isApiError(error) ? userMessage(error) : undefined)

type Pick = { kind: 'contact'; code: string; name: string } | { kind: 'name'; name: string }

/** A partner is a contact we already know; typing a name nobody has is the fallback. */
function WhoField({ value, onChange }: { value: Pick | null; onChange: (p: Pick) => void }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const search = searchableText(query)
  const { data, isFetching } = useQuery({
    ...contactBookQuery({ ...DEFAULT_CONTACT_BOOK_QUERY, size: 8, q: search }),
    enabled: search !== undefined,
  })
  const options = (data?.rows ?? []).map((c) => ({
    value: c.code,
    label: c.name,
    hint: c.accountName ?? c.company,
  }))
  return (
    <Combobox
      label={t(message('Người liên hệ', 'Contact', '연락처'))}
      value={value?.kind === 'contact' ? value.code : ''}
      valueLabel={value?.name}
      query={query}
      onQueryChange={setQuery}
      options={options}
      loading={isFetching}
      placeholder={t(message('Tìm trong sổ Người liên hệ…', 'Search contacts…', '연락처 검색…'))}
      emptyText={t(
        message(
          'Gõ tên, email hoặc số điện thoại để tìm.',
          'Search by name, email, or phone.',
          '이름, 이메일 또는 전화번호로 검색하세요.',
        ),
      )}
      onSelect={(o) => onChange({ kind: 'contact', code: o.value, name: o.label })}
      createLabel={(q) =>
        t(
          message(
            `Thêm "${q}" làm đối tác mới`,
            `Add "${q}" as a new partner`,
            `"${q}"을(를) 새 파트너로 추가`,
          ),
        )
      }
      onCreate={(q) => onChange({ kind: 'name', name: q.trim() })}
    />
  )
}

/** The `REF` code is minted by the server — the modal asks who and which kind. */
export function AddPartnerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const [who, setWho] = useState<Pick | null>(null)
  const [originId, setOriginId] = useState('')
  const create = useCreatePartner()

  const canSave = who !== null && originId !== '' && !create.isPending
  const submit = () =>
    who &&
    create.mutate(
      {
        name: who.name,
        originId,
        ...(who.kind === 'contact' ? { contactCode: who.code } : {}),
      },
      {
        onSuccess: (partner) => {
          toastDone(
            t(
              message(
                `Đã thêm ${partner.ref} · ${partner.name}`,
                `Added ${partner.ref} · ${partner.name}`,
                `${partner.ref} · ${partner.name} 추가됨`,
              ),
            ),
          )
          onClose()
        },
      },
    )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(message('Thêm đối tác', 'Add partner', '파트너 추가'))}
      subtitle={t(
        message(
          'Chọn người trong sổ liên hệ. Mã đối tác được cấp tự động.',
          'Choose a contact from the directory. A partner code is assigned automatically.',
          '연락처 목록에서 선택하세요. 파트너 코드는 자동으로 발급됩니다.',
        ),
      )}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {failed(create.error) && (
            <span role="alert" className="text-destructive-foreground mr-auto text-[11.5px]">
              {failed(create.error)}
            </span>
          )}
          <Button size="lg" variant="ghost" onClick={onClose}>
            {t(message('Huỷ', 'Cancel', '취소'))}
          </Button>
          <Button size="lg" disabled={!canSave} onClick={submit}>
            {t(message('Thêm đối tác', 'Add partner', '파트너 추가'))}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <WhoField value={who} onChange={setWho} />
        <KindField value={originId} onChange={setOriginId} />
      </div>
    </Modal>
  )
}

/** Kinds are origins filed under the motions whose live `asks` is `REFERRER`. */
function KindField({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t } = useI18n()
  const motions = useReferrerMotions()
  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-[11px]">
        {t(
          message(
            'Loại (nguồn của lead được giới thiệu)',
            'Type (source for referred leads)',
            '유형 (추천 리드 출처)',
          ),
        )}
      </span>
      <OriginSelect
        label={t(message('Loại', 'Type', '유형'))}
        hideLabel
        value={value}
        onChange={onChange}
        motions={motions ?? []}
        emptyLabel={t(message('— chọn loại —', '— select a type —', '— 유형 선택 —'))}
      />
      <span className="text-muted-foreground text-[11px] leading-[1.5]">
        {t(
          message(
            'Thiếu loại thì thêm nguồn thuộc phương án hỏi mã giới thiệu ở trang Nguồn lead.',
            'If a type is missing, add a source under the motion that asks for a referral code in Lead Sources.',
            '유형이 없으면 리드 출처에서 추천 코드를 묻는 방식에 해당 출처를 추가하세요.',
          ),
        )}
      </span>
    </div>
  )
}

/** Rename · re-file · hide/show. `Modal` keeps the last body through its exit,
 *  so `null` simply closes it. */
export function EditPartnerModal({
  partner,
  onClose,
}: {
  partner: Partner | null
  onClose: () => void
}) {
  const { t } = useI18n()
  return (
    <Modal
      open={partner !== null}
      onClose={onClose}
      title={partner?.name ?? ''}
      subtitle={partner?.ref}
      footer={
        <div className="flex justify-end">
          <Button size="lg" variant="ghost" onClick={onClose}>
            {t(message('Đóng', 'Close', '닫기'))}
          </Button>
        </div>
      }
    >
      {partner && <EditPartnerBody key={partner.code} partner={partner} />}
    </Modal>
  )
}

function EditPartnerBody({ partner }: { partner: Partner }) {
  const { t } = useI18n()
  const [name, setName] = useState(partner.name)
  const [originId, setOriginId] = useState(partner.originId)
  const patch = usePatchPartner()

  const renamed = name.trim() !== '' && name.trim() !== partner.name
  const refiled = originId !== '' && originId !== partner.originId
  const send = (body: PartnerPatch, done: string) =>
    patch.mutate({ code: partner.code, body }, { onSuccess: () => toastDone(done) })
  const refusal = failed(patch.error)

  return (
    <fieldset disabled={patch.isPending} className="flex flex-col gap-6">
      {refusal && (
        <p role="alert" className="text-destructive-foreground text-[11.5px] leading-[1.5]">
          {refusal}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <SectionTitle size="sm">{t(message('Đổi tên', 'Rename', '이름 변경'))}</SectionTitle>
        <div className="flex flex-wrap items-end gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={PARTNER_NAME_MAX}
            aria-label={t(message('Tên đối tác', 'Partner name', '파트너 이름'))}
            className="min-w-0 flex-1"
          />
          <Button
            size="lg"
            disabled={!renamed}
            onClick={() =>
              send(
                { name: name.trim() },
                t(
                  message(
                    'Đã đổi tên đối tác',
                    'Partner name updated',
                    '파트너 이름을 변경했습니다',
                  ),
                ),
              )
            }
          >
            {t(message('Lưu tên', 'Save name', '이름 저장'))}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle
          size="sm"
          hint={t(
            message(
              'Chỉ áp dụng cho lead giới thiệu từ nay.',
              'Applies only to leads referred from now on.',
              '이후 추천되는 리드에만 적용됩니다.',
            ),
          )}
        >
          {t(message('Đổi loại', 'Change type', '유형 변경'))}
        </SectionTitle>
        <KindField value={originId} onChange={setOriginId} />
        <div>
          <Button
            size="lg"
            disabled={!refiled}
            onClick={() =>
              send(
                { originId },
                t(
                  message(
                    'Đã đổi loại đối tác',
                    'Partner type updated',
                    '파트너 유형을 변경했습니다',
                  ),
                ),
              )
            }
          >
            {t(message('Lưu loại', 'Save type', '유형 저장'))}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle
          size="sm"
          hint={t(
            message(
              'Ẩn thì không chọn được đối tác này nữa. Lead đã mang mã này giữ nguyên.',
              'Hidden partners cannot be selected for new referrals. Existing leads keep this partner code.',
              '숨긴 파트너는 새 추천에 선택할 수 없습니다. 기존 리드의 파트너 코드는 유지됩니다.',
            ),
          )}
        >
          {partner.active
            ? t(message('Ẩn đối tác', 'Hide partner', '파트너 숨기기'))
            : t(message('Hiện lại đối tác', 'Show partner', '파트너 표시'))}
        </SectionTitle>
        <div>
          <Button
            size="lg"
            variant="secondary"
            onClick={() =>
              send(
                { active: !partner.active },
                partner.active
                  ? t(message('Đã ẩn đối tác', 'Partner hidden', '파트너를 숨겼습니다'))
                  : t(
                      message(
                        'Đã hiện lại đối tác',
                        'Partner restored',
                        '파트너를 다시 표시했습니다',
                      ),
                    ),
              )
            }
          >
            <Icon icon={partner.active ? EyeOff : Eye} size={16} />
            {partner.active
              ? t(message('Ẩn đối tác', 'Hide partner', '파트너 숨기기'))
              : t(message('Hiện lại', 'Show again', '다시 표시'))}
          </Button>
        </div>
      </section>
    </fieldset>
  )
}
