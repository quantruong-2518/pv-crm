import { Select } from '@pv/ui'
import { message, useI18n } from '@/app/i18n'
import { CONTRACT_COPY } from '@/data/contract-copy'
import { useContractKindLabel, useContractKindOptions } from '@/data/sales-config'
import { Field } from './ops-fields'

/** The contract-kind box, shared by the sign drawer and the quotation forms.
 *  `locked` = the negotiation already fixes the kind, so it prints as a plain
 *  line; a hidden kind still reads by its name. With nothing to pick from, one
 *  muted line replaces the empty select — a select with no rows reads as a bug. */

const NO_KIND = {
  value: '',
  label: message('Chọn loại hợp đồng…', 'Choose a contract type…', '계약 유형 선택…'),
}

export function ContractKindField({
  value,
  locked = false,
  onChange,
}: {
  value: string
  locked?: boolean
  onChange: (value: string) => void
}) {
  const { t } = useI18n()
  const kindLabel = useContractKindLabel()
  const kindOptions = useContractKindOptions(value)

  return (
    <Field label={t(CONTRACT_COPY.contractKind)} required plain>
      {locked ? (
        <span className="bg-input text-foreground pointer-coarse:min-h-12 flex min-h-10 items-center rounded-md px-4 py-2 text-[12.5px]">
          {value === '' ? '' : kindLabel(value)}
        </span>
      ) : kindOptions.length === 0 ? (
        <p className="text-muted-foreground m-0 text-[11.5px]">
          {t(
            message(
              'Chưa có loại hợp đồng nào đang bật.',
              'No contract type is turned on.',
              '활성화된 계약 유형이 없습니다.',
            ),
          )}
        </p>
      ) : (
        <Select
          label={t(CONTRACT_COPY.contractKind)}
          hideLabel
          size="lg"
          value={value}
          onChange={onChange}
          options={[{ ...NO_KIND, label: t(NO_KIND.label) }, ...kindOptions]}
          className="w-full"
        />
      )}
    </Field>
  )
}
