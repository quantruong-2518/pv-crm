/** Module 2 · The blocks of the lead screen, re-exported from one door.
 *
 *  The blocks themselves moved out on 17/09 when this file passed 800 lines:
 *
 *   · `lead-fields.tsx`      — what ONE box looks like, for every card that
 *                              draws boxes;
 *   · `lead-form-card.tsx`   — the profile card (tab row + the open tab) and
 *                              the save-state sentence that belongs with it;
 *   · `lead-next-action.tsx` — the one thing that has to happen next.
 *
 *  This file stays as the door the two lead screens import through, so moving a
 *  block again does not touch them. Nothing is declared here. */

export { FieldRow } from './lead-fields'
export { LeadForm, SaveStateNote } from './lead-form-card'
export { NextActionCard } from './lead-next-action'
