import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
import { handleDevPortApi } from './src/platform/devPortServer'

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
    emptyOutDir: true
  }
})
