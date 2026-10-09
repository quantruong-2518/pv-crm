import { useState } from 'react'
import { ZOOM } from './workstream-tree-model'

/** Zoom lives above the tree: its controls sit in the floating bar, the tree
 *  alone knows the fit and the floor, so it publishes them through `view`. */
export function useTreeZoom() {
  const [asked, setAsked] = useState<number | null>(null)
  /* Animate only zooms the reader asked for: the first fit lands after a
     forced layout and would otherwise shrink the tree on every load (F-09). */
  const [zoomed, setZoomed] = useState(false)
  const [view, setView] = useState({ zoom: 1, floor: ZOOM.min })
  const ask = (z: number | null) => {
    setZoomed(true)
    setAsked(z === null ? null : Math.max(view.floor, z))
  }
  return { asked, zoomed, view, setView, ask }
}
export type TreeZoom = ReturnType<typeof useTreeZoom>
