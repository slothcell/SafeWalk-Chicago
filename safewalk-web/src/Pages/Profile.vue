<template>
  <div class="profile p-4">
    <h2>Profile</h2>
    <div class="p-fluid">
      <label for="name">Name</label>
      <input id="name" type="text" placeholder="Your name" class="p-inputtext p-component w-full" />
    </div>
    <div class="p-mt-3">
      <button class="p-button p-component p-button-outlined">Save</button>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.profile { max-width: 720px; margin: 24px auto; }
</style>
