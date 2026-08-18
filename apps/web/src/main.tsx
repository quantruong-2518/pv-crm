import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/app/query-client'
import { router } from '@/routes'
import '@/styles/app.css'

const host = document.getElementById('root')
if (!host) throw new Error('#root không tồn tại trong index.html')

createRoot(host).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
