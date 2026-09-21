import { useState, type ReactNode } from 'react'
import { Button, Combobox, Icon, Input, MapPin, cn } from '@pv/ui'
import {
  SUGGEST_EMPTY_TEXT,
  SUGGEST_FAILED_TEXT,
  SUGGEST_TOO_SHORT_TEXT,
  useAddressSuggest,
} from '@/data/address-suggest'
import { VIETMAP_MAP_KEY } from '@/data/address-place'
import { AddressMapDialog } from './address-map-dialog'
import { Field } from './ops-fields'

/** The address pair — one box to search in, one to hold the province — drawn
 *  the same way on the lead form and on the company form.
 *
 *  TWO STRINGS, NEVER AN ID. A pick — from the menu, or from the map dialog
 *  the button beside the box opens — writes `address` and `province` and stops
 *  there; the picker is a spelling aid, not a foreign key.
 *
 *  ONE CONTROL PER BOX, DECIDED ONCE. The search box is drawn while the probe
 *  is still out and stays drawn when it says yes, so the answer landing under
 *  a hand already typing changes nothing on screen. Only a deployment with no
 *  provider falls back to the plain input it replaced — and that answer is
 *  cached for the session, so a form opened twice never swaps controls.
 *
 *  `frame` exists because the two forms draw a field's label and complaint
 *  differently; this file owns the controls, the caller owns the frame. */

export type AddressBoxKey = 'address' | 'province'

/** How one box is labelled and where its complaint goes. `plain` says the
 *  control brings its own `<label>` (a `Combobox` does), so the frame must not
 *  wrap it in a second one. */
export type AddressFrame = (box: {
  key: AddressBoxKey
  label: string
  plain: boolean
  errors?: string[]
  children: ReactNode
}) => ReactNode

export type AddressFieldProps = {
  value: string
  province: string
  labels?: { address: string; province: string }
  errors?: { address?: string[]; province?: string[] }
  maxLength?: { address?: number; province?: number }
  /** A pick fills both boxes at once — that is the whole point of the picker. */
  onPick: (address: string, province: string) => void
  onType: (address: string) => void
  onTypeProvince: (province: string) => void
  /** Doors that save a box when it loses focus. Absent where the form saves on
   *  submit instead. */
  onCommit?: (box: AddressBoxKey) => void
  size?: 'md' | 'lg'
  /** The caller's own control sizing, so these boxes stand the same height as
   *  the ones beside them: `inputClassName` reaches the plain boxes and the
   *  printed province, `pickerClassName` the search box, whose input sits one
   *  element below (`[&_input]:h-11`). */
  inputClassName?: string
  pickerClassName?: string
  frame?: AddressFrame
}

const DEFAULT_LABELS = { address: 'Địa chỉ', province: 'Tỉnh/thành' } as const

const PLACEHOLDER = 'Gõ số nhà, đường, phường…'
const MAP_BUTTON_TEXT = 'Chọn trên bản đồ'

/** The company form's frame: the shared field shell, address across both
 *  columns because a street rarely fits half a row. */
const defaultFrame: AddressFrame = ({ key, label, plain, errors, children }) => (
  <Field
    label={label}
    plain={plain}
    errors={errors}
    className={key === 'address' ? 'sm:col-span-2' : undefined}
  >
    {children}
  </Field>
)

