/** Companion 子窗入口：挂载 FloatApp，与主窗隔离，只消费 Kernel Snapshot。 */
import { createApp } from 'vue'
import FloatApp from './FloatApp.vue'
import './styles/design-system-v7.css'
import './styles/companion-counter.css'
import './styles/float.css'

createApp(FloatApp).mount('#float-app')
