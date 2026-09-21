import { lazy, Suspense } from 'react'
import { useMasMailComposer } from '@/app/mas-mail-composer'

const MasMailModal = lazy(() =>
  import('@/components/mas-mail-modal').then((module) => ({ default: module.MasMailModal })),
)

/** The one mounted instance of the MAS composer.
 *
 * A sequence key deliberately remounts the form if another request replaces
 * the current one: a draft must never leak from one customer to the next. */
export function MasMailComposerHost() {
  const active = useMasMailComposer((state) => state.active)
  const close = useMasMailComposer((state) => state.close)

  if (!active) return null

  return (
    <Suspense fallback={null}>
      <MasMailModal
        key={active.id}
        {...active.value}
        open
        onClose={close}
        onQueued={() => active.value.onQueued?.()}
      />
    </Suspense>
  )
}
