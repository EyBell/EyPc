import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import { handleDevPortApi } from './src/platform/devPortServer'
import { buildUtoolsRuntimeIdentity } from './scripts/utools-runtime-identity.mjs'

const runtimeIdentity = buildUtoolsRuntimeIdentity(import.meta.dirname)

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
  define: {
    __EYPC_RUNTIME_IDENTITY_REVISION__: JSON.stringify(runtimeIdentity.revision),
    __EYPC_HOST_ASSET_ID__: JSON.stringify(runtimeIdentity.hostAssetId),
    __EYPC_RENDERER_ASSET_ID__: JSON.stringify(runtimeIdentity.rendererAssetId),
    __EYPC_COMPANION_KERNEL_REVISION__: JSON.stringify(runtimeIdentity.kernelRevision),
    __EYPC_COMPANION_PROVIDER_REGISTRY_REVISION__: JSON.stringify(runtimeIdentity.registryRevision),
    __EYPC_COMPANION_TASK_TOPOLOGY_REVISION__: JSON.stringify(runtimeIdentity.topologyRevision),
    __EYPC_COMPANION_TASK_PACKAGE_REVISION__: JSON.stringify(runtimeIdentity.taskPackageRevision),
    __EYPC_COMPANION_TASK_COMMAND_REVISION__: JSON.stringify(runtimeIdentity.commandRevision),
    __EYPC_COMPANION_TASK_SUBSCRIBE_REVISION__: JSON.stringify(runtimeIdentity.subscribeRevision),
    __EYPC_COMPANION_TASK_ACK_REVISION__: JSON.stringify(runtimeIdentity.ackRevision)
  },
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
        float: resolve(import.meta.dirname, 'float.html'),
        action: resolve(import.meta.dirname, 'action.html')
      },
      output: {
        manualChunks: stableVendorChunk
      }
    }
  }
})
