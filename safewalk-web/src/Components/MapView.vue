<template>
  <div ref="mapContainer" class="map"></div>
</template>

<script setup lang="ts">
/// <reference types="google.maps" />
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { getSegmentDangers, getCrimeCheckpoints } from '../Composables/useSafetyRouting'

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
const crimeMarkers: google.maps.Marker[] = []
const crimeCircles: google.maps.Circle[] = []
const crimeHeatmapRectangles: google.maps.Rectangle[] = []
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

function clearCrimeMarkers() {
  crimeMarkers.forEach(m => m.setMap(null))
  crimeMarkers.length = 0
  crimeCircles.forEach(c => c.setMap(null))
  crimeCircles.length = 0
}

function clearCrimeHeatmap() {
  crimeHeatmapRectangles.forEach(r => r.setMap(null))
  crimeHeatmapRectangles.length = 0
}

/**
 * Fetch crimes from the past 30 days and create heatmap visualization
 */
async function displayCrimeHeatmap(bbox: string) {
  if (!map) {
    console.warn('[MapView] Map not initialized for heatmap')
    return
  }

  // Don't clear - add new heatmap on top of existing ones to show persistent 30-day crime history
  
  // Parse bounding box: "minLat,minLng,maxLat,maxLng"
  const parts = bbox.split(',').map(p => parseFloat(p))
  if (parts.length !== 4 || parts.some(isNaN)) {
    console.warn('[MapView] Invalid bbox format')
    return
  }

  const minLat = parts[0]
  const minLng = parts[1]
  const maxLat = parts[2]
  const maxLng = parts[3]

  // Fetch crimes from past 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const dateFilter = thirtyDaysAgo.toISOString().split('T')[0]
  
  const url = `https://data.cityofchicago.org/resource/ijzp-q8t2.json?$select=latitude,longitude&$where=within_box(location,${minLat},${minLng},${maxLat},${maxLng})%20AND%20date%3E%27${dateFilter}T00:00:00%27&$limit=10000`

  try {
    console.log('[MapView] Fetching crimes for heatmap...')
    const res = await fetch(url)
    const crimes = await res.json()
    console.log(`[MapView] Retrieved ${crimes.length} crimes from past 30 days`)

    // Create a grid to aggregate crimes
    const gridSize = 0.01 // ~1km x 1km cells
    const grid = new Map<string, number>()

    // Aggregate crimes into grid cells
    crimes.forEach((crime: any) => {
      const lat = parseFloat(crime.latitude)
      const lng = parseFloat(crime.longitude)
      if (!isNaN(lat) && !isNaN(lng)) {
        const gridLat = Math.floor(lat / gridSize) * gridSize
        const gridLng = Math.floor(lng / gridSize) * gridSize
        const key = `${gridLat},${gridLng}`
        grid.set(key, (grid.get(key) || 0) + 1)
      }
    })

    // Find max crime count for scaling opacity
    const maxCrimes = Math.max(...Array.from(grid.values()), 1)
    console.log(`[MapView] Max crimes in cell: ${maxCrimes}`)

    // Create rectangles for each grid cell with high crime
    grid.forEach((count, key) => {
      if (count < 3) return // Only show cells with 3+ crimes

      const parts = key.split(',').map(Number)
      const gridLat = parts[0] || 0
      const gridLng = parts[1] || 0
      
      const bounds = {
        north: gridLat + gridSize,
        south: gridLat,
        east: gridLng + gridSize,
        west: gridLng
      }

      // Scale opacity based on crime density (0.1 to 0.6)
      const opacity = 0.1 + (count / maxCrimes) * 0.5
      
      const rect = new google.maps.Rectangle({
        bounds: bounds as google.maps.LatLngBoundsLiteral,
        map: map!,
        fillColor: '#FF0000', // Red
        fillOpacity: opacity,
        strokeColor: '#CC0000',
        strokeOpacity: opacity * 0.8,
        strokeWeight: 1
      })

      crimeHeatmapRectangles.push(rect)
    })

    console.log(`[MapView] Created ${crimeHeatmapRectangles.length} heatmap rectangles`)
  } catch (err) {
    console.error('[MapView] Error fetching crimes for heatmap:', err)
  }
}

