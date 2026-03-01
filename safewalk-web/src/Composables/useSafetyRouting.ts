import mapboxgl from 'mapbox-gl'

const MAPBOX_TOKEN = 'YOUR_TOKEN'
mapboxgl.accessToken = MAPBOX_TOKEN

type RouteScore = {
  routeIndex: number
  congestionScore: number
  crimeCount: number
  totalScore: number
}

// Fetch routes with traffic annotations
export async function fetchRoutes(
  origin: [number, number],
  dest: [number, number]
) {
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${origin.join(',')};${dest.join(',')}?alternatives=true&geometries=geojson&annotations=congestion&overview=full&access_token=${MAPBOX_TOKEN}`

  const res = await fetch(url)
  const data = await res.json()
  return data.routes
}

// Fetch last 7 days of crime in bounding box
export async function fetchRecentCrimes(bbox: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()

  const url = `https://data.cityofchicago.org/resource/ijzp-q8t2.json?$where=date > '${sevenDaysAgo}' AND within_box(location, ${bbox})`

  const res = await fetch(url)
  return res.json()
}

// Convert congestion levels to numeric score
function congestionToScore(level: string): number {
  switch (level) {
    case 'low': return 1
    case 'moderate': return 2
    case 'heavy': return 3
    case 'severe': return 4
    default: return 0
  }
}

// Compute bounding box from route geometry
function computeBBox(coords: [number, number][]): string {
  const lons = coords.map(c => c[0])
  const lats = coords.map(c => c[1])
  return `${Math.min(...lats)},${Math.min(...lons)},${Math.max(...lats)},${Math.max(...lons)}`
}

// Score routes
export async function scoreRoutes(
  origin: [number, number],
  dest: [number, number]
): Promise<RouteScore[]> {

  const routes = await fetchRoutes(origin, dest)

  const results: RouteScore[] = []

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i]

    const congestionLevels: string[] =
      route.legs[0].annotation.congestion

    const congestionScore =
      congestionLevels.reduce((sum, lvl) => sum + congestionToScore(lvl), 0) /
      congestionLevels.length

    const coords: [number, number][] = route.geometry.coordinates
    const bbox = computeBBox(coords)

    const crimes = await fetchRecentCrimes(bbox)

    const crimeCount = crimes.length

    // Weighted safety score (tune weights live during demo)
    const totalScore =
      (congestionScore * 2) + (crimeCount * 0.5)

    results.push({
      routeIndex: i,
      congestionScore,
      crimeCount,
      totalScore
    })
  }

  return results.sort((a, b) => a.totalScore - b.totalScore)
}