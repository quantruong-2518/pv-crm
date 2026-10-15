import { Select } from '@pv/ui'
import { useContractKindLabel, useContractKindOptions } from '@/data/sales-config'
import { Field } from './ops-fields'

/** The contract-kind box, shared by the sign drawer and the quotation forms.
 *  `locked` = the negotiation already fixes the kind, so it prints as a plain
 *  line; a hidden kind still reads by its name. With nothing to pick from, one
 *  muted line replaces the empty select — a select with no rows reads as a bug. */

const NO_KIND = { value: '', label: 'Chọn loại hợp đồng…' }

export function ContractKindField({
  value,
  locked = false,
  onChange,
}: {
  value: string
  locked?: boolean
  onChange: (value: string) => void
}) {
  const kindLabel = useContractKindLabel()
  const kindOptions = useContractKindOptions(value)

  return (
    <Field label="Loại hợp đồng" required plain>
      {locked ? (
        <span className="bg-input text-foreground pointer-coarse:min-h-12 flex min-h-10 items-center rounded-md px-4 py-2 text-[12.5px]">
          {value === '' ? '' : kindLabel(value)}
        </span>
      ) : kindOptions.length === 0 ? (
        <p className="text-muted-foreground m-0 text-[11.5px]">
          Chưa có loại hợp đồng nào đang bật.
        </p>
      ) : (
        <Select
          label="Loại hợp đồng"
          hideLabel
          size="lg"
          value={value}
          onChange={onChange}
          options={[NO_KIND, ...kindOptions]}
          className="w-full"
        />
      )}
    </Field>
  )
}
