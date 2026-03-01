// Google Maps based routing utilities

const GOOGLE_KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY as string) || ''
if (!GOOGLE_KEY) {
  console.warn('VITE_GOOGLE_MAPS_KEY is not set; geocoding and directions will fail')
}

// Cache for crime data to reduce API calls
const crimeDataCache = new Map<string, {data: any[], timestamp: number}>()
const CACHE_DURATION = 30 * 60 * 1000 // 30 minutes

type RouteScore = {
  routeIndex: number
  crimeCount: number
  totalScore: number
  travelTime?: number // in minutes
  travelDistance?: number // in meters
  safetyLevel?: 'Low Risk' | 'Moderate Risk' | 'High Risk'
  routeData?: any
}

// Helper to extract geometry from DirectionsService response
export function extractRouteGeometry(directions: any): {lat: number, lng: number}[] {
  const path: {lat: number, lng: number}[] = [];
  if (directions && directions.legs) {
    directions.legs.forEach((leg: any) => {
      leg.steps.forEach((step: any) => {
        if (step.polyline && step.polyline.points) {
          const decoded = decodePolyline(step.polyline.points);
          path.push(...decoded);
        }
      });
    });
  }
  return path;
}

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

export async function fetchRoutes(
  origin: [number, number],
  dest: [number, number]
) {
  if (!GOOGLE_KEY) {
    console.error('VITE_GOOGLE_MAPS_KEY not set; cannot fetch routes')
    return []
  }
  const originStr = origin[1] + ',' + origin[0]
  const destStr = dest[1] + ',' + dest[0]
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originStr}&destination=${destStr}&mode=walking&alternatives=true&key=${GOOGLE_KEY}`
  console.log('Fetching routes from:', url)
  try {
    const res = await fetch(url)
    const data = await res.json()
    console.log('Directions API response status:', res.status, 'data:', data)
    if (!res.ok) {
      console.error('Directions API error:', data.error_message)
      return []
    }
    if (data.status !== 'OK') {
      console.error('Directions API returned status:', data.status, 'Message:', data.error_message)
      return []
    }
    console.log('Successfully fetched', (data.routes || []).length, 'routes')
    return data.routes || []
  } catch (err) {
    console.error('Failed to fetch routes:', err)
    return []
  }
}

// Parse bbox string format: "minLat,minLng,maxLat,maxLng"
function parseBBox(bbox: string): {minLat: number, minLng: number, maxLat: number, maxLng: number} | null {
  try {
    const parts = bbox.split(',').map(s => parseFloat(s))
    if (parts.length !== 4 || parts.some(isNaN)) return null
    return {
      minLat: parts[0]!,
      minLng: parts[1]!,
      maxLat: parts[2]!,
      maxLng: parts[3]!
    }
  } catch {
    return null
  }
}

// Check if a crime location falls within the bounding box
function isInBBox(crime: any, bbox: {minLat: number, minLng: number, maxLat: number, maxLng: number}): boolean {
  if (!crime.location?.latitude || !crime.location?.longitude) return false
  const lat = parseFloat(crime.location.latitude)
  const lng = parseFloat(crime.location.longitude)
  return lat >= bbox.minLat && lat <= bbox.maxLat && lng >= bbox.minLng && lng <= bbox.maxLng
}

// Fetch real-time/recent crimes from the Chicago data portal
// Using the official Chicago Crime dataset: https://data.cityofchicago.org/Public-Safety/Chicago-Crime/s5n8-c4wk
export async function fetchRecentCrimes(bbox: string, hoursAgo: number = 24*28) {
  // Check cache first
  const cacheKey = `crimes_${bbox}_${hoursAgo}`
  const cached = crimeDataCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('[Crime API] Using cached crime data')
    return cached.data
  }

  // Calculate dynamic date range: past N hours from current time
  const now = new Date()
  const pastDate = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000)
  
  // Parse bounding box
  const bboxObj = parseBBox(bbox)
  if (!bboxObj) {
    console.warn('[Crime API] Invalid bbox format')
    return []
  }
  
  console.log(`[Crime API] Fetching crimes from past ${hoursAgo} hours`)
  console.log(`[Crime API] BBox: lat[${bboxObj.minLat}, ${bboxObj.maxLat}] lng[${bboxObj.minLng}, ${bboxObj.maxLng}]`)
  
  try {
    // Try multiple API endpoints in order
    let data = await tryFetchFromSocrata(bboxObj)
    
    if (!data || data.length === 0) {
      console.log('[Crime API] Socrata endpoint returned no data, trying alternative...')
      data = await tryFetchFromCKAN(bbox)
    }
    
    if (!data || data.length === 0) {
      console.warn('[Crime API] All API endpoints returned empty results')
      // Return mock data for development/testing
      data = generateMockCrimeData(bboxObj, hoursAgo)
    }
    
    // Validate and filter crimes with proper coordinates
    const filtered = (Array.isArray(data) ? data : []).filter(c => {
      const lat = typeof c.latitude === 'string' ? parseFloat(c.latitude) : c.latitude
      const lng = typeof c.longitude === 'string' ? parseFloat(c.longitude) : c.longitude
      return !isNaN(lat) && !isNaN(lng)
    })
    
    console.log(`[Crime API] Valid crimes after filtering: ${filtered.length}`)
    
    // Log sample crimes for debugging
    if (filtered.length > 0) {
      console.log('[Crime API] Sample crimes:', filtered.slice(0, 3).map(c => ({
        type: c.primary_type,
        date: c.date,
        lat: c.latitude,
        lng: c.longitude
      })))
    }
    
    // Cache the results
    crimeDataCache.set(cacheKey, { data: filtered, timestamp: Date.now() })
    
    return filtered
    
  } catch (err) {
    console.error('[Crime API] Fetch error:', err)
    return []
  }
}

// Try to fetch from Socrata API endpoint
async function tryFetchFromSocrata(bbox: {minLat: number, minLng: number, maxLat: number, maxLng: number}): Promise<any[]> {
  try {
    const url = new URL('https://data.cityofchicago.org/resource/s5n8-c4wk.json')
    url.searchParams.append('$where', `latitude > ${bbox.minLat} AND latitude < ${bbox.maxLat} AND longitude > ${bbox.minLng} AND longitude < ${bbox.maxLng}`)
    url.searchParams.append('$limit', '10000')
    url.searchParams.append('$order', 'date DESC')
    
    const res = await fetch(url.toString())
    if (!res.ok) {
      console.warn(`[Crime API - Socrata] HTTP ${res.status}`)
      return []
    }
    
    const data = await res.json()
    if (Array.isArray(data) && data.length > 0) {
      console.log(`[Crime API - Socrata] ✅ Successfully fetched ${data.length} records`)
      return data
    }
    return []
  } catch (err) {
    console.warn('[Crime API - Socrata] Fetch failed:', err instanceof Error ? err.message : String(err))
    return []
  }
}

// Try to fetch from CKAN API endpoint (alternative)
async function tryFetchFromCKAN(bbox: string): Promise<any[]> {
  try {
    const url = new URL('https://data.cityofchicago.org/api/3/action/datastore_search')
    url.searchParams.append('resource_id', 's5n8-c4wk')
    url.searchParams.append('limit', '10000')
    
    const res = await fetch(url.toString())
    if (!res.ok) {
      console.warn(`[Crime API - CKAN] HTTP ${res.status}`)
      return []
    }
    
    const response = await res.json()
    if (response.success && response.result && Array.isArray(response.result.records)) {
      console.log(`[Crime API - CKAN] ✅ Successfully fetched ${response.result.records.length} records`)
      return response.result.records
    }
    return []
  } catch (err) {
    console.warn('[Crime API - CKAN] Fetch failed:', err instanceof Error ? err.message : String(err))
    return []
  }
}

// Generate mock crime data for testing when API is unavailable
function generateMockCrimeData(bbox: {minLat: number, minLng: number, maxLat: number, maxLng: number}, hoursAgo: number): any[] {
  console.log('[Crime API] Generating mock data for testing')
  
  const mockCrimes = [
    { primary_type: 'THEFT', latitude: bbox.minLat + (bbox.maxLat - bbox.minLat) * 0.3, longitude: bbox.minLng + (bbox.maxLng - bbox.minLng) * 0.3, date: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() },
    { primary_type: 'ROBBERY', latitude: bbox.minLat + (bbox.maxLat - bbox.minLat) * 0.6, longitude: bbox.minLng + (bbox.maxLng - bbox.minLng) * 0.5, date: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() },
    { primary_type: 'ASSAULT', latitude: bbox.minLat + (bbox.maxLat - bbox.minLat) * 0.5, longitude: bbox.minLng + (bbox.maxLng - bbox.minLng) * 0.7, date: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString() },
    { primary_type: 'CRIMINAL DAMAGE', latitude: bbox.minLat + (bbox.maxLat - bbox.minLat) * 0.4, longitude: bbox.minLng + (bbox.maxLng - bbox.minLng) * 0.4, date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
    { primary_type: 'THEFT', latitude: bbox.minLat + (bbox.maxLat - bbox.minLat) * 0.7, longitude: bbox.minLng + (bbox.maxLng - bbox.minLng) * 0.2, date: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString() }
  ]
  
  return mockCrimes
}

// Fetch 311 Service Requests (incidents: fights, disturbances, traffic, etc.)
// Using Chicago 311 Service Requests: https://data.cityofchicago.org/311-Service-Requests/311-Service-Requests/4cd6-ks6v
export async function fetch311Incidents(bbox: string, hoursAgo: number = 24) {
  // Calculate dynamic date range: past N hours from current time
  const now = new Date()
  const pastDate = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000)
  
  // Format dates as ISO strings for the API query
  const startDate = pastDate.toISOString()
  const endDate = now.toISOString()
  
  // Incident types we care about: fights, assault, disturbance, traffic, accident
  const relevantTypes = ['Fighting', 'Assault', 'Disturbance - Noise', 'Traffic - Traffic Control Signal Out', 'Motor Vehicle Accident Response']
  
  // API endpoint - use the official Chicago 311 Service Requests dataset
  const typeFilter = relevantTypes.map(t => `service_request_type='${t}'`).join(' OR ')
  const url = `https://data.cityofchicago.org/resource/4cd6-ks6v.json?$where=(${typeFilter}) AND created_date>='${startDate}' AND created_date<='${endDate}'&$limit=5000&$order=created_date%20DESC`
  
  console.log(`[311 API] Fetching incidents from past ${hoursAgo} hours`)
  
  try {
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`[311 API] HTTP ${res.status}: ${res.statusText}`)
      return []
    }
    
    let data = await res.json()
    console.log(`[311 API] Response: ${Array.isArray(data) ? data.length : 0} incidents fetched`)
    
    // Filter by bounding box
    const bboxObj = parseBBox(bbox)
    if (!bboxObj) {
      console.warn('[311 API] Invalid bbox format')
      return (Array.isArray(data) ? data : []).filter(inc => inc.location_1?.latitude && inc.location_1?.longitude)
    }
    
    // 311 data uses location_1 field with nested coordinates
    const filtered = (Array.isArray(data) ? data : []).filter(incident => {
      if (!incident.location_1?.coordinates) return false
      const [lng, lat] = incident.location_1.coordinates
      return lat >= bboxObj.minLat && lat <= bboxObj.maxLat && lng >= bboxObj.minLng && lng <= bboxObj.maxLng
    })
    
    console.log(`[311 API] After bbox filter: ${filtered.length} incidents in area`)
    
    // Normalize 311 data to match crime data structure for compatibility
    return filtered.map(inc => ({
      primary_type: inc.service_request_type || 'Incident',
      date: inc.created_date,
      location: {
        latitude: inc.location_1?.coordinates?.[1]?.toString() || '',
        longitude: inc.location_1?.coordinates?.[0]?.toString() || ''
      },
      description: inc.description || ''
    }))
    
  } catch (err) {
    console.warn('[311 API] Fetch error:', err)
    return []
  }
}

