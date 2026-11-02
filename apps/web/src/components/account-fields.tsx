import { useQuery } from '@tanstack/react-query'
import { Input, Select, Textarea } from '@pv/ui'
import { ACCOUNT_ADDRESS_MAX, WEBSITE_MAX } from '@pv/contracts'
import type { FieldErrors } from '@/app/api'
import type { AccountDraft } from '@/data/accounts'
import { SIZE_OPTIONS } from '@/data/lead-form'
import { categoryOptions, leadIndustryOptionsQuery } from '@/data/industries'
import { AddressField } from './address-field'
import { Field } from './ops-fields'
import { message, useI18n } from '@/app/i18n'

const TEXT = {
  usedToDetectDuplicatesWhen: message(
    'Dùng để kiểm tra trùng khi chưa có mã số thuế.',
    'Used to detect duplicates when no tax ID is provided.',
    '사업자등록번호가 없을 때 중복 확인에 사용됩니다.',
  ),
  fullNameAsShownOn: message(
    'Tên đầy đủ trên hoá đơn.',
    'Full name as shown on invoices.',
    '청구서에 표시되는 전체 이름입니다.',
  ),
  matchingTaxIDsAreTreated: message(
    'Trùng mã số thuế là cùng một công ty.',
    'Matching tax IDs are treated as the same company.',
    '사업자등록번호가 같으면 동일 회사로 처리됩니다.',
  ),
  theIndustryGroupDecidesWho: message(
    'Nhóm ngành quyết định ai nhận lead mới.',
    'The industry group decides who receives new leads.',
    '산업 분야에 따라 새 리드 담당자가 정해집니다.',
  ),
  pasteAnImageURLStarting: message(
    'Dán link ảnh logo, bắt đầu bằng https://. Logo hiện làm nền thẻ công ty.',
    'Paste an image URL starting with https://. The logo appears on the company card.',
    'https://로 시작하는 이미지 URL을 붙여 넣으세요. 로고는 회사 카드에 표시됩니다.',
  ),
}

/** The company form's fields, shared between TWO places.
 *
 *  Same reason `ops-fields.tsx` exists: the "Open new company" popup on the
 *  book and the edit form on the profile must ask exactly the same
 *  questions. Duplicating them is the surest way for the two sheets to drift
 *  apart — one field added in one place, one label changed in the other, and
 *  nothing catches it because both stay internally consistent.
 *
 *  `Field` is borrowed from `ops-fields.tsx`, not copied: one field's frame is
 *  the shared frame of every form in this app, and two near-identical frames
 *  read like two products. The day it moves to `@pv/ui`, both files change
 *  one import line.
 *
 *  ------------------------------------------------------------------
 *  THE TWO LOAD-BEARING FIELDS ARE `name` AND `taxCode`
 *  ------------------------------------------------------------------
 *  They ARE the dedup rule: `account_identity_uniq` locks on tax code if
 *  present, otherwise on the lowercased name. So the hints under these two
 *  fields are not generic advice — they tell whoever is filling them in which
 *  two rows the system will treat as one company. */
