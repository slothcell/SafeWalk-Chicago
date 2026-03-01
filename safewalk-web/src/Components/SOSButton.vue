<template>
  <Button
    icon="pi pi-exclamation-triangle"
    severity="danger"
    rounded
    class="sos"
    @click="call911"
  />
</template>

<script setup lang="ts">
import Button from 'primevue/button'

const call911 = () => {
  window.location.href = 'tel:911'
}
</script>

<style scoped>
.sos {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 1000;
}
</style>