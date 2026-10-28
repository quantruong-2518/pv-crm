import { useQuery } from '@tanstack/react-query'
import { Input, Select, Textarea } from '@pv/ui'
import { ACCOUNT_ADDRESS_MAX, WEBSITE_MAX } from '@pv/contracts'
import type { FieldErrors } from '@/app/api'
import type { AccountDraft } from '@/data/accounts'
import { categoryOptions, leadIndustryOptionsQuery } from '@/data/industries'
import { AddressField } from './address-field'
import { Field } from './ops-fields'

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
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Tên công ty"
          required
          errors={errors.name}
          hint="Dùng để kiểm tra trùng khi chưa có mã số thuế."
          className="sm:col-span-2"
        >
          <Input
            value={draft.name}
            maxLength={200}
            aria-label="Tên công ty"
            aria-required
            invalid={Boolean(errors.name)}
            onChange={(e) => onSet('name', e.target.value)}
          />
        </Field>

        <Field label="Tên trên giấy tờ" errors={errors.legalName} hint="Tên đầy đủ trên hoá đơn.">
          <Input
            value={draft.legalName}
            maxLength={200}
            aria-label="Tên trên giấy tờ"
            invalid={Boolean(errors.legalName)}
            onChange={(e) => onSet('legalName', e.target.value)}
          />
        </Field>

        <Field
          label="Mã số thuế"
          errors={errors.taxCode}
          hint="Trùng mã số thuế là cùng một công ty."
        >
          <Input
            value={draft.taxCode}
            maxLength={32}
            aria-label="Mã số thuế"
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
          label="Nhóm ngành"
          plain
          errors={errors.categoryId}
          hint="Nhóm ngành quyết định ai nhận lead mới."
        >
          <Select
            label="Nhóm ngành"
            hideLabel
            value={draft.categoryId}
            neutralValue=""
            onChange={(v) => onSet('categoryId', v)}
            options={[
              { value: '', label: 'Chưa chọn nhóm ngành' },
              ...categoryOptions(categories, draft.categoryId),
            ]}
            className="w-full"
          />
        </Field>

        <Field label="Số nhân sự" errors={errors.headcount} hint="Để trống nếu chưa biết.">
          <Input
            type="number"
            min={0}
            value={draft.headcount}
            aria-label="Số nhân sự"
            invalid={Boolean(errors.headcount)}
            onChange={(e) => onSet('headcount', e.target.value)}
          />
        </Field>
      </div>

      <Field
        label="Link logo"
        errors={errors.logoUrl}
        hint="Dán link ảnh logo, bắt đầu bằng https://. Logo hiện làm nền thẻ công ty."
      >
        <Input
          type="url"
          inputMode="url"
          maxLength={1000}
          placeholder="https://"
          value={draft.logoUrl}
          aria-label="Link logo"
          invalid={Boolean(errors.logoUrl)}
          onChange={(e) => onSet('logoUrl', e.target.value)}
        />
      </Field>

      <Field label="Ghi chú" errors={errors.note}>
        <Textarea
          autoGrow
          rows={3}
          maxLength={1000}
          value={draft.note}
          aria-label="Ghi chú về công ty"
          invalid={Boolean(errors.note)}
          onChange={(e) => onSet('note', e.target.value)}
        />
      </Field>
    </div>
  )
}
