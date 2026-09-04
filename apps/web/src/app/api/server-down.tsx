import { useEffect, useRef, useState } from 'react'
import { Button, CircleCheck, GlassCard, Icon, Plug, RefreshCw, wordmarkLight } from '@pv/ui'
import { queryClient } from '@/app/query-client'
import { probeServer, useServerHealth } from './server-health'

/** The screen for the minutes when the server is not there.
 *
 *  ---------------------------------------------------------------------------
 *  WHY A TAKEOVER AND NOT NINE ERROR MESSAGES
 *  ---------------------------------------------------------------------------
 *  When the server goes, every panel on the screen fails at the same instant.
 *  Left to themselves they each say their own sentence, and the person reads
 *  nine copies of a small failure instead of one plain fact: it is not you, it
 *  is not this screen, it is the server, and someone is on it. One surface says
 *  that once.
 *
 *  ---------------------------------------------------------------------------
 *  WHAT A PERSON WAITING ACTUALLY NEEDS, IN ORDER
 *  ---------------------------------------------------------------------------
 *  1 · That their work is not gone. This is the first line for a reason: the
 *      React tree underneath is untouched — same rule as the session lock in
 *      `app/auth/expiry.tsx` — so a half-typed form is still sitting there, and
 *      saying so is the difference between waiting and starting over.
 *  2 · That something is being tried WITHOUT them. A countdown to the next
 *      probe and the number of probes already made turn a frozen page into
 *      visible work; a bare spinner turns the same wait into an unanswered
 *      question.
 *  3 · A way to stop waiting and ask now, for the person who just watched the
 *      deploy finish and does not want to sit out the backoff.
 *  4 · An end. Recovery is announced, not silently undone, and it says how long
 *      it took — someone who walked away comes back to an answer rather than to
 *      a screen that looks like nothing ever happened.
 *
 *  What it deliberately does NOT do: apologise twice, promise a time nobody can
 *  promise, or dress the outage up. It is scaffolding, and it says so.
 *
 *  ---------------------------------------------------------------------------
 *  LAYER
 *  ---------------------------------------------------------------------------
 *  The app's ladder is nav 40 · drawer 50 · expiry strip 55 · session lock 60,
 *  and this sits at 70, above all of them. Above the lock specifically: when
 *  the server is gone the lock's own sign-in button cannot reach anyone either,
 *  so the layer that explains WHY nothing works has to be the one in front. */

/** How long the recovery card stays before it lets go of the screen.
 *
 *  Long enough to be read and to register as an ending, short enough that
 *  someone whose hand is already on the mouse is not made to dismiss a message
 *  about news they can see for themselves. */
const RECOVERED_MS = 2600

/** mm:ss to the next probe. */
function countdown(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(total / 60)}:${`${total % 60}`.padStart(2, '0')}`
}

/** How long it has been, in the words a person would use out loud. Under a
 *  minute carries no number at all: a zero there reads as broken, and the exact
 *  second an outage started is of no use to anyone waiting it out. */
function howLong(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  return minutes < 1 ? 'chưa tới một phút' : `${minutes} phút`
}

/** A clock that only runs while it is being read. */
function useNow(running: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [running])
  return now
}

function Waiting() {
  const since = useServerHealth((s) => s.since)
  const probes = useServerHealth((s) => s.probes)
  const nextProbeAt = useServerHealth((s) => s.nextProbeAt)
  const probing = useServerHealth((s) => s.probing)
  const now = useNow(true)

  return (
    <>
      <div className="flex flex-col gap-4">
        <span className="bg-warning/15 text-warning flex size-12 items-center justify-center rounded-full">
          <Icon icon={Plug} size={24} />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="font-display m-0 text-[20px] font-semibold">Máy chủ đang bảo trì</h1>
          <p className="text-muted-foreground m-0 text-pretty text-[12.5px] leading-[1.65]">
            Trang vẫn mở và mọi thứ bạn gõ dở vẫn nằm nguyên trên màn phía sau. Chỉ đường nối tới
            máy chủ đang tạm ngưng — không có gì bị mất.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="m-0 text-[12.5px] font-semibold">
          {probing
            ? 'Đang kiểm tra…'
            : `Tự kiểm tra lại sau ${countdown((nextProbeAt ?? now) - now)}`}
        </p>
        <p className="text-muted-foreground m-0 text-[11.5px] leading-[1.65]">
          Ngưng {howLong(now - (since ?? now))}
          {probes > 0 && ` · đã kiểm ${probes} lần`}
        </p>
      </div>

      <Button variant="ghost" onClick={() => void probeServer()} disabled={probing}>
        <Icon icon={RefreshCw} />
        Kiểm tra ngay
      </Button>
    </>
  )
}

function Recovered() {
  const since = useServerHealth((s) => s.since)

  return (
    <div className="flex flex-col gap-4">
      <span className="bg-success/15 text-success flex size-12 items-center justify-center rounded-full">
        <Icon icon={CircleCheck} size={24} />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="font-display m-0 text-[20px] font-semibold">Máy chủ đã trở lại</h1>
        <p className="text-muted-foreground m-0 text-pretty text-[12.5px] leading-[1.65]">
          Gián đoạn {howLong(Date.now() - (since ?? Date.now()))}. Dữ liệu trên màn đang tự tải lại
          — bạn làm tiếp đúng chỗ đang dở.
        </p>
      </div>
    </div>
  )
}

/** Mounted once, at the root, beside the toasts. Renders nothing at all until
 *  the server stops answering. */
export function ServerDown() {
  const health = useServerHealth((s) => s.health)
  const [showing, setShowing] = useState(false)
  /* A ref, not state: this only decides whether the NEXT 'ok' is a recovery or
     the ordinary quiet of an app that was never down, and re-rendering on that
     answer would just re-run the effect that sets it. */
  const wasDown = useRef(false)

  useEffect(() => {
    if (health === 'down') {
      wasDown.current = true
      setShowing(true)
      return
    }
    if (!wasDown.current) return
    wasDown.current = false
    /* Nothing here heals on its own: `queryClient` runs with `retry: false` and
       `refetchOnReconnect: false`, so every panel that failed during the outage
       is holding an error until someone asks again. This is that ask — without
       it the card's promise that they can carry on where they left off is a lie
       the user discovers one blank panel at a time. */
    void queryClient.refetchQueries({ type: 'active' })
    const id = setTimeout(() => setShowing(false), RECOVERED_MS)
    return () => clearTimeout(id)
  }, [health])

  if (!showing) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-auto bg-[var(--scrim)] p-6 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={health === 'down' ? 'Máy chủ đang bảo trì' : 'Máy chủ đã trở lại'}
    >
      <GlassCard className="flex w-full max-w-[420px] flex-col gap-6 p-8">
        <img src={wordmarkLight} alt="PV One" className="h-6 self-start object-contain" />
        {health === 'down' ? <Waiting /> : <Recovered />}
      </GlassCard>
    </div>
  )
}
