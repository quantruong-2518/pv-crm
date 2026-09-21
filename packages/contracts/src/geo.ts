import { z } from 'zod'
import { LEAD_MAX } from './sales/lead-fields'

/** Address lookup — `GET /geo/address-suggest`. A suggestion is text to store,
 *  never an id to keep: nothing here reaches a table except as the plain
 *  `address` / `province` strings the lead already has. An empty `q` is a
 *  probe: it answers `enabled` alone, so the form knows whether to offer the
 *  picker before anyone types.
 *
 *  A suggestion is capped at the tightest column it can land in (the lead's),
 *  so a pick never comes back from the server as a field error the user did
 *  not type. */
export const ADDRESS_SUGGEST_MIN_CHARS = 3
export const ADDRESS_SUGGEST_MAX_ITEMS = 8
export const ADDRESS_SUGGEST_Q_MAX = 120

/** `lat,lng` — where the caller is looking; the provider ranks nearby matches
 *  first, which is what makes a short query find the right street. */
export const AddressFocus = z
  .string()
  .trim()
  .regex(/^-?\d{1,2}(\.\d{1,8})?,-?\d{1,3}(\.\d{1,8})?$/)

export const AddressSuggestQuery = z
  .object({
    q: z.string().trim().max(ADDRESS_SUGGEST_Q_MAX).default(''),
    focus: AddressFocus.optional(),
  })
  .strict()
export type AddressSuggestQuery = z.infer<typeof AddressSuggestQuery>

export const AddressSuggestion = z.object({
  /** Provider handle, spent on the map's `GET /geo/place` and never stored. */
  refId: z.string().max(400),
  address: z.string().max(LEAD_MAX.address),
  province: z.string().max(LEAD_MAX.province),
})
export type AddressSuggestion = z.infer<typeof AddressSuggestion>

export const AddressSuggestResult = z.object({
  enabled: z.boolean(),
  items: z.array(AddressSuggestion).max(ADDRESS_SUGGEST_MAX_ITEMS),
})
export type AddressSuggestResult = z.infer<typeof AddressSuggestResult>

/** A point on the map behind the picker. `lat`/`lng` only steer the map view;
 *  the caller keeps `address` / `province` and drops the rest — coordinates are
 *  never written to a lead. `place` is null when the provider had no answer. */
export const AddressPlace = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().max(LEAD_MAX.address),
  province: z.string().max(LEAD_MAX.province),
})
export type AddressPlace = z.infer<typeof AddressPlace>

export const AddressPlaceResult = z.object({ place: AddressPlace.nullable() })
export type AddressPlaceResult = z.infer<typeof AddressPlaceResult>

/** `GET /geo/place?refId=` — a suggestion's handle to its point. */
export const AddressPlaceQuery = z.object({ refId: z.string().trim().min(1).max(400) }).strict()
export type AddressPlaceQuery = z.infer<typeof AddressPlaceQuery>

/** `GET /geo/reverse?lat=&lng=` — the address under a click on the map. */
export const AddressReverseQuery = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  })
  .strict()
export type AddressReverseQuery = z.infer<typeof AddressReverseQuery>
