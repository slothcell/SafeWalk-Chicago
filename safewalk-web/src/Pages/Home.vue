<template>
  <div class="home-container">
    <!-- Map view -->
    <MapView ref="mapRef" :startLocation="userLocation" :endLocation="endLocation" />
    <SOSButton />

    <!-- Top search bar: Start & End inputs -->
    <div class="search-container">
      <div class="search-box">
        <input
          v-model="startInput"
          type="text"
          placeholder="Starting From (uses current location)"
          @keyup.enter="handleSearch"
          class="input-field start-input"
        />
        <input
          v-model="endInput"
          type="text"
          placeholder="Where to?"
          @keyup.enter="handleSearch"
          class="input-field end-input"
        />
        <button @click="handleSearch" class="search-btn">Go</button>
      </div>
    </div>

    <!-- Routes list on the right -->
    <div class="routes-list p-3" v-if="routes.length && started">
      <h3>Ranked Routes</h3>
      <ul>
        <li v-for="(r, i) in routes" :key="i" class="route-item">
          <div>
            <strong>#{{ i + 1 }}</strong>
            <span style="margin-left:8px">Score: {{ r.totalScore.toFixed(1) }}</span>
          </div>
          <div style="margin-top:6px">
            <button class="p-button p-component p-button-text" @click="selectRoute(i)">Show</button>
          </div>
        </li>
      </ul>
      <div class="arrival-control p-mt-3">
        <button class="p-button p-component p-button-primary" @click="announceArrival">I've arrived</button>
      </div>
    </div>
    <ArrivalOverlay ref="arrivalRef" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import MapView from '@/Components/MapView.vue'
import SOSButton from '@/Components/SOSButton.vue'
import ArrivalOverlay from '@/Components/ArrivalOverlay.vue'
import { scoreRoutes, scoreRoutesFromDirections } from '@/Composables/useSafetyRouting'

const mapRef = ref<any>(null)
const routes = ref<any[]>([])
const started = ref(false)
const arrivalRef = ref<any>(null)

const startInput = ref('')
const endInput = ref('')
const userLocation = ref<[number, number] | null>(null)
const endLocation = ref<[number, number] | null>(null)

const GOOGLE_KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY as string) || ''

// Get user's current location on mount
onMounted(() => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        userLocation.value = [longitude, latitude]
        console.log('User location:', userLocation.value)
      },
      (err) => {
        console.warn('Geolocation error:', err)
        // Default to Chicago if geolocation fails
        userLocation.value = [-87.6298, 41.8781]
      }
    )
  } else {
    console.warn('Geolocation not supported')
    userLocation.value = [-87.6298, 41.8781]
  }
})

async function geocode(query: string): Promise<[number, number] | null> {
  if (!GOOGLE_KEY) return null
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GOOGLE_KEY}`
  try {
    const res = await fetch(url)
    const data = await res.json()
    console.log('Geocode response for "' + query + '":', data)
    if (!data.results || data.results.length === 0) {
      console.error('No geocoding results found')
      return null
    }
    const loc = data.results[0].geometry.location
    console.log('Geocoded location:', loc)
    return [loc.lng, loc.lat]
  } catch (err) {
    console.error('Geocode error:', err)
    return null
  }
}

const handleSearch = async () => {
  console.log('Search initiated. userLocation:', userLocation.value, 'endInput:', endInput.value, 'startInput:', startInput.value)
  
  if (!GOOGLE_KEY) {
    alert('ERROR: VITE_GOOGLE_MAPS_KEY is not set. Please add it to .env.local')
    console.error('Missing VITE_GOOGLE_MAPS_KEY in environment')
    return
  }

  if (!userLocation.value) {
    alert('Waiting for location... Please try again in a moment.')
    console.log('User location not available yet')
    return
  }

  if (!endInput.value.trim()) {
    alert('Please enter a destination')
    return
  }

  // Resolve start location: use input or current location
  let origin = userLocation.value
  if (startInput.value.trim()) {
    console.log('Geocoding start location:', startInput.value)
    const resolvedStart = await geocode(startInput.value)
    if (!resolvedStart) {
      alert('Start location not found')
      return
    }
    origin = resolvedStart
  }

  // Resolve end location
  console.log('Geocoding destination:', endInput.value)
  const dest = await geocode(endInput.value)
  if (!dest) {
    alert('Destination not found')
    return
  }

  endLocation.value = dest
  console.log('Origin:', origin, 'Destination:', dest)

  try {
    console.log('Calling directions and scoring...')
    let ranked: any[] = []
    // Prefer client-side DirectionsService provided by MapView
    if (mapRef.value && typeof mapRef.value.getDirections === 'function') {
      try {
        const directions = await mapRef.value.getDirections(origin, dest)
        console.log('DirectionsService returned', directions.length, 'routes')
        ranked = await scoreRoutesFromDirections(directions)
      } catch (err) {
        console.error('Failed to get directions from MapView:', err)
        alert('Failed to compute directions: ' + (err instanceof Error ? err.message : String(err)))
        return
      }
    } else {
      console.log('No client-side DirectionsService available; falling back to HTTP Directions API')
      ranked = await scoreRoutes(origin, dest)
    }

    console.log('Routes scored! Count:', ranked.length, 'Data:', ranked)

    // If no routes found, show error
    if (ranked.length === 0) {
      console.warn('No routes returned from scoring. Possible causes:')
      console.warn('1. Directions not returned or are empty')
      console.warn('2. No walking routes exist between these locations')
      console.warn('3. API key invalid or has quota limits')
      alert('No routes found between these locations. Check console for API errors or enable the appropriate Google APIs in Cloud Console.')
      return
    }

    routes.value = ranked
    started.value = true
    if (mapRef.value && mapRef.value.setRoutes) {
      console.log('Setting routes on map...')
      mapRef.value.setRoutes(ranked)
    } else {
      console.error('mapRef.value or setRoutes not available')
    }
  } catch (err) {
    console.error('Error scoring routes:', err)
    alert('Failed to score routes. Error: ' + (err instanceof Error ? err.message : String(err)))
  }
}

function selectRoute(i: number) {
  if (mapRef.value && mapRef.value.highlightRoute) {
    mapRef.value.highlightRoute(i)
  }
}

function announceArrival() {
  if (arrivalRef.value && arrivalRef.value.triggerArrival) {
    arrivalRef.value.triggerArrival()
  }
}
</script>

<style scoped>
.home-container {
  height: 100vh;
  position: relative;
  display: flex;
  flex-direction: column;
}

.search-container {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1001;
  width: 90%;
  max-width: 500px;
}

.search-box {
  display: flex;
  gap: 8px;
  background: white;
  padding: 12px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.input-field {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
}

.input-field:focus {
  border-color: #4285f4;
  box-shadow: 0 0 4px rgba(66, 133, 244, 0.3);
}

.start-input {
  min-width: 140px;
}

.end-input {
  min-width: 140px;
}

.search-btn {
  padding: 10px 24px;
  background: #4285f4;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
}

.search-btn:hover {
  background: #357ae8;
}

.routes-list {
  position: absolute;
  right: 12px;
  top: 80px;
  width: 240px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 6px;
  z-index: 1000;
  max-height: 60vh;
  overflow-y: auto;
}

.route-item {
  padding: 8px 12px;
  border-bottom: 1px solid #eee;
}

.arrival-control {
  text-align: center;
}
</style>