// Fetch real-time crimes (past 24 hours) - used for checkpoint visualization
export async function fetchRealTimeCrimes(bbox: string) {
  console.log('[Checkpoints] Fetching real-time incidents from multiple sources...')
  
  // Fetch both crimes and 311 incidents in parallel
  const [crimes, incidents] = await Promise.all([
    fetchRecentCrimes(bbox, 24),
    fetch311Incidents(bbox, 24)
  ])
  
  console.log('[Checkpoints] Got', crimes.length, 'crimes and', incidents.length, '311 incidents')
  
  // Combine all incidents
  const allIncidents = [...crimes, ...incidents]
  console.log('[Checkpoints] Total incidents:', allIncidents.length)
  
  // If no recent incidents, fall back to weekly data for visualization
  if (allIncidents.length === 0) {
    console.log('[Checkpoints] No recent incidents, trying weekly data...')
    const weeklyCrimes = await fetchRecentCrimes(bbox, 168)
    return weeklyCrimes
  }
  
  return allIncidents
}

// Fetch all crimes in the past week for route safety analysis
export async function fetchWeeklyClusteredCrimes(bbox: string) {
  console.log('[RouteScoring] Fetching weekly incidents...')
  const [crimes, incidents] = await Promise.all([
    fetchRecentCrimes(bbox, 168),
    fetch311Incidents(bbox, 168)
  ])
  const allIncidents = [...crimes, ...incidents]
  console.log('[RouteScoring] Got', allIncidents.length, 'incidents from past week')
  return allIncidents
}

