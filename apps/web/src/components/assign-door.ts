/** The hand-over drawer's trigger — its words and its gate — as data, so a
 *  door elsewhere (the lead profile's more menu) reads the same source as
 *  `AssignMenu`'s own button. Apart from the menu for fast refresh. */

export type AssignDoor = { label: string; shut: boolean }

/** Shut = may not assign and has nothing to claim: without `lead.assign`,
 *  only an unheld lead can be taken. */
export function assignDoorOf(
  held: string | null,
  mayAssign: boolean,
  readOnly: boolean,
  signedIn: boolean,
): AssignDoor {
  return {
    label: held ? 'Đổi PIC' : 'Giao lead',
    shut: readOnly || (!mayAssign && !(held === null && signedIn)),
  }
}
