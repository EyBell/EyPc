/** 主窗 Renderer 入口：挂载 App.vue，并先加载 V7 token 再加载主界面样式。 */
import { createApp } from 'vue'
import App from './App.vue'
import './styles/design-system-v7.css'
import './styles/app.css'
import './styles/companion-counter.css'
import './styles/codex.css'

createApp(App).mount('#app')
