<template>
  <button class="sos" @click="handleSOS">
    <ion-icon name="warning-outline" style="font-size:24px;color:#fff"></ion-icon>
  </button>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'

let hasIon = false
onMounted(() => {
  if (!document.querySelector('script#ionicons')) {
    const s = document.createElement('script')
    s.id = 'ionicons'
    s.src = 'https://unpkg.com/ionicons@6.0.0/dist/ionicons/ionicons.esm.js'
    s.type = 'module'
    document.head.appendChild(s)
  }
  hasIon = true
})

async function handleSOS() {
  // Try to send an alert to backend (if available) with current position
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const body = { lat: pos.coords.latitude, lon: pos.coords.longitude, timestamp: Date.now() }
      try {
        await fetch('/api/alert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      } catch (e) {
        // backend may not exist; ignore
      }
      // also offer to call 911
      if (confirm('Call 911 now?')) window.location.href = 'tel:911'
    }, () => {
      if (confirm('Unable to get location. Call 911 now?')) window.location.href = 'tel:911'
    })
  } else {
    if (confirm('No geolocation available. Call 911 now?')) window.location.href = 'tel:911'
  }
}
</script>

<style scoped>
.sos {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 1000;
  background: #d9534f;
  border: none;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display:flex;align-items:center;justify-content:center;color:white
}
</style>