export function AddressField({
  value,
  province,
  labels = DEFAULT_LABELS,
  errors,
  maxLength,
  onPick,
  onType,
  onTypeProvince,
  onCommit,
  size = 'md',
  inputClassName,
  pickerClassName,
  frame = defaultFrame,
}: AddressFieldProps) {
  /* Remembered so the address just chosen is not sent straight back as a
     search, and so the province box knows it is holding a picked value. */
  const [lastPick, setLastPick] = useState<string | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const picked = lastPick !== null && lastPick === value
  const suggest = useAddressSuggest(picked ? '' : value)

  /* One way in for both pickers: a map pick and a menu pick write the same two
     boxes through the same door, so a form saving on blur sees one shape. */
  const applyPick = (pickedAddress: string, pickedProvince: string) => {
    setLastPick(pickedAddress)
    onPick(pickedAddress, pickedProvince)
  }

  /* No tile key, no button — the menu and the plain box are untouched. */
  const mapEnabled = suggest.enabled && VIETMAP_MAP_KEY !== ''

  const addressInvalid = Boolean(errors?.address?.length)
  /* `Combobox` takes no `maxLength`, so the ceiling is applied to what is
     typed — the same cut the plain box gets from the attribute. */
  const typeAddress = (raw: string) =>
    onType(maxLength?.address === undefined ? raw : raw.slice(0, maxLength.address))

  const provinceBox = (
    <ProvinceBox
      value={province}
      label={labels.province}
      maxLength={maxLength?.province}
      invalid={Boolean(errors?.province?.length)}
      className={inputClassName}
      /* A pick that came back without a province leaves the box typeable —
         read-only and empty is a box nobody can fill. */
      printed={picked && province !== ''}
      onType={onTypeProvince}
      onCommit={onCommit}
    />
  )

  const addressBox =
    suggest.enabled || suggest.probing ? (
      <div className="flex items-start gap-2">
        {/* The pick already wrote both boxes through; a blur right after it
            would send the same value a second time. */}
        <div
          className="min-w-0 flex-1"
          onBlur={() => {
            if (!picked) onCommit?.('address')
          }}
        >
          <Combobox
            label={labels.address}
            hideLabel
            size={size}
            className={pickerClassName}
            value={value}
            valueLabel={value === '' ? undefined : value}
            query={value}
            onQueryChange={typeAddress}
            options={suggest.items.map((item) => ({
              value: item.address,
              label: item.address,
              hint: item.province,
            }))}
            onSelect={(option) => {
              const hit = suggest.items.find((item) => item.address === option.value)
              if (!hit) return
              applyPick(hit.address, hit.province)
            }}
            placeholder={PLACEHOLDER}
            emptyText={
              suggest.tooShort
                ? SUGGEST_TOO_SHORT_TEXT
                : suggest.failed
                  ? SUGGEST_FAILED_TEXT
                  : SUGGEST_EMPTY_TEXT
            }
            loading={suggest.loading}
            invalid={addressInvalid}
          />
        </div>
        {mapEnabled && (
          /* The caller's own height, so the button stands level with the box
             beside it; 48px the moment the pointer is a finger (law 13). */
          <Button
            type="button"
            variant="ghost"
            className={cn('pointer-coarse:h-12 shrink-0', inputClassName)}
            onClick={() => setMapOpen(true)}
          >
            <Icon icon={MapPin} size={16} />
            <span className="max-sm:sr-only">{MAP_BUTTON_TEXT}</span>
          </Button>
        )}
      </div>
    ) : (
      <Input
        value={value}
        maxLength={maxLength?.address}
        aria-label={labels.address}
        invalid={addressInvalid}
        className={inputClassName}
        onChange={(e) => onType(e.target.value)}
        onBlur={() => onCommit?.('address')}
      />
    )

  return (
    <>
      {frame({
        key: 'address',
        label: labels.address,
        /* The search box carries its own `<label>`; the plain one does not. */
        plain: suggest.enabled || suggest.probing,
        errors: errors?.address,
        children: addressBox,
      })}
      {frame({
        key: 'province',
        label: labels.province,
        plain: picked && province !== '',
        errors: errors?.province,
        children: provinceBox,
      })}
      {mapEnabled && (
        <AddressMapDialog
          open={mapOpen}
          onClose={() => setMapOpen(false)}
          apiKey={VIETMAP_MAP_KEY}
          initialQuery={value}
          onPick={applyPick}
        />
      )}
    </>
  )
}

/** The province box: typed by hand, or printed once a pick filled it in.
 *
 *  Printed rather than disabled — a box nobody may type into is an invitation
 *  to tap and be disappointed, and on a tablet it eats a 48px target for
 *  nothing. Choosing another address rewrites it; editing the address by hand
 *  hands the box back. Both shapes take the caller's height, so the swap moves
 *  nothing on the row. */
function ProvinceBox({
  value,
  label,
  maxLength,
  invalid,
  className,
  printed,
  onType,
  onCommit,
}: {
  value: string
  label: string
  maxLength?: number
  invalid: boolean
  className?: string
  printed: boolean
  onType: (province: string) => void
  onCommit?: (box: AddressBoxKey) => void
}) {
  if (printed) {
    return <span className={cn('flex h-10 items-center', className)}>{value}</span>
  }

  return (
    <Input
      value={value}
      maxLength={maxLength}
      aria-label={label}
      invalid={invalid}
      className={className}
      onChange={(e) => onType(e.target.value)}
      onBlur={() => onCommit?.('province')}
    />
  )
}
