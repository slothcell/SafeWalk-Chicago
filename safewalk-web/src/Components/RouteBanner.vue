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
  bottom: 20px;
  left: 20px;
  width: auto;
  background: black;
  color: white;
  padding: 10px 15px;
  border-radius: 8px;
}
</style>