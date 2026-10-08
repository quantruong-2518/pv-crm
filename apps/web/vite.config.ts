import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { pvAliases } from '../../alias.config'

const buildId = process.env.VERCEL_GIT_COMMIT_SHA ?? Date.now().toString(36)

/** Writes `version.json` beside the bundle so open tabs can see a newer deploy. */
const versionFile: Plugin = {
  name: 'pv-version-file',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ id: buildId }),
    })
  },
}

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [react(), tailwindcss(), versionFile],
  server: {
    // Keep browser requests on the web origin, including forwarded dev ports.
    // Only Vite connects to the local API; the browser needs one exposed port.
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://localhost:4123',
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
