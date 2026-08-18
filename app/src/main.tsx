import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeKit } from '@/kit/theme-kit'
import '@/styles/globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeKit />
  </StrictMode>,
)
