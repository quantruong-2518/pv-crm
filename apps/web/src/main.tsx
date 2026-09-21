import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ServerDown } from '@/app/api'
import { startAuthLifecycle } from '@/app/auth'
import { closeMasMail } from '@/app/mas-mail-composer'
import { queryClient } from '@/app/query-client'
import { AppToasts } from '@/components/app-toasts'
import { MasMailComposerHost } from '@/components/mas-mail-composer-host'
import { router } from '@/routes'
import '@/styles/app.css'

const host = document.getElementById('root')
if (!host) throw new Error('#root không tồn tại trong index.html')

/** Vòng đời phiên bật TRƯỚC khi React dựng cây, và ở ngoài `StrictMode`.
 *
 *  Ngoài React vì nó phải chạy cả khi không màn nào mở (tab nền để đó). Trước
 *  `render` vì đồng hồ hết hạn phải tính từ lúc app có mặt, không phải từ lúc
 *  một component nào đó tình cờ mount. Và không nằm trong `useEffect` vì
 *  `StrictMode` gắn–nhả–gắn lại effect ở dev: nghe hai lần thì mỗi cú chạm màn
 *  gia hạn hai lần và mỗi tin đa tab xử lý hai lần. */
startAuthLifecycle()

/* The composer host sits outside the router so every screen reaches the same
   instance. Close it when the location key changes, matching the old local
   modal's unmount behaviour and keeping a draft from following navigation. */
let mailRouteKey = router.state.location.key
router.subscribe((state) => {
  if (state.location.key === mailRouteKey) return
  mailRouteKey = state.location.key
  closeMasMail()
})

createRoot(host).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <MasMailComposerHost />
      <AppToasts />
      {/* Above every screen and every other layer: when the server is gone, the
          session lock cannot let anyone back in either. See `server-down.tsx`. */}
      <ServerDown />
    </QueryClientProvider>
  </StrictMode>,
)
