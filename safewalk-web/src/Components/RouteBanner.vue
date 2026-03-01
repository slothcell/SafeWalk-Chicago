<template>
  <div class="banner">
    <p>Time Remaining: {{ timeLeft }} mins</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";

const timeLeft = ref(15);

onMounted(() => {
  setInterval(() => {
    if (timeLeft.value > 0) timeLeft.value--;
  }, 60000);
});
</script>

<style scoped>
.banner {
  position: fixed;
  bottom: 90px;
  width: 100%;
  background: black;
  color: white;
  padding: 15px;
}
</style>