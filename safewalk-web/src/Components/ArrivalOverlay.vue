<template>
  <div v-if="show" class="overlay">
    You have arrived!
  </div>
</template>

<script setup>
import { ref } from "vue";

const show = ref(false);

const triggerArrival = () => {
  show.value = true;
  setTimeout(() => {
    show.value = false;
  }, 5000);
};

defineExpose({ triggerArrival });
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.8);
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 24px;
}
</style>