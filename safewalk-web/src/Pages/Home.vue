<template>
  <div>
    <MapView />
    <SOSButton />
    <SearchBar @search="handleSearch" />
    <BottomDrawer />
  </div>
</template>

<script setup lang="ts">
import MapView from '@/components/MapView.vue'
import SOSButton from '@/components/SOSButton.vue'
import SearchBar from '@/components/SearchBar.vue'
import BottomDrawer from '@/components/BottomDrawer.vue'

const handleSearch = (destination: string) => {
  console.log('User destination:', destination)
}
</script>