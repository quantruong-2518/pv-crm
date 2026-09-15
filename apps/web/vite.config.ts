import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { pvAliases } from '../../alias.config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Keep browser requests on the web origin, including forwarded dev ports.
    // Only Vite connects to the local API; the browser needs one exposed port.
    proxy: {
      '/api': {
        target: 'http://localhost:4123',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api(?=\/|$)/, ''),
      },
    },
  },
  resolve: {
    // Package workspace trỏ thẳng vào source TS — không có bước build trung
    // gian. Đây là điều kiện để sửa component thấy ngay trên màn.
    alias: pvAliases(new URL('../../', import.meta.url).href),
  },
  build: {
    // Ngân sách bundle: vượt là CI kêu, không phải phát hiện sau khi khách kêu chậm.
    chunkSizeWarningLimit: 400,
  },
})
