// Google Maps based routing utilities

const GOOGLE_KEY = (import.meta.env.VITE_GOOGLE_MAPS_KEY as string) || ''
if (!GOOGLE_KEY) {
  console.warn('VITE_GOOGLE_MAPS_KEY is not set; geocoding and directions will fail')
}

type RouteScore = {
  routeIndex: number
  crimeCount: number
  totalScore: number
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

export async function fetchRecentCrimes(bbox: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const url = `https://data.cityofchicago.org/resource/ijzp-q8t2.json?$where=date > '${sevenDaysAgo}' AND within_box(location, ${bbox})`
  try {
    const res = await fetch(url)
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch (err) {
    console.warn('Failed to fetch crimes (non-critical):', err)
    return []
  }
}

function computeBBox(coords: [number, number][]): string {
  const lons = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  return `${Math.min(...lats)},${Math.min(...lons)},${Math.max(...lats)},${Math.max(...lons)}`
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
    const crimes = await fetchRecentCrimes(bbox)
    console.log('Found', crimes.length, 'crimes in route', i)
    const crimeCount = crimes.length
    const totalScore = crimeCount
    results.push({
      routeIndex: i,
      crimeCount,
      totalScore,
      routeData: { route, coords }
    })
  }
  console.log('All routes scored. Results:', results)
  return results.sort((a, b) => a.totalScore - b.totalScore)
}

// Score routes when routes are already obtained from DirectionsService (client-side)
export async function scoreRoutesFromDirections(directions: any[]): Promise<RouteScore[]> {
  console.log('scoreRoutesFromDirections called with', directions.length, 'routes')
  const results: RouteScore[] = []
  for (let i = 0; i < directions.length; i++) {
    const route = directions[i]
    console.log('Processing route', i, ':', route)
    const polyline = route.overview_polyline?.points || ''
    console.log('Polyline for route', i, ':', (polyline || '').substring(0, 50) + '...')
    const coords: [number, number][] = decodePolyline(polyline).map(p => [p.lng, p.lat]);
    console.log('Decoded', coords.length, 'coordinates for route', i)
    const bbox = computeBBox(coords)
    console.log('BBox for route', i, ':', bbox)
    const crimes = await fetchRecentCrimes(bbox)
    console.log('Found', crimes.length, 'crimes in route', i)
    const crimeCount = crimes.length
    const totalScore = crimeCount
    results.push({
      routeIndex: i,
      crimeCount,
      totalScore,
      routeData: {
        directions: route,
        coords: [],
        geometry: extractRouteGeometry(route)
      }
    })
  }
  console.log('All directions-based routes scored. Results:', results)
  return results.sort((a, b) => a.totalScore - b.totalScore)
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
      if (!c.location || !c.location.latitude || !c.location.longitude) return false;
      const lat = parseFloat(c.location.latitude);
      const lng = parseFloat(c.location.longitude);
      return (
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
