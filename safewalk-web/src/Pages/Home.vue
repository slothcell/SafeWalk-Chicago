<template>
  <div class="home-container">
    <!-- Map view -->
    <MapView ref="mapRef" :startLocation="userLocation" :endLocation="endLocation" />
    <!-- Navigation Prompt -->
    <NavigationPrompt 
      :currentStep="currentStep"
      :currentStepIndex="currentStepIndex"
      :isNavigating="navigationMode"
      :totalSteps="navigationSteps.length"
      :steps="navigationSteps"
    />
    <SOSButton />

    <!-- Weather Widget (Bottom Left) -->
    <div class="weather-widget" v-if="weather">
      <div class="weather-icon">{{ weather.icon }}</div>
      <div class="weather-info">
        <div class="weather-temp">{{ weather.temp }}°F</div>
        <div class="weather-condition">{{ weather.conditionName }}</div>
      </div>
    </div>

    <!-- Crime Checkpoints Panel -->
    <CrimeCheckpoints :checkpoints="crimeCheckpoints" />

    <!-- "I Don't Feel Safe" Button (Bottom Center) -->
    <button class="unsafe-button" @click="handleUnsafe">
      <span class="unsafe-icon">⚠️</span> I Don't Feel Safe
    </button>

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

    <!-- Routes list on the right (hide while navigating) -->
    <div class="routes-list p-3" v-if="routes.length && started && !navigationMode">
      <h3>🛤️ Safest Routes</h3>
      <p class="routes-help-text">⬇️ Lower score = Safer route</p>
      <ul>
        <li v-for="(r, i) in routes" :key="i" class="route-item">
          <div class="route-header">
            <strong>#{{ i + 1 }}</strong>
            <span class="safety-badge" :class="'safety-' + (r.safetyLevel || 'unknown').toLowerCase().replace(' ', '-')">
              {{ r.safetyLevel || 'Unknown' }}
            </span>
          </div>
          <div class="route-metrics">
            <div class="metric">
              <span class="metric-icon">⏱️</span>
              <span class="metric-text">{{ formatTime(r.travelTime) }}</span>
            </div>
            <div class="metric">
              <span class="metric-icon">📏</span>
              <span class="metric-text">{{ r.travelDistance ? (r.travelDistance * 0.000621371).toFixed(1) + ' mi' : 'N/A' }}</span>
            </div>
            <div class="metric">
              <span class="metric-icon">🚨</span>
              <span class="metric-text">{{ r.crimeCount }} incident{{ r.crimeCount !== 1 ? 's' : '' }}</span>
            </div>
          </div>
          <div style="margin-top:8px">
            <button class="p-button p-component p-button-text" @click="selectRoute(i)">Show Route</button>
          </div>
        </li>
      </ul>
      <div class="arrival-control p-mt-3">
        <button v-if="!navigationMode" class="p-button p-component p-button-primary" @click="startNavigation(selectedRouteIndex !== null ? selectedRouteIndex : 0)">Start Route</button>
        <button v-else class="p-button p-component p-button-secondary" @click="endNavigation()">Cancel Navigation</button>
      </div>
    </div>
    <div v-if="showArrivalOverlay" class="arrival-blur-overlay">
      <div class="arrival-message">
        <h2>🎉 You have arrived!</h2>
        <p>Welcome to your destination.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import MapView from '@/Components/MapView.vue'
import SOSButton from '@/Components/SOSButton.vue'
import ArrivalOverlay from '@/Components/ArrivalOverlay.vue'
import CrimeCheckpoints from '@/Components/CrimeCheckpoints.vue'
import NavigationPrompt from '@/Components/NavigationPrompt.vue'
import { scoreRoutes, scoreRoutesFromDirections } from '@/Composables/useSafetyRouting'
import { extractNavigationSteps, findCurrentStepIndex, type NavigationStep } from '@/Composables/useNavigationSteps'

const mapRef = ref<any>(null)
const routes = ref<any[]>([])
const started = ref(false)
const arrivalRef = ref<any>(null)
const crimeCheckpoints = ref<any[]>([])
const weather = ref<{temp: number, condition: string, icon: string, conditionName: string} | null>(null)

const startInput = ref('')
const endInput = ref('')
const userLocation = ref<[number, number] | null>(null)
const endLocation = ref<[number, number] | null>(null)

// Navigation state
const navigationMode = ref(false)
const selectedRouteIndex = ref<number | null>(null)
let navigationWatchId: number | null = null
const navigationSteps = ref<NavigationStep[]>([])
const currentStepIndex = ref(0)
const currentStep = computed(() => navigationSteps.value[currentStepIndex.value] || null)
const showArrivalOverlay = ref(false)

