import { useEffect, useRef, useState } from 'react'
import type * as VietmapGlModule from '@vietmap/vietmap-gl-js/dist/vietmap-gl.js'
import { cn } from '@pv/ui'
import type { MapPoint } from '@/data/address-place'

/** The map itself, and the only place the tile library is touched.
 *
 *  LOADED WHEN THE DIALOG OPENS, NEVER BEFORE. The library is ~800KB, which is
 *  more than the whole app budget (`vite.config.ts`), so it arrives through a
 *  dynamic `import()` and lands in its own chunk. Mounting this component is
 *  what pays for it; unmounting takes the map down with `remove()`.
 *
 *  The package ships a UMD bundle with no `main`, so both the code and its CSS
 *  are imported by explicit `dist/` path, and the library object arrives as the
 *  interop `default`.
 *
 *  Failure is silent-ish by design: no tiles means a line of Vietnamese and a
 *  dialog that still has a working search box above it. */

/** Type-only, so the static import is erased and the library still arrives
 *  through the dynamic `import()` below — nothing here reaches the bundle. */
type VietmapGl = (typeof VietmapGlModule)['default']
type VietmapMap = InstanceType<VietmapGl['Map']>
type VietmapMarker = InstanceType<VietmapGl['Marker']>

const STYLE_URL = 'https://maps.vietmap.vn/maps/styles/tm/style.json'

/** Camera defaults, not data: the country until something is chosen, a street
 *  once it is. The opening centre is the middle of Vietnam so the first frame
 *  is not a guess about where this user is. */
const OPEN_CENTER: [number, number] = [106, 16]
const OPEN_ZOOM = 5
const PLACE_ZOOM = 16

const LOADING_TEXT = 'Đang mở bản đồ…'
const FAILED_TEXT = 'Không tải được bản đồ — vẫn có thể tìm bằng ô tìm kiếm ở trên.'

async function loadVietmapGl(): Promise<VietmapGl> {
  const [mod] = await Promise.all([
    import('@vietmap/vietmap-gl-js/dist/vietmap-gl.js'),
    import('@vietmap/vietmap-gl-js/dist/vietmap-gl.css'),
  ])
  return mod.default ?? mod
}

/** The library paints its own marker in a hard-coded blue; law 1 allows no
 *  colour that is not a token, so the pin is our own element. A dot marking a
 *  position is exactly what law 16 leaves `rounded-full` for. */
function pinElement(): HTMLDivElement {
  const pin = document.createElement('div')
  pin.className = 'size-4 rounded-full bg-primary shadow-primary'
  return pin
}

export type AddressMapCanvasProps = {
  apiKey: string
  /** Where the view should be. Changes only when a search result lands — a tap
   *  on the map moves the pin, not the camera. */
  center: MapPoint | null
  marker: MapPoint | null
  onPickPoint: (point: MapPoint) => void
  className?: string
}

export function AddressMapCanvas({
  apiKey,
  center,
  marker,
  onPickPoint,
  className,
}: AddressMapCanvasProps) {
  const box = useRef<HTMLDivElement>(null)
  const gl = useRef<VietmapGl | null>(null)
  const map = useRef<VietmapMap | null>(null)
  const pin = useRef<VietmapMarker | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  /* The map is built once; the tap handler is read through a ref so a new
     closure on every render does not rebuild it. */
  const onTap = useRef(onPickPoint)
  useEffect(() => {
    onTap.current = onPickPoint
  }, [onPickPoint])

  useEffect(() => {
    let live = true
    void (async () => {
      const lib = await loadVietmapGl().catch(() => null)
      if (!live) return
      if (lib === null || box.current === null) {
        setFailed(true)
        return
      }
      const created = new lib.Map({
        container: box.current,
        style: `${STYLE_URL}?apikey=${encodeURIComponent(apiKey)}`,
        center: OPEN_CENTER,
        zoom: OPEN_ZOOM,
      })
      created.on('click', (event) =>
        onTap.current({ lat: event.lngLat.lat, lng: event.lngLat.lng }),
      )
      gl.current = lib
      map.current = created
      setReady(true)
    })()

    return () => {
      live = false
      map.current?.remove()
      map.current = null
      pin.current = null
      gl.current = null
    }
  }, [apiKey])

  useEffect(() => {
    const lib = gl.current
    const drawn = map.current
    if (!ready || lib === null || drawn === null) return
    if (marker === null) {
      pin.current?.remove()
      pin.current = null
      return
    }
    const at: [number, number] = [marker.lng, marker.lat]
    if (pin.current === null) {
      pin.current = new lib.Marker({ element: pinElement() }).setLngLat(at).addTo(drawn)
    } else {
      pin.current.setLngLat(at)
    }
  }, [ready, marker])

  useEffect(() => {
    if (!ready || center === null) return
    map.current?.flyTo({ center: [center.lng, center.lat], zoom: PLACE_ZOOM })
  }, [ready, center])

  return (
    <div className={cn('glass-b relative overflow-hidden rounded-md', className)}>
      <div ref={box} className="absolute inset-0" />
      {(!ready || failed) && (
        <p
          role={failed ? 'alert' : undefined}
          className="text-muted-foreground absolute inset-0 m-0 flex items-center justify-center p-4 text-center text-[12.5px]"
        >
          {failed ? FAILED_TEXT : LOADING_TEXT}
        </p>
      )}
    </div>
  )
}
