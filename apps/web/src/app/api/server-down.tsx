import { useThemeMode, wordmarkBlue } from '@pv/ui'
import { useEffect, useRef, useState } from 'react'
import { Button, CircleCheck, GlassCard, Icon, Plug, RefreshCw, wordmarkLight } from '@pv/ui'
import { message, translate, useI18n, type Lang, type Message } from '@/app/i18n'
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
function howLong(ms: number): Message {
  const minutes = Math.floor(ms / 60000)
  return minutes < 1
    ? message('chưa tới một phút', 'less than a minute', '1분 미만')
    : message(
        `${minutes} phút`,
        `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`,
        `${minutes}분`,
      )
}

const MAINTENANCE = message('Hệ thống đang bảo trì', 'System under maintenance', '시스템 점검 중')
const RECONNECTED = message('Đã kết nối lại', 'Reconnected', '다시 연결되었습니다')

const t0 = (copy: Message, lang: Lang) => translate(copy, lang)

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
  const { t } = useI18n()

  return (
    <>
      <div className="flex flex-col gap-4">
        <span className="bg-warning/15 text-warning flex size-12 items-center justify-center rounded-full">
          <Icon icon={Plug} size={24} />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="font-display m-0 text-[20px] font-semibold">{t(MAINTENANCE)}</h1>
          <p className="text-muted-foreground m-0 text-pretty text-[12.5px] leading-[1.65]">
            {t(
              message(
                'Nội dung bạn đang nhập vẫn còn nguyên.',
                'What you were typing is still here.',
                '입력 중이던 내용은 그대로 남아 있습니다.',
              ),
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="m-0 text-[12.5px] font-semibold">
          {probing
            ? t(message('Đang kiểm tra…', 'Checking…', '확인 중…'))
            : t(
                message(
                  `Tự kiểm tra lại sau ${countdown((nextProbeAt ?? now) - now)}`,
                  `Checking again in ${countdown((nextProbeAt ?? now) - now)}`,
                  `${countdown((nextProbeAt ?? now) - now)} 후 다시 확인합니다`,
                ),
              )}
        </p>
        <p className="text-muted-foreground m-0 text-[11.5px] leading-[1.65]">
          {t(
            message(
              `Ngưng ${t0(howLong(now - (since ?? now)), 'vi')}`,
              `Down for ${t0(howLong(now - (since ?? now)), 'en')}`,
              `중단 ${t0(howLong(now - (since ?? now)), 'ko')}`,
            ),
          )}
          {probes > 0 &&
            ` · ${t(message(`đã kiểm ${probes} lần`, `checked ${probes} ${probes === 1 ? 'time' : 'times'}`, `${probes}회 확인`))}`}
        </p>
      </div>

      <Button variant="ghost" size="lg" onClick={() => void probeServer()} disabled={probing}>
        <Icon icon={RefreshCw} />
        {t(message('Kiểm tra ngay', 'Check now', '지금 확인'))}
      </Button>
    </>
  )
}

function Recovered() {
  const since = useServerHealth((s) => s.since)
  const { t } = useI18n()

  return (
    <div className="flex flex-col gap-4">
      <span className="bg-success/15 text-success flex size-12 items-center justify-center rounded-full">
        <Icon icon={CircleCheck} size={24} />
      </span>
      <div className="flex flex-col gap-2">
        <h1 className="font-display m-0 text-[20px] font-semibold">{t(RECONNECTED)}</h1>
        <p className="text-muted-foreground m-0 text-pretty text-[12.5px] leading-[1.65]">
          {t(
            message(
              `Gián đoạn ${t0(howLong(Date.now() - (since ?? Date.now())), 'vi')}. Bạn có thể làm tiếp.`,
              `Down for ${t0(howLong(Date.now() - (since ?? Date.now())), 'en')}. You can carry on.`,
              `${t0(howLong(Date.now() - (since ?? Date.now())), 'ko')} 동안 중단되었습니다. 계속 작업하셔도 됩니다.`,
            ),
          )}
        </p>
      </div>
    </div>
  )
}

/** Mounted once, at the root, beside the toasts. Renders nothing at all until
 *  the server stops answering. */
export function ServerDown() {
  const { t } = useI18n()
  const themeMode = useThemeMode()
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
    /* Nothing here heals on its own: `queryClient` runs with `retry: false`, and
       reconnect refetch watches the browser's network, not this server, so every
       panel that failed during the outage is holding an error until asked again. This is that ask — without
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
      aria-label={t(health === 'down' ? MAINTENANCE : RECONNECTED)}
    >
      <GlassCard className="flex w-full max-w-[420px] flex-col gap-6 p-8">
        <img
          src={themeMode !== 'aurora' ? wordmarkBlue : wordmarkLight}
          alt="PV One"
          className="h-10 self-start object-contain"
        />
        {health === 'down' ? <Waiting /> : <Recovered />}
      </GlassCard>
    </div>
  )
}