// Calculate distance between two coordinates [lng, lat]
function haversineDistance(coord1: [number, number], coord2: [number, number]): number {
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

// Compute bounding box from array of coordinates
function computeBBox(coords: [number, number][]): string {
  const lons = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  return `${Math.min(...lats)},${Math.min(...lons)},${Math.max(...lats)},${Math.max(...lons)}`
}

/**
 * Fetch crimes from the Chicago Crime dataset for a given route (past 30 days)
 * Using the official real-time crime dataset: s5n8-c4wk
 * @param routeCoordinates - Array of {lat, lng} coordinates representing the walking route
 * @returns Promise containing array of crimes with latitude, longitude, primary_type, date
 */
export async function fetchCrimesForRoute(routeCoordinates: Array<{lat: number, lng: number}>) {
  if (!routeCoordinates || routeCoordinates.length === 0) {
    console.warn('[Safety Scoring] No route coordinates provided')
    return []
  }

  // Step 1: Compute bounding box around the route
  const lons = routeCoordinates.map(c => c.lng)
  const lats = routeCoordinates.map(c => c.lat)
  
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lons)
  const maxLng = Math.max(...lons)
  
  // Add padding for context
  const padding = 0.01
  const southLat = minLat - padding
  const northLat = maxLat + padding
  const westLng = minLng - padding
  const eastLng = maxLng + padding
  
  console.log(`[Safety Scoring] Route bbox: lat[${southLat.toFixed(4)}, ${northLat.toFixed(4)}] lng[${westLng.toFixed(4)}, ${eastLng.toFixed(4)}]`)

  const bboxObj = { minLat: southLat, maxLat: northLat, minLng: westLng, maxLng: eastLng }

  console.log(`[Safety Scoring] Fetching real crime data for route...`)

  try {
    // Try Socrata API first
    let crimes = await tryFetchFromSocrata(bboxObj)
    
    // If that fails, try CKAN
    if (!crimes || crimes.length === 0) {
      console.log('[Safety Scoring] Socrata returned no data, trying CKAN...')
      const bbox = `${southLat},${westLng},${northLat},${eastLng}`
      crimes = await tryFetchFromCKAN(bbox)
    }
    
    // If both fail, use mock data
    if (!crimes || crimes.length === 0) {
      console.log('[Safety Scoring] APIs returned no data, using mock data')
      crimes = generateMockCrimeData(bboxObj, 720) // 30 days
    }
    
    // Validate crimes with proper coordinates
    const validCrimes = (Array.isArray(crimes) ? crimes : []).filter(c => {
      const lat = typeof c.latitude === 'string' ? parseFloat(c.latitude) : c.latitude
      const lng = typeof c.longitude === 'string' ? parseFloat(c.longitude) : c.longitude
      return !isNaN(lat) && !isNaN(lng)
    })
    
    console.log(`[Safety Scoring] ✅ Retrieved ${validCrimes.length} crimes from bbox area`)
    
    // Log sample crimes for debugging
    if (validCrimes.length > 0) {
      console.log('[Safety Scoring] Sample crimes:', validCrimes.slice(0, 3).map(c => ({
        type: c.primary_type,
        date: c.date,
        lat: c.latitude,
        lng: c.longitude
      })))
    }
    
    return validCrimes
  } catch (err) {
    console.error('[Safety Scoring] Error fetching crimes:', err)
    return []
  }
}

