import { Input, Select, Textarea } from '@pv/ui'
import { LeadCategory } from '@pv/contracts'
import type { FieldErrors } from '@/app/api'
import type { AccountDraft } from '@/data/accounts'
import { Field } from './ops-fields'

/** The company form's nine fields, shared between TWO places.
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
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Tên công ty"
          required
          errors={errors.name}
          hint="Tên gọi trong sổ. Nếu chưa có mã số thuế, ĐÂY là thứ hệ dùng để nhận ra công ty đã có trong sổ hay chưa."
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

        <Field
          label="Tên trên giấy tờ"
          errors={errors.legalName}
          hint="Tên đầy đủ trên hoá đơn. Không dùng để tìm, nên khác tên gọi cũng không sao."
        >
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
          hint="Có mã số thuế thì nó THẮNG tên: hai dòng cùng mã số thuế là một công ty, dù tên viết khác nhau."
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

        <Field label="Địa chỉ" errors={errors.address} className="sm:col-span-2">
          <Input
            value={draft.address}
            maxLength={300}
            aria-label="Địa chỉ"
            invalid={Boolean(errors.address)}
            onChange={(e) => onSet('address', e.target.value)}
          />
        </Field>

        <Field label="Tỉnh/thành" errors={errors.province}>
          <Input
            value={draft.province}
            maxLength={120}
            aria-label="Tỉnh thành"
            invalid={Boolean(errors.province)}
            onChange={(e) => onSet('province', e.target.value)}
          />
        </Field>

        <Field
          label="Ngành"
          plain
          errors={errors.category}
          hint="Ngành quyết định lead mới rơi vào tay ai — xem Thiết lập · Ngành và Sale phụ trách."
        >
          <Select
            label="Ngành"
            hideLabel
            value={draft.category}
            neutralValue=""
            onChange={(v) => onSet('category', v)}
            options={[
              { value: '', label: 'Chưa xếp ngành' },
              ...LeadCategory.options.map((c) => ({ value: c, label: c })),
            ]}
            className="w-full"
          />
        </Field>

        <Field
          label="Số nhân sự"
          errors={errors.headcount}
          hint="Bỏ trống = chưa ai đếm. Khác 0 = công ty không còn ai."
        >
          <Input
            type="number"
            min={0}
            value={draft.headcount}
            aria-label="Số nhân sự"
            invalid={Boolean(errors.headcount)}
            onChange={(e) => onSet('headcount', e.target.value)}
          />
        </Field>

        <Field label="Số nhà máy" errors={errors.plants}>
          <Input
            type="number"
            min={0}
            value={draft.plants}
            aria-label="Số nhà máy"
            invalid={Boolean(errors.plants)}
            onChange={(e) => onSet('plants', e.target.value)}
          />
        </Field>
      </div>

      <Field
        label="Ghi chú"
        errors={errors.note}
        hint="Thứ đội bán hàng biết mà không ô nào hỏi — ai là người quyết, mùa nào họ mua, đã hụt lần nào."
      >
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
