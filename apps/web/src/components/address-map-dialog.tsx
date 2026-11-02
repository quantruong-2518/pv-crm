import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Modal, SearchField, cn } from '@pv/ui'
import type { AddressPlace } from '@pv/contracts'
import { message, translate, useI18n } from '@/app/i18n'
import {
  SUGGEST_EMPTY_TEXT,
  SUGGEST_FAILED_TEXT,
  SUGGEST_TOO_SHORT_TEXT,
  focusOf,
  useAddressSuggest,
  type AddressSuggestState,
} from '@/data/address-suggest'
import { useAddressAtPoint, usePlaceByRef, type MapPoint } from '@/data/address-place'
import { AddressMapCanvas } from './address-map-canvas'

/** Pick an address on a map — search it, or tap the spot.
 *
 *  THE ANSWER IS STILL TWO STRINGS. Whichever way the point was reached, what
 *  leaves this dialog is `address` and `province`, handed to the same `onPick`
 *  a suggestion row calls. The coordinates stay here, steering the camera.
 *
 *  NOTHING IS WRITTEN UNTIL THE BUTTON. Tapping the map moves a pin and asks
 *  what stands there; it does not touch the form. Closing without confirming
 *  leaves the boxes exactly as they were.
 *
 *  Both lookups are drawn from ONE `choice`, so a tap cancels a search result
 *  and a search result cancels a tap — two live answers would let the preview
 *  line and the pin disagree about what is about to be saved. */

type Choice = { kind: 'ref'; refId: string } | { kind: 'point'; at: MapPoint }

const SEARCH_PLACEHOLDER = message(
  'Tìm địa chỉ: số nhà, đường, phường…',
  'Search an address: house number, street, ward…',
  '주소 검색: 번지, 도로명, 동…',
)
const SEARCHING_TEXT = message('Đang tìm…', 'Searching…', '검색 중…')
const HINT_TEXT = message(
  'Tìm địa chỉ hoặc chạm vào bản đồ để chọn.',
  'Search for an address or tap the map to choose.',
  '주소를 검색하거나 지도를 눌러 선택하세요.',
)
const FETCHING_TEXT = message('Đang lấy địa chỉ…', 'Getting the address…', '주소를 가져오는 중…')
const LOOKUP_FAILED_TEXT = message(
  'Không lấy được địa chỉ. Thử lại.',
  'Could not get the address. Try again.',
  '주소를 가져오지 못했습니다. 다시 시도하세요.',
)
const NO_ADDRESS_TEXT = message(
  'Điểm này không có địa chỉ. Chọn điểm khác.',
  'This point has no address. Choose another point.',
  '이 위치에는 주소가 없습니다. 다른 위치를 선택하세요.',
)
const CONFIRM_TEXT = message('Dùng địa chỉ này', 'Use this address', '이 주소 사용')
const CANCEL_TEXT = message('Huỷ', 'Cancel', '취소')
const TITLE_TEXT = message(
  'Chọn địa chỉ trên bản đồ',
  'Choose an address on the map',
  '지도에서 주소 선택',
)
const SUBTITLE_TEXT = message(
  'Chỉ lưu địa chỉ và tỉnh/thành.',
  'Only the address and province/city are saved.',
  '주소와 시/도만 저장됩니다.',
)

export type AddressMapDialogProps = {
  open: boolean
  onClose: () => void
  apiKey: string
  /** What the address box already holds — the search starts from it. */
  initialQuery: string
  onPick: (address: string, province: string) => void
}