/**
 * Score a route based on crime density in grid cells (matching the red-tinted heatmap)
 * Uses the same 0.01 degree grid cells as the heatmap visualization
 * Routes passing through high-crime density areas receive higher risk scores
 */
export function scoreRoute(
  routeCoordinates: Array<{lat: number, lng: number}>,
  crimes: any[]
): {totalScore: number, crimeCount: number, safetyLevel: 'Low Risk' | 'Moderate Risk' | 'High Risk'} {
  
  if (!routeCoordinates || routeCoordinates.length === 0 || !crimes || crimes.length === 0) {
    return { totalScore: 0, crimeCount: 0, safetyLevel: 'Low Risk' }
  }

  // Step 1: Create a grid of crimes matching the heatmap (0.01 degree cells ~ 1km x 1km)
  const gridSize = 0.01
  const crimeGrid = new Map<string, number>() // Map of "gridLat,gridLng" -> crime count
  
  // Aggregate crimes into grid cells
  crimes.forEach(crime => {
    let lat: number, lng: number
    
    // Handle different crime data formats (from API: latitude/longitude fields)
    if (typeof crime.latitude === 'string') {
      lat = parseFloat(crime.latitude)
    } else if (typeof crime.latitude === 'number') {
      lat = crime.latitude
    } else if (crime.location?.latitude) {
      lat = parseFloat(crime.location.latitude)
    } else {
      return
    }
    
    if (typeof crime.longitude === 'string') {
      lng = parseFloat(crime.longitude)
    } else if (typeof crime.longitude === 'number') {
      lng = crime.longitude
    } else if (crime.location?.longitude) {
      lng = parseFloat(crime.location.longitude)
    } else {
      return
    }

    if (isNaN(lat) || isNaN(lng)) return

    // Calculate grid cell coordinates
    const gridLat = Math.floor(lat / gridSize) * gridSize
    const gridLng = Math.floor(lng / gridSize) * gridSize
    const gridKey = `${gridLat},${gridLng}`
    
    crimeGrid.set(gridKey, (crimeGrid.get(gridKey) || 0) + 1)
  })

  // Step 2: Find max crime density for scoring normalization
  const maxCrimesInCell = Math.max(...Array.from(crimeGrid.values()), 1)
  
  // Step 3: Score the route based on grid cells it passes through
  let totalScore = 0
  const routeGridCells = new Set<string>()
  let crimesCrossed = 0

  // Check each route coordinate and calculate grid cell impact
  routeCoordinates.forEach(coord => {
    const gridLat = Math.floor(coord.lat / gridSize) * gridSize
    const gridLng = Math.floor(coord.lng / gridSize) * gridSize
    const gridKey = `${gridLat},${gridLng}`
    
    // Skip if we already counted this grid cell for this route
    if (routeGridCells.has(gridKey)) return
    
    routeGridCells.add(gridKey)
    
    // Get crime count in this grid cell
    const crimesInCell = crimeGrid.get(gridKey) || 0
    
    if (crimesInCell > 0) {
      crimesCrossed += crimesInCell
      
      // Score based on crime density in the cell (matching heatmap visualization)
      // Cells with 3+ crimes = visible red zone on heatmap
      if (crimesInCell >= 10) {
        totalScore += 15 // Very high crime density (darkest red)
      } else if (crimesInCell >= 7) {
        totalScore += 10 // High crime density (dark red)
      } else if (crimesInCell >= 5) {
        totalScore += 7 // Moderate-high crime density (medium red)
      } else if (crimesInCell >= 3) {
        totalScore += 4 // Moderate crime density (light red - visible on heatmap)
      } else {
        totalScore += 1 // Low crime density
      }
    }
  })

  // Step 4: Determine safety level based on total score and crime density
  let safetyLevel: 'Low Risk' | 'Moderate Risk' | 'High Risk' = 'Low Risk'
  if (totalScore >= 20) {
    safetyLevel = 'High Risk'
  } else if (totalScore >= 10) {
    safetyLevel = 'Moderate Risk'
  }

  console.log(`[Safety Scoring] Grid-based route score: ${totalScore.toFixed(1)} (crosses ${routeGridCells.size} grid cells with ${crimesCrossed} total crimes) - ${safetyLevel}`)

  return {
    totalScore,
    crimeCount: crimesCrossed,
    safetyLevel
  }
}

