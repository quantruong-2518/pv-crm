import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RotateCcw, Save, TriangleAlert } from '@pv/ui'
import { Button, EmptyState, GlassCard, Icon, MetaPill, ScreenHeader, Skeleton } from '@pv/ui'
import type { NotificationKind } from '@pv/contracts'
import { SettingsShell } from '@/components/settings-shell'
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
import { message, useI18n } from '@/app/i18n'

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

const TEXT = {
  couldNotSaveNotificationSettings: message(
    'Không lưu được cài đặt thông báo. Thử lại.',
    'Could not save notification settings. Please try again.',
    '알림 설정을 저장하지 못했습니다. 다시 시도해 주세요.',
  ),
  notificationSettingsSaved: message(
    'Đã lưu cài đặt thông báo',
    'Notification settings saved',
    '알림 설정을 저장했습니다',
  ),
  chooseWhichRolesReceiveEach: message(
    'Chọn vai trò nhận từng loại thông báo; loại quan trọng hiện ngay ở góc màn hình.',
    'Choose which roles receive each notification. Important notifications also appear as a toast.',
    '각 알림을 받을 역할을 선택하세요. 중요 알림은 화면 토스트로도 표시됩니다.',
  ),
}

export function AdminNotificationsPage() {
  const { t } = useI18n()
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
          : t(TEXT.couldNotSaveNotificationSettings)
        setFailure(
          saved > 0
            ? t(
                message(
                  `Đã lưu ${saved} loại thông báo. ${said}`,
                  `Saved ${saved} notification types. ${said}`,
                  `알림 유형 ${saved}개를 저장했습니다. ${said}`,
                ),
              )
            : said,
        )
        return
      }
    }
    setEdited(null)
    toastDone(t(TEXT.notificationSettingsSaved))
  }

  return (
    <SettingsShell>
      <ScreenHeader
        title={t(message('Thông báo theo vai trò', 'Notifications by role', '역할별 알림'))}
        description={t(TEXT.chooseWhichRolesReceiveEach)}
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
                  <span className="tnum">
                    {t(
                      message(
                        `Chưa lưu ${dirty.length} loại thông báo`,
                        `${dirty.length} notification types have unsaved changes`,
                        `저장되지 않은 알림 유형 ${dirty.length}개`,
                      ),
                    )}
                  </span>
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
              {t(message('Hoàn tác', 'Undo changes', '변경 취소'))}
            </Button>
            <Button
              size="lg"
              type="button"
              disabled={dirty.length === 0 || save.isPending}
              onClick={() => void saveDirty()}
            >
              <Icon icon={Save} size={16} />
              {save.isPending
                ? t(message('Đang lưu…', 'Saving…', '저장 중…'))
                : t(message('Lưu thay đổi', 'Save changes', '변경 사항 저장'))}
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
              tone="danger"
              icon={TriangleAlert}
              message={`${t(message('Không tải được cài đặt thông báo.', 'Could not load notification settings.', '알림 설정을 불러오지 못했습니다.'))} ${
                isApiError(error)
                  ? userMessage(error)
                  : t(message('Thử lại.', 'Please try again.', '다시 시도해 주세요.'))
              }`}
              action={{
                label: t(message('Thử lại', 'Try again', '다시 시도')),
                onClick: () => void refetch(),
              }}
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
    </SettingsShell>
  )
}

export default AdminNotificationsPage
