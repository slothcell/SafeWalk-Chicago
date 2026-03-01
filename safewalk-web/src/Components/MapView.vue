<template>
  <div ref="mapContainer" class="map"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { scoreRoutes } from '@/Composables/useSafetyRouting'

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string) || 'YOUR_MAPBOX_TOKEN'
mapboxgl.accessToken = MAPBOX_TOKEN

const mapContainer = ref<HTMLDivElement | null>(null)
let map: mapboxgl.Map | null = null

type SafetyLevel = 'safe' | 'moderate' | 'avoid'

const colorMap: Record<SafetyLevel, string> = {
  safe: '#5E6C5B',
  moderate: '#686867',
  avoid: '#162A2C'
}

function getSafetyLevel(score: number): SafetyLevel {
  if (score < 3) return 'safe'
  if (score < 6) return 'moderate'
  return 'avoid'
}

onMounted(async () => {
  if (!mapContainer.value) return

  map = new mapboxgl.Map({
    container: mapContainer.value as HTMLElement,
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-87.6298, 41.8781],
    zoom: 13
  })

  map.addControl(new mapboxgl.NavigationControl())

  map.on('load', async () => {
    const origin: [number, number] = [-87.6298, 41.8781]
    const dest: [number, number] = [-87.6500, 41.9000]

    const ranked = await scoreRoutes(origin, dest)

    ranked.forEach((routeScore, index) => {
      const route = (routeScore as any).routeData
      const safetyLevel = getSafetyLevel(routeScore.totalScore)

      const sourceId = `route-source-${index}`
      const layerId = `route-layer-${index}`

      const feature: GeoJSON.Feature = {
        type: 'Feature',
        geometry: route.geometry as GeoJSON.Geometry,
        properties: {
          score: routeScore.totalScore,
          index
        }
      }

      const featureCollection: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: [feature]
      }

      if (!map) return

      const existingSource = map.getSource(sourceId)
      if (!existingSource) {
        map.addSource(sourceId, {
          type: 'geojson',
          data: featureCollection
        })
      } else if ('setData' in existingSource) {
        ;(existingSource as mapboxgl.GeoJSONSource).setData(featureCollection)
      }

      if (!map.getLayer(layerId)) {
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
      }
    })
  })
})

onUnmounted(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<style scoped>
.map {
  height: 100vh;
  width: 100%;
}
</style>