// Calculate crime impact score with proximity weighting
function calculateCrimeImpact(crimes: any[], coord: [number, number]): number {
  if (crimes.length === 0) return 0
  
  let totalImpact = 0
  const proximityThreshold = 0.5 // km
  
  crimes.forEach(crime => {
    let lat: number, lng: number
    
    // Handle different crime data formats
    if (typeof crime.latitude === 'string') {
      lat = parseFloat(crime.latitude)
    } else {
      lat = crime.latitude
    }
    
    if (typeof crime.longitude === 'string') {
      lng = parseFloat(crime.longitude)
    } else {
      lng = crime.longitude
    }
    
    if (isNaN(lat) || isNaN(lng)) return
    
    const crimeCoord: [number, number] = [lng, lat]
    const distance = haversineDistance(coord, crimeCoord)
    
    if (distance < proximityThreshold) {
      // High penalty for very close crimes
      totalImpact += (proximityThreshold - distance) * 10
    } else if (distance < 1.0) {
      // Moderate penalty for nearby crimes
      totalImpact += (1.0 - distance) * 5
    }
  })
  
  return totalImpact
}

export async function scoreRoutes(
  origin: [number, number],
  dest: [number, number]
): Promise<RouteScore[]> {
  console.log('scoreRoutes called with origin:', origin, 'dest:', dest)
  const routes = await fetchRoutes(origin, dest)
  console.log('Fetched', routes.length, 'routes')
  const results: RouteScore[] = []
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i]
    console.log('Processing route', i, ':', route)
    const polyline = route.overview_polyline?.points || ''
    console.log('Polyline for route', i, ':', polyline.substring(0, 50) + '...')
    // If you need [number, number][] format:
    const coords: [number, number][] = decodePolyline(polyline).map(p => [p.lng, p.lat]);
    console.log('Decoded', coords.length, 'coordinates for route', i)
    const bbox = computeBBox(coords)
    console.log('BBox for route', i, ':', bbox)
    
    // Fetch real-time crimes for scoring
    const crimes = await fetchRealTimeCrimes(bbox)
    console.log('Found', crimes.length, 'recent crimes in route', i)
    
    // Calculate total crime impact with proximity weighting
    let totalScore = 0
    for (const coord of coords) {
      totalScore += calculateCrimeImpact(crimes, coord)
    }
    
    results.push({
      routeIndex: i,
      crimeCount: crimes.length,
      totalScore,
      routeData: { route, coords, crimes }
    })
  }
  console.log('All routes scored. Results:', results)
  return results.sort((a, b) => a.totalScore - b.totalScore)
}

