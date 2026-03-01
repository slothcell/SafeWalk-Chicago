/**
 * Navigation step utilities for turn-by-turn directions
 */

export interface NavigationStep {
  index: number
  instruction: string // HTML content with <b> tags for street names
  plainInstruction: string // Plain text for voice
  distance: number // in meters
  duration: number // in seconds
  startLocation: { lat: number; lng: number }
  endLocation: { lat: number; lng: number }
  maneuver?: string // e.g., "turn-right", "turn-left", "straight"
}

/**
 * Extract navigation steps from Google Directions API response
 */
export function extractNavigationSteps(directionsRoute: any): NavigationStep[] {
  const steps: NavigationStep[] = []
  
  if (!directionsRoute || !directionsRoute.legs) {
    console.warn('[Navigation] No legs found in directions route')
    return steps
  }

  let stepIndex = 0
  
  directionsRoute.legs.forEach((leg: any, legIndex: number) => {
    if (!leg.steps) return
    
    leg.steps.forEach((step: any) => {
      const startLoc = step.start_location
      const endLoc = step.end_location
      
      // Clean up HTML instruction (remove tags for speech)
      const plainText = step.html_instructions
        ? step.html_instructions
            .replace(/<[^>]*>/g, '') // Remove all HTML tags
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .trim()
        : 'Continue'
      
      steps.push({
        index: stepIndex,
        instruction: step.html_instructions || 'Continue',
        plainInstruction: plainText,
        distance: step.distance?.value || 0,
        duration: step.duration?.value || 0,
        startLocation: startLoc ? { lat: startLoc.lat(), lng: startLoc.lng() } : { lat: 0, lng: 0 },
        endLocation: endLoc ? { lat: endLoc.lat(), lng: endLoc.lng() } : { lat: 0, lng: 0 },
        maneuver: step.maneuver || ''
      })
      
      stepIndex++
    })
  })
  
  return steps
}

/**
 * Calculate if the user is at a step based on distance
 */
export function findCurrentStepIndex(
  userLocation: [number, number],
  steps: NavigationStep[],
  proximityRadiusMeters: number = 50
): number {
  if (steps.length === 0) return -1
  
  // Calculate distance to each step's end location
  const distances = steps.map(step => {
    const dist = calculateDistance(
      userLocation,
      [step.endLocation.lng, step.endLocation.lat]
    )
    return dist * 1000 // convert km to meters
  })
  
  // Find the closest step we haven't passed yet, or the last one if we've passed them all
  const currentIdx = distances.findIndex(d => d < proximityRadiusMeters)
  
  if (currentIdx !== -1) {
    return currentIdx
  }
  
  // If no step is within proximity, return the index with smallest distance that's ahead
  let closestAheadIdx = 0
  let closestDistance = Infinity
  
  for (let i = 0; i < distances.length; i++) {
    const d = distances[i]
    if (d !== undefined && d < closestDistance) {
      closestDistance = d
      closestAheadIdx = i
    }
  }
  
  return closestAheadIdx
}

/**
 * Calculate distance between two coordinates (returns km)
 */
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

/**
 * Get voice guidance using Web Speech API
 */
export function playVoiceGuidance(text: string) {
  // Silence any ongoing speech
  window.speechSynthesis.cancel()
  
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.95 // Slightly slower for clarity
  utterance.pitch = 1
  utterance.volume = 1
  
  // Prefer English voice if available
  const voices = window.speechSynthesis.getVoices()
  const engVoice = voices.find(v => v.lang.startsWith('en'))
  if (engVoice) {
    utterance.voice = engVoice
  }
  
  window.speechSynthesis.speak(utterance)
  console.log('[Voice] Speaking:', text)
}

/**
 * Format distance for display
 */
export function formatDistanceForDisplay(meters: number): string {
  if (meters < 100) {
    return 'in a few steps'
  }
  if (meters < 1000) {
    return `in ${Math.round(meters / 10) * 10} ft`
  }
  return `in ${(meters / 1000).toFixed(1)} mi`
}

/**
 * Format duration for display
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return Math.round(seconds) + ' sec'
  }
  const mins = Math.round(seconds / 60)
  return mins + ' min'
}
