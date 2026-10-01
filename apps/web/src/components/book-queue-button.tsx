import { Button, Icon, type IconGlyph } from '@pv/ui'

/** A head's queue on the deal book — a toggle, not a link: pressed while the
 *  book shows exactly its filter, pressing again lifts it. The count waits for
 *  its answer rather than printing a zero that is not one. */
export function BookQueueButton({
  id,
  icon,
  label,
  count,
  active,
  onPress,
}: {
  id?: string
  icon: IconGlyph
  label: string
  count: number | undefined
  active: boolean
  onPress: () => void
}) {
  return (
    <Button
      id={id}
      size="md"
      variant={active ? 'default' : 'secondary'}
      aria-pressed={active}
      className="pointer-coarse:h-12 max-sm:flex-1"
      onClick={onPress}
    >
      <Icon icon={icon} size={16} />
      {label}
      {count !== undefined && <span className="tnum">· {count}</span>}
    </Button>
  )
}