export function AccountFields({
  draft,
  onSet,
  errors = {},
}: {
  draft: AccountDraft
  onSet: <K extends keyof AccountDraft>(key: K, value: AccountDraft[K]) => void
  errors?: FieldErrors
}) {
  const { data: categories } = useQuery(leadIndustryOptionsQuery)
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t(message('Tên công ty', 'Company name', '회사명'))}
          required
          errors={errors.name}
          hint={t(TEXT.usedToDetectDuplicatesWhen)}
          className="sm:col-span-2"
        >
          <Input
            value={draft.name}
            maxLength={200}
            aria-label={t(message('Tên công ty', 'Company name', '회사명'))}
            aria-required
            invalid={Boolean(errors.name)}
            onChange={(e) => onSet('name', e.target.value)}
          />
        </Field>

        <Field
          label={t(message('Tên trên giấy tờ', 'Legal name', '법인명'))}
          errors={errors.legalName}
          hint={t(TEXT.fullNameAsShownOn)}
        >
          <Input
            value={draft.legalName}
            maxLength={200}
            aria-label={t(message('Tên trên giấy tờ', 'Legal name', '법인명'))}
            invalid={Boolean(errors.legalName)}
            onChange={(e) => onSet('legalName', e.target.value)}
          />
        </Field>

        <Field
          label={t(message('Mã số thuế', 'Tax ID', '사업자등록번호'))}
          errors={errors.taxCode}
          hint={t(TEXT.matchingTaxIDsAreTreated)}
        >
          <Input
            value={draft.taxCode}
            maxLength={32}
            aria-label={t(message('Mã số thuế', 'Tax ID', '사업자등록번호'))}
            className="font-mono"
            invalid={Boolean(errors.taxCode)}
            onChange={(e) => onSet('taxCode', e.target.value)}
          />
        </Field>

        <Field label="Website" errors={errors.website}>
          <Input
            inputMode="url"
            value={draft.website}
            maxLength={WEBSITE_MAX}
            placeholder="abc.com.vn"
            aria-label="Website"
            invalid={Boolean(errors.website)}
            onChange={(e) => onSet('website', e.target.value)}
          />
        </Field>

        <AddressField
          value={draft.address}
          province={draft.province}
          errors={{ address: errors.address, province: errors.province }}
          maxLength={ACCOUNT_ADDRESS_MAX}
          onType={(address) => onSet('address', address)}
          onTypeProvince={(province) => onSet('province', province)}
          onPick={(address, province) => {
            onSet('address', address)
            onSet('province', province)
          }}
        />

        <Field
          label={t(message('Nhóm ngành', 'Industry group', '산업 분야'))}
          plain
          errors={errors.categoryId}
          hint={t(TEXT.theIndustryGroupDecidesWho)}
        >
          <Select
            label={t(message('Nhóm ngành', 'Industry group', '산업 분야'))}
            hideLabel
            value={draft.categoryId}
            neutralValue=""
            onChange={(v) => onSet('categoryId', v)}
            options={[
              {
                value: '',
                label: t(message('Chưa chọn nhóm ngành', 'No industry group', '산업 분야 미선택')),
              },
              ...categoryOptions(categories, draft.categoryId),
            ]}
            className="w-full"
          />
        </Field>

        <Field
          label={t(message('Quy mô', 'Company size', '기업 규모'))}
          plain
          errors={errors.sizeBand}
        >
          <Select
            label={t(message('Quy mô', 'Company size', '기업 규모'))}
            hideLabel
            value={draft.sizeBand}
            neutralValue=""
            onChange={(v) => onSet('sizeBand', v)}
            options={SIZE_OPTIONS}
            className="w-full"
          />
        </Field>
      </div>

      <Field
        label={t(message('Link logo', 'Logo URL', '로고 URL'))}
        errors={errors.logoUrl}
        hint={t(TEXT.pasteAnImageURLStarting)}
      >
        <Input
          type="url"
          inputMode="url"
          maxLength={1000}
          placeholder="https://"
          value={draft.logoUrl}
          aria-label={t(message('Link logo', 'Logo URL', '로고 URL'))}
          invalid={Boolean(errors.logoUrl)}
          onChange={(e) => onSet('logoUrl', e.target.value)}
        />
      </Field>

      <Field label={t(message('Ghi chú', 'Notes', '메모'))} errors={errors.note}>
        <Textarea
          autoGrow
          rows={3}
          maxLength={1000}
          value={draft.note}
          aria-label={t(message('Ghi chú về công ty', 'Company notes', '회사 메모'))}
          invalid={Boolean(errors.note)}
          onChange={(e) => onSet('note', e.target.value)}
        />
      </Field>
    </div>
  )
}
