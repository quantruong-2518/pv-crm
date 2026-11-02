/** The hand-over drawer's trigger — its words and its gate — as data, so a
 *  door elsewhere (the lead profile's more menu) reads the same source as
 *  `AssignMenu`'s own button. Apart from the menu for fast refresh. */

import { getLang, message, translate, type Lang } from '@/app/i18n'

export type AssignDoor = { label: string; shut: boolean }

/** Shut = may not assign and has nothing to claim: without `lead.assign`,
 *  only an unheld lead can be taken. */
export function assignDoorOf(
  held: string | null,
  mayAssign: boolean,
  readOnly: boolean,
  signedIn: boolean,
  lang: Lang = getLang(),
): AssignDoor {
  return {
    label: translate(
      held
        ? message('Đổi PIC', 'Change owner', '담당자 변경')
        : message('Giao lead', 'Assign lead', '리드 배정'),
      lang,
    ),
    shut: readOnly || (!mayAssign && !(held === null && signedIn)),
  }
}
