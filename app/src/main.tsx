import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ThemeKit } from '@/kit/theme-kit'
import { HomePage } from '@/pages/home'
import '@/styles/globals.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/kit" element={<ThemeKit />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