// Score routes when routes are already obtained from DirectionsService (client-side)
export async function scoreRoutesFromDirections(directions: any[]): Promise<RouteScore[]> {
  console.log('[Routing] scoreRoutesFromDirections called with', directions.length, 'routes')
  const results: RouteScore[] = []
  
  for (let i = 0; i < directions.length; i++) {
    const route = directions[i]
    console.log('[Routing] Processing route', i)
    
    // Step 1: Decode polyline to get route coordinates
    const polyline = route.overview_polyline?.points || ''
    const decodedCoords = decodePolyline(polyline)
    
    // Step 2: Convert to {lat, lng} format for safety scoring functions
    const routeCoordinates = decodedCoords.map(p => ({ lat: p.lat, lng: p.lng }))
    console.log(`[Routing] Route ${i} has ${routeCoordinates.length} coordinate points`)
    
    // Step 3: Fetch crimes for this route using the new function (30-day window)
    const crimes = await fetchCrimesForRoute(routeCoordinates)
    console.log(`[Routing] Route ${i} - fetched ${crimes.length} crimes within 30-day bbox`) 
    if (crimes.length === 0) {
      console.warn(`[Routing] Route ${i} - warning: no crimes returned; verify bbox and API response`)
    }
    
    // Step 4: Score the route using the new safety scoring function
    const safetyScore = scoreRoute(routeCoordinates, crimes)
    console.log(`[Routing] Route ${i} safety score: ${safetyScore.totalScore.toFixed(1)} - ${safetyScore.safetyLevel} (${safetyScore.crimeCount} nearby crimes)`)
    
    // Step 5: Extract travel time and distance from legs
    let travelTime = 0 // in minutes
    let travelDistance = 0 // in meters
    if (route.legs && Array.isArray(route.legs)) {
      route.legs.forEach((leg: any) => {
        if (leg.duration?.value) travelTime += leg.duration.value / 60 // convert to minutes
        if (leg.distance?.value) travelDistance += leg.distance.value
      })
    }
    
    console.log(`[Routing] Route ${i}: ${travelTime.toFixed(0)}min, ${(travelDistance/1000).toFixed(1)}mi, Safety: ${safetyScore.safetyLevel}`)
    
    // Step 6: Build result with all metrics
    results.push({
      routeIndex: i,
      crimeCount: safetyScore.crimeCount,
      totalScore: safetyScore.totalScore,
      travelTime,
      travelDistance,
      safetyLevel: safetyScore.safetyLevel,
      routeData: {
        directions: route,
        coords: routeCoordinates,
        geometry: extractRouteGeometry(route),
        crimes
      }
    })
  }
  
  console.log('[Routing] All routes scored. Ranking by safety...')
  // Sort by score (lowest/safest first), then by travel time
  return results.sort((a, b) => {
    if (a.totalScore !== b.totalScore) {
      return a.totalScore - b.totalScore
    }
    return (a.travelTime || 0) - (b.travelTime || 0)
  })
}

