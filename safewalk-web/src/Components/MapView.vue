<template>
  <div ref="mapContainer" class="map"></div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import mapboxgl from 'mapbox-gl'
import { scoreRoutes } from '@/composables/useSafetyRouting'

mapboxgl.accessToken = 'YOUR_MAPBOX_TOKEN'

const mapContainer = ref<HTMLDivElement | null>(null)

type SafetyLevel = 'safe' | 'moderate' | 'avoid'

const colorMap: Record<SafetyLevel, string> = {
  safe: '#5E6C5B',       // Forest Green
  moderate: '#686867',   // Storm Cloud
  avoid: '#162A2C'       // Midnight
}

function getSafetyLevel(score: number): SafetyLevel {
  if (score < 3) return 'safe'
  if (score < 6) return 'moderate'
  return 'avoid'
}

onMounted(async () => {
  const map = new mapboxgl.Map({
    container: mapContainer.value as HTMLElement,
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-87.6298, 41.8781], // Chicago
    zoom: 13
  })

  map.addControl(new mapboxgl.NavigationControl())

  map.on('load', async () => {
    const origin: [number, number] = [-87.6298, 41.8781]
    const dest: [number, number] = [-87.6500, 41.9000]

    // Get ranked routes
    const ranked = await scoreRoutes(origin, dest)

    ranked.forEach((routeScore, index) => {
      const route = routeScore.routeData
      const safetyLevel = getSafetyLevel(routeScore.totalScore)

      const sourceId = `route-source-${index}`
      const layerId = `route-layer-${index}`

      map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: route.geometry
        }
      })

      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': colorMap[safetyLevel],
          'line-width': index === 0 ? 7 : 4,
          'line-opacity': index === 0 ? 1 : 0.5
        }
      })
    })
  })
})
</script>

<style scoped>
.map {
  height: 100vh;
  width: 100%;
}
</style>