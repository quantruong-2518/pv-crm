import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RotateCcw, Save, TriangleAlert } from '@pv/ui'
import {
  AppShell,
  Button,
  EmptyState,
  GlassCard,
  Icon,
  MetaPill,
  ScreenHeader,
  ScreenLayout,
  Skeleton,
} from '@pv/ui'
import type { NotificationKind } from '@pv/contracts'
import { useAppChrome } from '@/app/chrome'
import { isApiError, userMessage } from '@/app/api'
import { toastDone } from '@/app/toast'
import {
  dirtyKinds,
  draftOf,
  indexOf,
  notificationPolicyQuery,
  setHears,
  setImportant,
  useSavePolicy,
  type PolicyDraft,
} from '@/data/notification-policy'
import { PolicyGrid } from './admin-notifications-parts'

/** One Core · Admin · Notifications — which role hears which kind, and which
 *  kinds pop up (ADR 0093 §2).
 *
 *  No ContextRail (law 10): a notification kind holds no object code, the same
 *  exception `users.tsx` argues for the people book.
 *
 *  One draft, saved kind by kind, as `roles.tsx` does: a kind that lands stays
 *  saved even if a later one is refused, and the refusal prints the server's
 *  own sentence. */

const NO_KINDS: NotificationKind[] = []

export function AdminNotificationsPage() {
  const chrome = useAppChrome()
  const { data, isPending, error, refetch } = useQuery(notificationPolicyQuery)
  const save = useSavePolicy()

  const index = useMemo(() => (data ? indexOf(data) : null), [data])
  const server = useMemo(() => (index ? draftOf(index) : null), [index])

  /* `null` = nothing edited, so a refetch after a save flows straight through. */
  const [edited, setEdited] = useState<PolicyDraft | null>(null)
  const draft = edited ?? server
  const dirty = useMemo(
    () => (server && draft ? dirtyKinds(server, draft) : NO_KINDS),
    [server, draft],
  )
  const [failure, setFailure] = useState('')

  const edit = (next: (d: PolicyDraft) => PolicyDraft) => {
    if (!draft) return
    setFailure('')
    setEdited(next(draft))
  }

  const saveDirty = async () => {
    if (!draft || save.isPending) return
    setFailure('')
    let saved = 0
    for (const kind of dirty) {
      try {
        await save.mutateAsync({ kind, ...draft[kind] })
        saved++
      } catch (refusal) {
        /* Say what did land: the loop commits kind by kind. */
        const said = isApiError(refusal)
          ? userMessage(refusal)
          : 'Không lưu được cài đặt thông báo. Thử lại.'
        setFailure(saved > 0 ? `Đã lưu ${saved} loại thông báo. ${said}` : said)
        return
      }
    }
    setEdited(null)
    toastDone('Đã lưu cài đặt thông báo')
  }

  return (
    <AppShell {...chrome.shell}>
      <ScreenLayout>
        <ScreenHeader
          kicker="One Core · Quản trị"
          title="Thông báo theo vai trò"
          description="Chọn vai trò nhận từng loại thông báo; loại quan trọng hiện ngay ở góc màn hình."
          meta={
            failure || dirty.length > 0 ? (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {failure ? (
                  <span
                    role="alert"
                    className="text-destructive-foreground text-[11.5px] leading-[1.5]"
                  >
                    {failure}
                  </span>
                ) : null}
                {dirty.length > 0 ? (
                  <MetaPill tone="warning">
                    <span className="tnum">{`Chưa lưu ${dirty.length} loại thông báo`}</span>
                  </MetaPill>
                ) : null}
              </span>
            ) : undefined
          }
          actions={
            <>
              <Button
                size="lg"
                variant="ghost"
                type="button"
                disabled={dirty.length === 0 || save.isPending}
                onClick={() => {
                  setEdited(null)
                  setFailure('')
                }}
              >
                <Icon icon={RotateCcw} size={16} />
                Hoàn tác
              </Button>
              <Button
                size="lg"
                type="button"
                disabled={dirty.length === 0 || save.isPending}
                onClick={() => void saveDirty()}
              >
                <Icon icon={Save} size={16} />
                {save.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
              </Button>
            </>
          }
        />

        {/* Law 8: the grid is a long table, so the card draws glass-b. */}
        <GlassCard variant="b" className="overflow-hidden">
          <div className="p-4 lg:p-5">
            {isPending ? (
              <div className="flex flex-col gap-3">
                <Skeleton height={48} className="w-full" />
                <Skeleton height={48} className="w-full" />
                <Skeleton height={48} className="w-full" />
              </div>
            ) : error || !draft || !index ? (
              <EmptyState
                icon={TriangleAlert}
                message={`Không tải được cài đặt thông báo. ${
                  isApiError(error) ? userMessage(error) : 'Thử lại.'
                }`}
                action={{ label: 'Thử lại', onClick: () => void refetch() }}
                className="py-12"
              />
            ) : (
              /* The grid scrolls sideways here, never the page (tablet). */
              <div className="overflow-x-auto">
                <PolicyGrid
                  draft={draft}
                  index={index}
                  saving={save.isPending}
                  onHears={(kind, roleId, hears) => edit((d) => setHears(d, kind, roleId, hears))}
                  onImportant={(kind, on) => edit((d) => setImportant(d, kind, on))}
                />
              </div>
            )}
          </div>
        </GlassCard>
      </ScreenLayout>
    </AppShell>
  )
}

export default AdminNotificationsPage
