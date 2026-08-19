/** @pv/ui — Aurora v2.0 · cửa vào duy nhất của thư viện component.
 *
 *  Thứ tự dưới đây là năm zone của theme kit. Thêm component mới thì thêm vào
 *  đúng zone của nó, và thêm luôn một dòng vào trang kit ở apps/web/src/kit —
 *  component không có mặt trên trang kit coi như chưa tồn tại. */

// ---- lib ----
export * from './lib/cn'
export * from './lib/format'

// ---- assets (logo bản nền tối) ----
export * from './assets'

// ---- Zone 00 · Foundations ----
export * from './layout/aurora-field'
export * from './layout/glass-card'

// ---- Zone 01 · Atoms (A-01 … A-19) ----
export * from './ui/avatar'
export * from './ui/avatar-group'
export * from './ui/badge'
export * from './ui/button'
export * from './ui/channel-tag'
export * from './ui/checkbox'
export * from './ui/chip'
export * from './ui/icon'
export * from './ui/input'
export * from './ui/meta-pill'
export * from './ui/money'
export * from './ui/progress'
export * from './ui/radial-gauge'
export * from './ui/section-title'
export * from './ui/segmented-control'
export * from './ui/select'
export * from './ui/separator'
export * from './ui/skeleton'
export * from './ui/sparkline'
export * from './ui/status-dot'

// ---- Zone 02 · Molecules (M-01 … M-12) ----
export * from './patterns/ai-action'
export * from './patterns/approval-chain'
export * from './patterns/bar-chart'
export * from './patterns/context-rail'
export * from './patterns/data-table'
export * from './patterns/empty-state'
export * from './patterns/nav-item'
export * from './patterns/rich-text'
export * from './patterns/scan-field'
export * from './patterns/search-field'
export * from './patterns/stat-card'
export * from './patterns/timeline'

// ---- Zone 03 · Organisms (O-01 … O-05) ----
export * from './organisms/app-sidebar'
export * from './organisms/approval-card'
export * from './organisms/bottom-nav'
export * from './organisms/brief-card'
export * from './organisms/kiosk-tile'
export * from './organisms/order-lifecycle-card'
export * from './organisms/top-bar'

// ---- Zone 04 · Templates ----
export * from './layout/app-shell'
export * from './layout/drawer'
export * from './layout/assistant-fab'
