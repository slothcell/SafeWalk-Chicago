<template>
  <div ref="mapContainer" class="map"></div>
</template>

<script setup lang="ts">
/// <reference types="google.maps" />
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { getSegmentDangers } from '../Composables/useSafetyRouting'

interface Props {
  startLocation?: [number, number] | null
  endLocation?: [number, number] | null
}

const props = withDefaults(defineProps<Props>(), {
  startLocation: null,
  endLocation: null
})

// We dynamically load the Google Maps JS since we don't want to bundle it
const GOOGLE_KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY as string) || ''
if (!GOOGLE_KEY) console.warn('VITE_GOOGLE_MAPS_KEY not set; map display may fail')

const mapContainer = ref<HTMLDivElement | null>(null)
let map: google.maps.Map | null = null
const polylines: google.maps.Polyline[] = []
let startMarker: google.maps.Marker | null = null
let endMarker: google.maps.Marker | null = null

// Load the Google Maps script once
function loadGoogleMaps(): Promise<typeof google> {
  return new Promise((resolve, reject) => {
    if ((window as any).google && (window as any).google.maps) {
      console.log('Google Maps already loaded')
      resolve((window as any).google)
      return
    }
    console.log('Loading Google Maps script...')
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}`
    script.async = true
    script.onload = () => {
      console.log('Google Maps script loaded successfully')
      if ((window as any).google && (window as any).google.maps) {
        resolve((window as any).google)
      } else {
        reject(new Error('Google Maps API not available after script load'))
      }
    }
    script.onerror = (err) => {
      console.error('Failed to load Google Maps script:', err)
      reject(new Error('Failed to load Google Maps script'))
    }
    document.head.appendChild(script)
  })
}

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

let routesState: any[] = []

function clearLines() {
  polylines.forEach(p => p.setMap(null))
  polylines.length = 0
}

function updateMarkers() {
  if (!map) return
  const g = (window as any).google
  
  // Remove old markers
  if (startMarker) startMarker.setMap(null)
  if (endMarker) endMarker.setMap(null)
  
  // Add start marker
  if (props.startLocation) {
    startMarker = new g.maps.Marker({
      position: { lat: props.startLocation[1], lng: props.startLocation[0] },
      map,
      title: 'Start',
      icon: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'
    })
  }
  
  // Add end marker
  if (props.endLocation) {
    endMarker = new g.maps.Marker({
      position: { lat: props.endLocation[1], lng: props.endLocation[0] },
      map,
      title: 'Destination',
      icon: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png'
    })
  }
  
  // Center map on both markers
  if (props.startLocation && props.endLocation) {
    const bounds = new g.maps.LatLngBounds()
    bounds.extend({ lat: props.startLocation[1], lng: props.startLocation[0] })
    bounds.extend({ lat: props.endLocation[1], lng: props.endLocation[0] })
    map.fitBounds(bounds)
  }
}

function setRoutes(ranked: any[]) {
  if (!map) {
    console.error('setRoutes called but map is not initialized')
    return
  }
  clearLines()
  routesState = ranked || []
  // Only draw the first route by default
  if (routesState.length > 0) {
    drawRoute(routesState[0])
  }
}

function drawRoute(routeScore: any) {
  let path: {lat: number, lng: number}[] = [];
  if (routeScore.routeData && routeScore.routeData.geometry && routeScore.routeData.geometry.length > 0) {
    path = routeScore.routeData.geometry;
  } else if (routeScore.routeData && routeScore.routeData.coords) {
    path = routeScore.routeData.coords.map((c: [number, number]) => ({ lat: c[1], lng: c[0] }));
  }
  if (!path || path.length < 2) return;
  const line = new google.maps.Polyline({
    path,
    strokeColor: '#D32F2F', // Always red
    strokeOpacity: 0.8,
    strokeWeight: 8
  });
  line.setMap(map!);
  polylines.push(line);
}

// Polyline decoder for Google encoded polylines
function decodePolyline(encoded: string): {lat: number, lng: number}[] {
  let points = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

function highlightRoute(selectedIndex: number) {
  clearLines()
  if (routesState[selectedIndex]) {
    drawRoute(routesState[selectedIndex])
  }
}

// Watch for location changes and update markers
watch([() => props.startLocation, () => props.endLocation], () => {
  updateMarkers()
})

async function getDirections(origin: [number, number], dest: [number, number]): Promise<any[]> {
  if (!map) {
    const g = await loadGoogleMaps()
    // map will be created in onMounted normally; if not, create a temporary map offscreen
    if (!map && mapContainer.value) {
      map = new g.maps.Map(mapContainer.value, { center: { lat: origin[1], lng: origin[0] }, zoom: 13 })
    }
  }
  const g = (window as any).google
  return new Promise((resolve, reject) => {
    try {
      const ds = new g.maps.DirectionsService()
      ds.route(
        {
          origin: { lat: origin[1], lng: origin[0] },
          destination: { lat: dest[1], lng: dest[0] },
          travelMode: g.maps.TravelMode.WALKING,
          provideRouteAlternatives: true
        },
        (result: any, status: any) => {
          if (status === g.maps.DirectionsStatus.OK || status === 'OK') {
            resolve(result.routes || [])
          } else {
            console.error('DirectionsService error:', status, result)
            reject(new Error('DirectionsService: ' + status))
          }
        }
      )
    } catch (err) {
      reject(err)
    }
  })
}

defineExpose({ setRoutes, highlightRoute, getDirections })

onMounted(async () => {
  if (!mapContainer.value) return
  try {
    console.log('Mounting MapView, GOOGLE_KEY present:', !!GOOGLE_KEY)
    const g = await loadGoogleMaps()
    console.log('Google Maps loaded, creating map...')
    map = new g.maps.Map(mapContainer.value, {
      center: { lat: 41.8781, lng: -87.6298 },
      zoom: 13,
      restriction: {
        // roughly Chicago bounds
        latLngBounds: {
          north: 42.02,
          south: 41.64,
          east: -87.52,
          west: -87.95
        }
      }
    })
    console.log('Map created successfully')
    updateMarkers()
  } catch (err) {
    console.error('Error mounting MapView:', err)
    alert('Oops something went wrong and the map was not available: ' + (err instanceof Error ? err.message : String(err)))
  }
})

onUnmounted(() => {
  if (map) {
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