const GOOGLE_KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY as string) || ''
const ARRIVAL_RADIUS_METERS = 50 // Trigger arrival when within 50 meters of destination

// Fetch weather from Open-Meteo API (free, no auth required)
async function fetchWeather(lat: number, lng: number) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=auto`
    const res = await fetch(url)
    const data = await res.json()
    
    if (data.current) {
      // Convert Celsius to Fahrenheit: F = (C * 9/5) + 32
      const tempC = data.current.temperature_2m
      const temp = Math.round((tempC * 9/5) + 32)
      const conditions: {[key: number]: {icon: string, name: string}} = {
        0: {icon: '☀️', name: 'Clear'},
        1: {icon: '🌤️', name: 'Mostly Clear'},
        2: {icon: '⛅', name: 'Partly Cloudy'},
        3: {icon: '☁️', name: 'Cloudy'},
        45: {icon: '🌫️', name: 'Foggy'},
        48: {icon: '🌫️', name: 'Foggy'},
        51: {icon: '🌧️', name: 'Drizzle'},
        53: {icon: '🌧️', name: 'Drizzle'},
        55: {icon: '🌧️', name: 'Drizzle'},
        61: {icon: '🌧️', name: 'Rain'},
        63: {icon: '🌧️', name: 'Rain'},
        65: {icon: '🌧️', name: 'Heavy Rain'},
        71: {icon: '🌨️', name: 'Snow'},
        73: {icon: '🌨️', name: 'Snow'},
        75: {icon: '🌨️', name: 'Snow'},
        80: {icon: '🌦️', name: 'Showers'},
        81: {icon: '🌦️', name: 'Showers'},
        82: {icon: '⛈️', name: 'Heavy Showers'},
        95: {icon: '⛈️', name: 'Thunderstorm'}
      }
      const conditionData = conditions[data.current.weather_code] || {icon: '🌡️', name: 'Mixed'}
      weather.value = { 
        temp, 
        condition: `${conditionData.icon} ${conditionData.name}`,
        icon: conditionData.icon,
        conditionName: conditionData.name
      }
      console.log('[Weather] Updated weather:', weather.value)
    }
  } catch (err) {
    console.warn('[Weather] Fetch error:', err)
  }
}

// Get user's current location on mount
onMounted(() => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        userLocation.value = [longitude, latitude]

        // fetch weather whenever we successfully obtain a location
        fetchWeather(latitude, longitude)
        
        // Check if user has arrived at destination during navigation
        if (navigationMode.value && endLocation.value) {
          const distance = calculateDistance([longitude, latitude], endLocation.value)
          console.log(`[Navigation] Distance to destination: ${(distance * 1000).toFixed(0)}m`)
          
          if (distance * 1000 <= ARRIVAL_RADIUS_METERS) {
            console.log('[Navigation] User reached destination!')
            endNavigation()
          }
        }
      },
      (err) => {
        console.warn('Geolocation error:', err)
        // Default to Chicago if geolocation fails
        userLocation.value = [-87.6298, 41.8781]
        fetchWeather(41.8781, -87.6298)
        displayInitialCrimeHeatmap(41.8781, -87.6298)
      }
    )
  } else {
    console.warn('Geolocation not supported')
    userLocation.value = [-87.6298, 41.8781]
    fetchWeather(41.8781, -87.6298)
    displayInitialCrimeHeatmap(41.8781, -87.6298)
  }
})

async function displayInitialCrimeHeatmap(lat: number, lng: number) {
  // Wait a moment for the map to initialize
  await new Promise(resolve => setTimeout(resolve, 500))
  
  // Create bounding box: ~5km radius around current location
  const radiusInDegrees = 0.05 // ~5km at equator
  const minLat = lat - radiusInDegrees
  const maxLat = lat + radiusInDegrees
  const minLng = lng - radiusInDegrees
  const maxLng = lng + radiusInDegrees
  
  const bbox = `${minLat},${minLng},${maxLat},${maxLng}`
  
  console.log('Displaying initial crime heatmap around:', {lat, lng, bbox})
  
  // Display heatmap on the map
  if (mapRef.value && typeof mapRef.value.displayCrimeHeatmap === 'function') {
    try {
      await mapRef.value.displayCrimeHeatmap(bbox)
      console.log('Initial crime heatmap displayed')
    } catch (err) {
      console.warn('Error displaying initial heatmap:', err)
    }
  } else {
    console.warn('mapRef or displayCrimeHeatmap not available')
  }
}

// Calculate distance between two coordinates using Haversine formula (returns km)
function calculateDistance(coord1: [number, number], coord2: [number, number]): number {
  const [lon1, lat1] = coord1
  const [lon2, lat2] = coord2
  const R = 6371 // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

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
      
      // Display crime checkpoints for the area
      if (origin && dest) {
        const minLat = Math.min(origin[1], dest[1])
        const maxLat = Math.max(origin[1], dest[1])
        const minLng = Math.min(origin[0], dest[0])
        const maxLng = Math.max(origin[0], dest[0])
        
        // Expand bbox to show more context
        const padding = 0.05
        const bbox = `${minLat - padding},${minLng - padding},${maxLat + padding},${maxLng + padding}`
        
        try {
          console.log('[Home] Importing getCrimeCheckpoints...')
          const { getCrimeCheckpoints } = await import('@/Composables/useSafetyRouting')
          console.log('[Home] Fetching crime checkpoints...')
          const checkpoints = await getCrimeCheckpoints(bbox)
          console.log('[Home] Crime checkpoints received:', checkpoints.length)
          crimeCheckpoints.value = checkpoints
          
          // Display markers on map
          if (mapRef.value && mapRef.value.displayCrimeCheckpoints) {
            console.log('[Home] Calling displayCrimeCheckpoints...')
            await mapRef.value.displayCrimeCheckpoints(bbox)
            console.log('[Home] Crime checkpoints displayed')
          } else {
            console.warn('[Home] mapRef.value or displayCrimeCheckpoints not available')
          }
        } catch (err) {
          console.warn('[Home] Failed to load crime checkpoints:', err)
        }
      }
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

function getSafetyClass(score: number): string {
  if (score <= 0) return 'score-safe'
  if (score < 10) return 'score-moderate'
  if (score < 30) return 'score-caution'
  return 'score-danger'
}

function formatTime(minutes?: number): string {
  if (!minutes || minutes < 1) return '<1 min'
  if (minutes < 60) return `${Math.round(minutes)} min`
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)
  return `${hours}h ${mins}m`
}

function announceArrival() {
  if (arrivalRef.value && arrivalRef.value.triggerArrival) {
    arrivalRef.value.triggerArrival()
  }
}

function handleUnsafe() {
  if (!userLocation.value) {
    alert('Getting your location...')
    return
  }
  
  const confirmed = confirm('Alert nearby contacts that you don\'t feel safe?\n\nYour location will be sent to emergency contacts.')
  if (confirmed) {
    console.log('[Safety Alert] User marked unsafe at location:', userLocation.value)
    alert('⚠️ Safety alert sent!\n\nYour emergency contacts have been notified with your location.')
    // TODO: Integrate with actual emergency contact system or emergency services
  }
}

function startNavigation(routeIndex: number) {
  if (!routes.value[routeIndex]) {
    alert('Invalid route selected')
    return
  }

  const selectedRoute = routes.value[routeIndex]
  navigationMode.value = true
  selectedRouteIndex.value = routeIndex

  // Extract turn-by-turn steps from the route directions
  if (selectedRoute.routeData && selectedRoute.routeData.directions) {
    navigationSteps.value = extractNavigationSteps(selectedRoute.routeData.directions)
    currentStepIndex.value = 0
    console.log('[Navigation] Extracted', navigationSteps.value.length, 'navigation steps')
  } else {
    console.warn('[Navigation] No directions data available in route')
  }

  // Pan to the start of the route and draw it on the map
  if (mapRef.value && mapRef.value.startNavigation) {
    console.log('[Home] invoking mapRef.startNavigation')
    mapRef.value.startNavigation(selectedRoute)
  } else {
    console.warn('Map navigation not available')
  }

  // kick off a geolocation watch so we can track movement and detect arrival
  if (navigator.geolocation) {
    console.log('[Navigation] starting geolocation watch')
    navigationWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        userLocation.value = [longitude, latitude]

        // update weather occasionally based on new position
        fetchWeather(latitude, longitude)

        // keep the map centered on the user while navigating
        if (navigationMode.value && mapRef.value && mapRef.value.panTo) {
          mapRef.value.panTo(userLocation.value)
        }

        // Update current step based on user position
        if (navigationMode.value && navigationSteps.value.length > 0) {
          const newStepIndex = findCurrentStepIndex(userLocation.value, navigationSteps.value)
          currentStepIndex.value = newStepIndex
        }

        // arrival check
        if (navigationMode.value && endLocation.value) {
          const distance = calculateDistance([longitude, latitude], endLocation.value)
          console.log(`[Navigation] Distance to destination: ${(distance * 1000).toFixed(0)}m`)
          if (distance * 1000 <= ARRIVAL_RADIUS_METERS) {
            console.log('[Navigation] User reached destination!')
            endNavigation()
          }
        }
      },
      (err) => {
        console.warn('[Navigation] watchPosition error', err)
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    )
  } else {
    console.warn('[Navigation] Geolocation not supported, cannot track progress')
  }
}

function endNavigation() {
  navigationMode.value = false
  selectedRouteIndex.value = null
  navigationSteps.value = []
  currentStepIndex.value = 0
  showArrivalOverlay.value = true
  // clear previous search results so UI resets for next trip
  routes.value = []
  started.value = false
  endLocation.value = null

  // Announce arrival with voice
  try {
    const utterance = new SpeechSynthesisUtterance('You have arrived at your destination')
    utterance.rate = 0.95
    window.speechSynthesis.speak(utterance)
  } catch (err) {
    console.warn('[Navigation] Failed to speak arrival announcement:', err)
  }

  // Stop geolocation watch
  if (navigationWatchId !== null) {
    console.log('[Navigation] clearing geolocation watch')
    navigator.geolocation.clearWatch(navigationWatchId)
    navigationWatchId = null
  }

  // Reset map navigation visuals
  if (mapRef.value && mapRef.value.stopNavigation) {
    mapRef.value.stopNavigation()
  }

  // Hide arrival overlay after a few seconds
  setTimeout(() => {
    showArrivalOverlay.value = false
  }, 5000)
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
  padding: 10px 12px;
  border-bottom: 1px solid #e0e0e0;
  background: #fafafa;
  border-radius: 4px;
  margin-bottom: 6px;
  transition: all 0.2s;
}

.route-item:hover {
  background: #f0f0f0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.route-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-weight: 600;
}

.route-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
  margin-bottom: 8px;
  padding: 8px;
  background: white;
  border-radius: 3px;
}

.metric {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.metric-icon {
  font-size: 14px;
}

.metric-text {
  font-weight: 500;
  color: #333;
}

.routes-help-text {
  font-size: 12px;
  color: #666;
  margin: 8px 0;
  padding: 8px 12px;
  background: #f5f5f5;
  border-radius: 4px;
}

.score-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  color: white;
}

.score-safe {
  background: #388e3c;
}

.score-moderate {
  background: #fbc02d;
  color: #333;
}

.score-caution {
  background: #f57c00;
}

.score-danger {
  background: #d32f2f;
}

.crime-info {
  font-size: 12px;
  color: #d32f2f;
  margin-top: 4px;
  font-weight: 500;
}

/* Safety Level Badges */
.safety-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  color: white;
}

.safety-low-risk {
  background: #388e3c;
}

.safety-moderate-risk {
  background: #fbc02d;
  color: #333;
}

.safety-high-risk {
  background: #d32f2f;
}

.arrival-control {
  text-align: center;
}

/* Weather Widget */
.weather-widget {
  position: absolute;
  bottom: 20px;
  left: 20px;
  background: rgba(255, 255, 255, 0.95);
  padding: 12px 16px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  min-width: 130px;
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  gap: 12px;
}

.weather-icon {
  font-size: 40px;
  line-height: 1;
  flex-shrink: 0;
}

.weather-info {
  display: flex;
  flex-direction: column;
  text-align: left;
}

.weather-temp {
  font-size: 22px;
  font-weight: 700;
  color: #333;
  line-height: 1;
}

.weather-condition {
  font-size: 12px;
  color: #666;
  margin-top: 2px;
}

/* "I Don't Feel Safe" Button */
.unsafe-button {
  position: absolute;
  bottom: 30px;
  left: 50%;
  transform: translateX(-50%);
  background: linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%);
  color: white;
  border: none;
  padding: 14px 24px;
  border-radius: 50px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(211, 47, 47, 0.4);
  z-index: 1100;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.unsafe-button:hover {
  background: linear-gradient(135deg, #b71c1c 0%, #8b0000 100%);
  box-shadow: 0 6px 18px rgba(211, 47, 47, 0.6);
  transform: translateX(-50%) scale(1.05);
}

.unsafe-button:active {
  transform: translateX(-50%) scale(0.98);
}

.unsafe-icon {
  font-size: 18px;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}
</style>