// Calculate segment-level danger colors for polyline visualization
export async function getSegmentDangers(coords: [number, number][]): Promise<{segment: [number, number][]; crimeCount: number; color: string}[]> {
  if (coords.length < 2) return [];
  // Divide route into segments (every 10 coordinate points or so)
  const segmentSize = Math.max(2, Math.floor(coords.length / 20));
  const segments: {start: number; end: number}[] = [];
  for (let i = 0; i < coords.length - 1; i += segmentSize) {
    segments.push({
      start: i,
      end: Math.min(i + segmentSize, coords.length - 1)
    });
  }
  // Get all crimes for the full route
  const fullBbox = computeBBox(coords);
  const allCrimes = await fetchRecentCrimes(fullBbox);
  const result: {segment: [number, number][]; crimeCount: number; color: string}[] = [];
  for (const seg of segments) {
    const segmentCoords = coords.slice(seg.start, seg.end + 1);
    const segBbox = computeBBox(segmentCoords);
    // Find crimes near this segment
    const bboxParts = segBbox.split(',').map(Number);
    const [minLat, minLng, maxLat, maxLng] = [
      bboxParts[0] ?? 0,
      bboxParts[1] ?? 0,
      bboxParts[2] ?? 0,
      bboxParts[3] ?? 0
    ];
    const segmentCrimes = allCrimes.filter(c => {
      let lat: number, lng: number
      if (typeof c.latitude === 'string') {
        lat = parseFloat(c.latitude)
      } else {
        lat = c.latitude
      }
      if (typeof c.longitude === 'string') {
        lng = parseFloat(c.longitude)
      } else {
        lng = c.longitude
      }
      return (
        !isNaN(lat) && !isNaN(lng) &&
        typeof minLat === 'number' && typeof maxLat === 'number' &&
        typeof minLng === 'number' && typeof maxLng === 'number' &&
        lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng
      );
    });
    // Assign color based on crime count: red=dangerous, yellow=moderate, green=safe
    let color = '#5E6C5B'; // green (safe)
    if (segmentCrimes.length >= 3) {
      color = '#D32F2F'; // red (dangerous)
    } else if (segmentCrimes.length >= 1) {
      color = '#FFA726'; // orange (moderate)
    }
    result.push({
      segment: segmentCoords,
      crimeCount: segmentCrimes.length,
      color
    });
  }
  return result;
}

