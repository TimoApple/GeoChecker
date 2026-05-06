// GeoCheckr — API Configuration
// Add your Google Maps API Key here when available

export const API_CONFIG = {
  // Google Maps Embed API Key (kostenlos bis 28K Requests/Monat)
  // Get it at: https://console.cloud.google.com/apis/library/maps-embed-api
  GOOGLE_MAPS_API_KEY: 'AIzaSyCl3ogHqguF1QcwhyHdvJmUkbgx3bpKLJI',  // ✅ Timo 17.03

  // Street View Static API (optional, $7/1000 Requests)
  STREET_VIEW_API_KEY: '',

  // App Settings
  DEFAULT_TIMER_SECONDS: 30,
  DEFAULT_ROUNDS: 10,
  DEFAULT_DIFFICULTY: 'mittel' as 'leicht' | 'mittel' | 'schwer',

  // Points
  POINTS_PERFECT: 3,    // < 100km
  POINTS_GOOD: 2,       // < 500km
  POINTS_OK: 1,         // < 2000km
  POINTS_MISS: 0,       // >= 2000km
};

// Generate Street View URL using Maps Embed API (designed for WebView, no consent)
export function getPanoramaEmbedUrl(lat: number, lng: number, apiKey?: string): string {
  const key = apiKey || API_CONFIG.GOOGLE_MAPS_API_KEY;
  return `https://www.google.com/maps/embed/v1/streetview?key=${key}&location=${lat},${lng}&heading=0&pitch=0&fov=90`;
}

// Check if API key is configured
export function hasApiKey(): boolean {
  return API_CONFIG.GOOGLE_MAPS_API_KEY.length > 0;
}