// Get icon for crime - orange cross SVG
function getCrimeIcon(severity: string): string {
  // SVG for orange cross marker
  const orangeCrossSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
    <circle cx="20" cy="20" r="18" fill="#f57c00" opacity="0.9"/>
    <line x1="12" y1="20" x2="28" y2="20" stroke="white" stroke-width="3" stroke-linecap="round"/>
    <line x1="20" y1="12" x2="20" y2="28" stroke="white" stroke-width="3" stroke-linecap="round"/>
  </svg>`
  
  // Convert SVG to data URL
  return `data:image/svg+xml;base64,${btoa(orangeCrossSvg)}`
}

// Display crime checkpoints on the map
async function displayCrimeCheckpoints(bbox: string) {
  if (!map) {
    console.warn('[MapView] Map not initialized, cannot display crime checkpoints')
    return
  }
  
  clearCrimeMarkers()
  
  try {
    console.log('[MapView] Displaying crime checkpoints for bbox:', bbox)
    const checkpoints = await getCrimeCheckpoints(bbox)
    console.log('[MapView] Received', checkpoints.length, 'checkpoints to display')
    const g = (window as any).google
    
    if (checkpoints.length === 0) {
      console.log('[MapView] No active crime incidents found in this area!')
      return
    }
    
    checkpoints.forEach((checkpoint, idx) => {
      console.log(`[MapView] Adding crime checkpoint ${idx}: ${checkpoint.type} at (${checkpoint.lat}, ${checkpoint.lng})`)
      
      // Create marker for crime checkpoint with red cross icon
      const marker = new g.maps.Marker({
        position: { lat: checkpoint.lat, lng: checkpoint.lng },
        map,
        title: `🚨 ${checkpoint.type} - ${checkpoint.count} incident${checkpoint.count !== 1 ? 's' : ''}`,
        icon: getCrimeIcon(checkpoint.severity),
        zIndex: 100 + idx
      })
      
      // Create a circle to show danger radius based on severity
      const radiusMeters = checkpoint.severity === 'critical' ? 400 : 
                          checkpoint.severity === 'high' ? 300 : 200
      const circle = new g.maps.Circle({
        center: { lat: checkpoint.lat, lng: checkpoint.lng },
        radius: radiusMeters,
        map,
        fillColor: '#f57c00',
        fillOpacity: 0.1,
        strokeColor: '#f57c00',
        strokeOpacity: 0.3,
        strokeWeight: 2
      })
      
      // Add info window with crime details
      const infoWindow = new g.maps.InfoWindow({
        content: `
          <div style="font-family: Arial; font-size: 13px; padding: 10px; min-width: 200px;">
            <strong style="color: #f57c00; font-size: 14px;">🚨 ${checkpoint.type}</strong><br/>
            <div style="margin-top: 6px;">
              <strong>Incidents:</strong> ${checkpoint.count}<br/>
              <strong>Severity:</strong> <span style="color: #f57c00; font-weight: bold;">${checkpoint.severity.toUpperCase()}</span><br/>
              <strong>Last 24h:</strong> Crime & 311 Reports<br/>
            </div>
          </div>
        `
      })
      
      marker.addListener('click', () => {
        // Close all other info windows
        crimeMarkers.forEach((m, i) => {
          if (m !== marker && (m as any).infoWindow) {
            ;(m as any).infoWindow.close()
          }
        })
        infoWindow.open(map, marker)
        ;(marker as any).infoWindow = infoWindow
      })
      
      crimeMarkers.push(marker)
      crimeCircles.push(circle)
    })
    
    console.log('[MapView] Successfully displayed', crimeMarkers.length, 'crime checkpoints with red cross markers')
  } catch (err) {
    console.error('[MapView] Failed to display crime checkpoints:', err)
  }
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
  // Don't clear the crime heatmap - keep it visible to show 30-day crime history
  routesState = ranked || []
  
  // Only draw the first route by default
  if (routesState.length > 0) {
    drawRoute(routesState[0])
    
    // Display crime heatmap for the route area (keeps existing heatmap, adds more coverage)
    if (routesState[0].routeData && routesState[0].routeData.coords) {
      const coords = routesState[0].routeData.coords
      if (coords.length > 0) {
        const lngs = coords.map((c: [number, number]) => c[0])
        const lats = coords.map((c: [number, number]) => c[1])
        const minLat = Math.min(...lats)
        const maxLat = Math.max(...lats)
        const minLng = Math.min(...lngs)
        const maxLng = Math.max(...lngs)
        
        // Expand bbox slightly for context
        const padding = 0.02
        const bbox = `${minLat - padding},${minLng - padding},${maxLat + padding},${maxLng + padding}`
        
        displayCrimeHeatmap(bbox)
      }
    }
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
    strokeColor: '#1976D2', // Blue color for routes
    strokeOpacity: 0.85,
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

defineExpose({ setRoutes, highlightRoute, getDirections, displayCrimeCheckpoints, clearCrimeMarkers, displayCrimeHeatmap })

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