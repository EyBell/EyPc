import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const here=path.dirname(fileURLToPath(import.meta.url))
await build({configFile:false,publicDir:false,define:{'process.env.NODE_ENV':'"production"'},plugins:[vue()],logLevel:'warn',build:{outDir:path.join(here,'real-build'),emptyOutDir:false,cssCodeSplit:false,lib:{entry:path.join(here,'real-ball-entry.js'),formats:['es'],fileName:()=> 'real-ball.js',cssFileName:'real-ball'},rollupOptions:{output:{assetFileNames:'[name][extname]'}}}})
