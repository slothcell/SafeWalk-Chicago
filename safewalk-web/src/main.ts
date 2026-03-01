import { createApp } from 'vue'
import PrimeVue from 'primevue/config'
import App from './App.vue'
import { SafeWalkPreset } from './theme/SafeWalkPreset'

const app = createApp(App)

app.use(PrimeVue, {
  theme: {
    preset: SafeWalkPreset
  }
})

app.mount('#app')