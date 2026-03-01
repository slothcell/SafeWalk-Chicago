<template>
  <div class="search">
    <InputText
      v-model="destination"
      placeholder="Where do you want to go?"
      class="w-full large-input"
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
  width: 80%;
  max-width: 600px;
}
.large-input .p-inputtext {
  font-size: 1.25rem;
  padding: 0.75rem;
}
</style>