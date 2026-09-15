import type { ObjectChainLink } from '@pv/contracts'
import type { ObjectRef } from '@pv/engines'

/** `ObjectRef` → the three fields a ContextRail chip needs.
 *
 *  Narrowed rather than forwarded whole, and the narrowing is the point:
 *  `ObjectRef` also carries `owner`, `state` and `amount`. A rail that shipped
 *  those would print a deal's value on the lead screen — beside a lead whose
 *  own amount that screen deliberately does not show. A chip answers "which
 *  object, which door"; anything more is a second screen leaking into a first.
 *
 *  Lives in `platform/graph` rather than in either branch because both profile
 *  doors need it, and a copy in each is two shapes for one wire the day
 *  somebody adds a field to just one of them. */
export function toChainLink(ref: ObjectRef): ObjectChainLink {
  return { code: ref.code, kind: ref.kind, label: ref.label }
}