export function AddressMapDialog({
  open,
  onClose,
  apiKey,
  initialQuery,
  onPick,
}: AddressMapDialogProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState(initialQuery)
  const [choice, setChoice] = useState<Choice | null>(null)
  const wasOpen = useRef(open)

  /* Every open starts from the address in the box; a dialog remembering the
     last visit would offer a stranger's street. */
  useEffect(() => {
    if (open && !wasOpen.current) {
      setQuery(initialQuery)
      setChoice(null)
    }
    wasOpen.current = open
  }, [open, initialQuery])

  const byRef = usePlaceByRef(choice?.kind === 'ref' ? choice.refId : null)
  const atPoint = useAddressAtPoint(choice?.kind === 'point' ? choice.at : null)
  const lookup = choice?.kind === 'point' ? atPoint : byRef
  const place = choice === null ? null : (lookup.data?.place ?? null)

  /* A search result moves the camera; a tap does not — the map must stay where
     the finger left it. */
  const center = useMemo(
    () => (choice?.kind === 'ref' && place !== null ? { lat: place.lat, lng: place.lng } : null),
    [choice, place],
  )

  const marker = useMemo(() => {
    if (choice === null) return null
    if (choice.kind === 'point') return choice.at
    return place === null ? null : { lat: place.lat, lng: place.lng }
  }, [choice, place])

  /* Ranked from where the marker is; before any pick the server's default
     city applies. */
  const suggest = useAddressSuggest(query, marker === null ? undefined : focusOf(marker))

  const confirm = () => {
    if (place === null) return
    onPick(place.address, place.province)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(TITLE_TEXT)}
      subtitle={t(SUBTITLE_TEXT)}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          <ChosenLine
            place={place}
            chosen={choice !== null}
            busy={choice !== null && lookup.isFetching}
            failed={choice !== null && lookup.isError}
          />
          <Button size="lg" variant="ghost" onClick={onClose}>
            {t(CANCEL_TEXT)}
          </Button>
          <Button size="lg" disabled={place === null} onClick={confirm}>
            {t(CONFIRM_TEXT)}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <SearchField
          size="page"
          value={query}
          onChange={setQuery}
          placeholder={t(SEARCH_PLACEHOLDER)}
        />
        <ResultList
          suggest={suggest}
          activeRefId={choice?.kind === 'ref' ? choice.refId : null}
          onChoose={(refId) => setChoice({ kind: 'ref', refId })}
        />
        <AddressMapCanvas
          apiKey={apiKey}
          center={center}
          marker={marker}
          onPickPoint={(at) => setChoice({ kind: 'point', at })}
          className="pointer-coarse:h-[440px] h-[320px]"
        />
      </div>
    </Modal>
  )
}

/** The search results — law 8 puts a list this long on `.glass-b`, and a row
 *  is a 48px target because this dialog is used on a tablet in a car park. */
function ResultList({
  suggest,
  activeRefId,
  onChoose,
}: {
  suggest: AddressSuggestState
  activeRefId: string | null
  onChoose: (refId: string) => void
}) {
  const message = messageOf(suggest)
  if (message !== null) {
    return (
      <p
        className={cn(
          'glass-b m-0 rounded-md p-4 text-[12.5px]',
          suggest.failed ? 'text-destructive-foreground' : 'text-muted-foreground',
        )}
      >
        {message}
      </p>
    )
  }

  return (
    <ul className="glass-b m-0 flex max-h-[264px] list-none flex-col gap-1 overflow-y-auto rounded-md p-1">
      {suggest.items.map((item) => (
        <li key={item.refId}>
          <button
            type="button"
            onClick={() => onChoose(item.refId)}
            aria-pressed={item.refId === activeRefId}
            className={cn(
              'motion-std flex min-h-12 w-full flex-col justify-center gap-1 rounded-md px-4 py-2 text-left',
              item.refId === activeRefId ? 'bg-surface-ink/16' : 'hover:bg-surface-ink/9',
            )}
          >
            <span className="text-[12.5px]">{item.address}</span>
            <span className="text-muted-foreground text-[11.5px]">{item.province}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Why the list has no rows, or `null` when it has some. */
function messageOf(suggest: AddressSuggestState): string | null {
  if (suggest.loading) return translate(SEARCHING_TEXT)
  if (suggest.tooShort) return translate(SUGGEST_TOO_SHORT_TEXT)
  if (suggest.failed) return translate(SUGGEST_FAILED_TEXT)
  return suggest.items.length === 0 ? translate(SUGGEST_EMPTY_TEXT) : null
}

/** What the confirm button is about to write, spelled out beside it — the one
 *  place the two strings are shown before they land in the form. */
function ChosenLine({
  place,
  chosen,
  busy,
  failed,
}: {
  place: AddressPlace | null
  chosen: boolean
  busy: boolean
  failed: boolean
}) {
  const { t } = useI18n()
  if (place !== null) {
    return (
      <p className="m-0 mr-auto text-[12.5px]">
        <span>{place.address}</span>
        <span className="text-muted-foreground"> · {place.province}</span>
      </p>
    )
  }

  const text = !chosen
    ? t(HINT_TEXT)
    : busy
      ? t(FETCHING_TEXT)
      : failed
        ? t(LOOKUP_FAILED_TEXT)
        : null
  return (
    <p
      role={text === null || failed ? 'alert' : undefined}
      className={cn(
        'm-0 mr-auto text-[11.5px]',
        failed ? 'text-destructive-foreground' : 'text-muted-foreground',
      )}
    >
      {text ?? t(NO_ADDRESS_TEXT)}
    </p>
  )
}
