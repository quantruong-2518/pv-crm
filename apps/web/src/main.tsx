import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/routes'
import '@/styles/app.css'

const host = document.getElementById('root')
if (!host) throw new Error('#root không tồn tại trong index.html')

createRoot(host).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
