import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/Pages/Home.vue'
import Profile from '@/Pages/Profile.vue'

const routes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/profile', name: 'Profile', component: Profile }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