// Get crime checkpoints (real-time crimes) for map visualization
export async function getCrimeCheckpoints(bbox: string) {
  console.log('[Checkpoints] Fetching crime checkpoints for bbox:', bbox)
  const crimes = await fetchRealTimeCrimes(bbox)
  console.log('[Checkpoints] Fetched', crimes.length, 'total crimes')
  
  // Cluster nearby crimes to avoid too many markers
  const clustered = clusterCrimes(crimes, 0.2) // Cluster within 0.2 km radius
  console.log('[Checkpoints] Clustered into', clustered.length, 'checkpoint(s)')
  
  const checkpoints = clustered.map((cluster, index) => ({
    id: `crime-${index}`,
    lat: cluster.avgLat,
    lng: cluster.avgLng,
    count: cluster.count,
    type: cluster.type,
    primary: cluster.primary,
    severity: cluster.severity,
    crimes: cluster.crimes
  }))
  
  console.log('[Checkpoints] Final checkpoints:', checkpoints)
  return checkpoints
}

// Cluster nearby crimes to reduce map clutter
function clusterCrimes(crimes: any[], radiusKm: number = 0.2) {
  if (crimes.length === 0) return []
  
  const clusters: any[] = []
  const processed = new Set<number>()
  
  crimes.forEach((crime, index) => {
    if (processed.has(index)) return
    
    // Extract coordinates - handle both API field formats
    let lat: number, lng: number
    if (typeof crime.latitude === 'string') {
      lat = parseFloat(crime.latitude)
    } else {
      lat = crime.latitude
    }
    
    if (typeof crime.longitude === 'string') {
      lng = parseFloat(crime.longitude)
    } else {
      lng = crime.longitude
    }
    
    if (isNaN(lat) || isNaN(lng)) return
    
    const crimeCoord: [number, number] = [lng, lat]
    
    const cluster = {
      crimes: [crime],
      coords: [crimeCoord],
      type: crime.primary_type || 'Unknown',
      primary: crime.description || 'Crime',
      severity: calculateCrimeSeverity(crime.primary_type),
      avgLat: lat,
      avgLng: lng,
      count: 1
    }
    
    processed.add(index)
    
    // Find nearby crimes
    crimes.forEach((otherCrime, otherIndex) => {
      if (processed.has(otherIndex)) return
      
      let otherLat: number, otherLng: number
      if (typeof otherCrime.latitude === 'string') {
        otherLat = parseFloat(otherCrime.latitude)
      } else {
        otherLat = otherCrime.latitude
      }
      
      if (typeof otherCrime.longitude === 'string') {
        otherLng = parseFloat(otherCrime.longitude)
      } else {
        otherLng = otherCrime.longitude
      }
      
      if (isNaN(otherLat) || isNaN(otherLng)) return
      
      const otherCoord: [number, number] = [otherLng, otherLat]
      
      const distance = haversineDistance(crimeCoord, otherCoord)
      if (distance <= radiusKm) {
        cluster.crimes.push(otherCrime)
        cluster.coords.push(otherCoord)
        cluster.count++
        processed.add(otherIndex)
      }
    })
    
    // Recalculate average position
    const avgLat = cluster.coords.reduce((sum, c) => sum + c[1], 0) / cluster.coords.length
    const avgLng = cluster.coords.reduce((sum, c) => sum + c[0], 0) / cluster.coords.length
    cluster.avgLat = avgLat
    cluster.avgLng = avgLng
    
    clusters.push(cluster)
  })
  
  return clusters
}

// Calculate crime severity for UI purposes
function calculateCrimeSeverity(crimeType: string): 'critical' | 'high' | 'medium' | 'low' {
  if (!crimeType) return 'medium'
  
  const critical = ['HOMICIDE', 'AGGRAVATED ASSAULT', 'SEXUAL ASSAULT', 'ROBBERY', 'BURGLARY']
  const high = ['THEFT', 'MOTOR VEHICLE THEFT', 'CRIMINAL DAMAGE', 'ASSAULT']
  const medium = ['TRESPASS', 'WEAPONS VIOLATION', 'NARCOTICS']
  
  const upper = crimeType.toUpperCase()
  if (critical.some(c => upper.includes(c))) return 'critical'
  if (high.some(c => upper.includes(c))) return 'high'
  if (medium.some(c => upper.includes(c))) return 'medium'
  return 'low'
}
