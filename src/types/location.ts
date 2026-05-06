// GeoCheckr — Location Type Definition
export interface Location {
  id: number;
  city: string;
  country: string;
  region: string;
  continent: string;
  lat: number;
  lng: number;
  difficulty: 'leicht' | 'mittel' | 'schwer';
  qrCode: string;
  landmark?: string; // Optional landmark name
  hint?: string; // Optional hint for easier difficulty
  
  // Street View / Bild-Daten (von Timo kuratiert)
  streetViewUrl?: string;      // Google Street View Link ODER Mapillary URL
  streetViewCoords?: {         // Exakte Koordinaten des Bildes (falls abweichend von Stadtzentrum)
    lat: number;
    lng: number;
  };
  streetViewDescription?: string; // Kurzbeschreibung was man sieht (für Timo's Referenz)
  isPlaceholder?: boolean;     // true = Daten müssen noch von Timo ersetzt werden
}
