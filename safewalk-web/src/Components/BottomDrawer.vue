<template>
  <Drawer v-model:visible="visible" position="bottom">
    <Button
      label="I Feel Unsafe"
      severity="warning"
      class="w-full"
      @click="alertContacts"
    />
  </Drawer>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import Drawer from 'primevue/drawer'
import Button from 'primevue/button'

const visible = ref(true)

const alertContacts = () => {
  alert('Location sent to emergency contacts.')
}
</script>