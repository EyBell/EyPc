/// <reference types="vite/client" />

declare const __EYPC_RUNTIME_IDENTITY_REVISION__: string
declare const __EYPC_HOST_ASSET_ID__: string
declare const __EYPC_RENDERER_ASSET_ID__: string
declare const __EYPC_COMPANION_KERNEL_REVISION__: string
declare const __EYPC_COMPANION_TASK_PACKAGE_REVISION__: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
