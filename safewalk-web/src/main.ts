import { createApp } from 'vue'
import PrimeVue from 'primevue/config'
import 'primevue/resources/primevue.min.css'
import 'primeicons/primeicons.css'
import App from './App.vue'
import router from './router'
import { SafeWalkPreset } from './Theme/SafeWalkPreset'

const app = createApp(App)

app.use(router)
app.use(PrimeVue, {
  theme: {
    preset: SafeWalkPreset
  }
})

app.mount('#app')