import { useState } from 'react'

/** A 16:9 box that stays neutral when there is no picture or it will not
 *  load. Keyed on the URL by the caller, so `broken` is one address's verdict. */
export function Thumbnail({ url }: { url?: string | undefined }) {
  const [broken, setBroken] = useState(false)
  return (
    <span className="bg-surface-ink/5 block aspect-video w-14 shrink-0 overflow-hidden rounded-sm">
      {url && !broken && (
        <img
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      )}
    </span>
  )
}
