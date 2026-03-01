<template>
  <div class="search">
    <InputText
      v-model="destination"
      placeholder="Where do you wanna go?"
      class="w-full"
      @keyup.enter="emitSearch"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import InputText from 'primevue/inputtext'

const destination = ref('')

const emit = defineEmits<{
  (e: 'search', value: string): void
}>()

const emitSearch = () => {
  emit('search', destination.value)
}
</script>

<style scoped>
.search {
  position: absolute;
  top: 120px;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
}
</style>