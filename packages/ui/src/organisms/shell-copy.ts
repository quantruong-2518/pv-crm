import type { ThemeMode } from '../ui/theme-switch'
import type { BottomNavKey } from './bottom-nav'

/** Visible and accessible shell text supplied by the product using @pv/ui. */
export type ShellCopy = {
  navigation: string
  navItems: Record<BottomNavKey, string>
  locked: string
  unread: string
  pending: string
  hasUnread: string
  theme: string
  themeNames: Record<ThemeMode, string>
  openAccount: (name: string) => string
  accountOf: (name: string) => string
  searchScreens: string
  searchNoScreens: (query: string) => string
  searchScope: string
  searchAll: string
  closeToast: string
  closeBanner: string
}

export const DEFAULT_SHELL_COPY: ShellCopy = {
  navigation: 'Điều hướng chính',
  navItems: { home: 'Trang chủ', approvals: 'Duyệt', search: 'Tìm', assistant: 'Trợ lý' },
  locked: 'chưa mở',
  unread: 'chưa đọc',
  pending: 'đang chờ',
  hasUnread: 'có thông báo chưa đọc',
  theme: 'Giao diện',
  themeNames: { aurora: 'Aurora', stone: 'Đá mịn', porcelain: 'Sứ' },
  openAccount: (name) => `Mở tài khoản của ${name}`,
  accountOf: (name) => `Tài khoản của ${name}`,
  searchScreens: 'Màn hình',
  searchNoScreens: (query) => `Không có màn hình nào tên “${query}”.`,
  searchScope: 'Phạm vi tìm',
  searchAll: 'Tất cả',
  closeToast: 'Đóng thông báo',
  closeBanner: 'Đóng nhắc việc',
}
