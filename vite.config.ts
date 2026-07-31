import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import { handleDevPortApi } from './src/platform/devPortServer'

function stableVendorChunk(id: string) {
  const normalizedId = id.replaceAll('\\', '/')
  if (!normalizedId.includes('/node_modules/')) return undefined
  if (normalizedId.includes('/.pnpm/vue@') || normalizedId.includes('/.pnpm/@vue+')) return 'vendor-vue'
  if (normalizedId.includes('/.pnpm/marked@')) return 'vendor-markdown'
  if (normalizedId.includes('/.pnpm/@lucide+vue@')) return 'vendor-icons'
  return undefined
}

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'eypc-dev-port-api',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!handleDevPortApi(req, res)) next()
        })
      }
    },
    vue()
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        float: resolve(import.meta.dirname, 'float.html')
      },
      output: {
        manualChunks: stableVendorChunk
      }
    }
  }
})
