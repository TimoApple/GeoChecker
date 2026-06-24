// ArUco Marker Detector – pure JS, no native code
// Uses js-aruco2 with ARUCO_5X5_1000 dictionary (5x5 markers, 250 IDs)
// Das ist das korrekte Dictionary für die gedruckten Karten (aruco_001.svg – aruco_100.svg)

// Lokale Kopie von js-aruco2 mit ES-Modul-Export
import AR from '../libs/aruco';
// 5x5 Dictionary: named import, dann manuell in AR.DICTIONARIES registrieren
import { ARUCO_5X5_1000 } from '../libs/aruco_5x5_100';
AR.DICTIONARIES['ARUCO_5X5_1000'] = ARUCO_5X5_1000;

export interface ArucoResult {
  id: number;
  corners: { x: number; y: number }[];
  center: { x: number; y: number };
}

let detector: any = null;

function getDetector() {
  try {
    if (!detector) {
      detector = new AR.Detector({ dictionaryName: 'ARUCO_5X5_1000', maxHammingDistance: 3 });
    }
    return detector;
  } catch (e) {
    console.error('[ArUco] Failed to initialize detector:', e);
    return null;
  }
}

/**
 * Detect ArUco markers from raw image pixel data.
 * Uses js-aruco2's AR.Detector with ARUCO_5X5_1000 dictionary (5x5 markers, 250 IDs).
 * IDs werden 1:1 zurückgegeben – kein Offset.
 *
 * @param imageData - Uint8ClampedArray (RGBA, 4 bytes per pixel)
 * @param width - image width in pixels
 * @param height - image height in pixels
 * @returns Array of detected markers with id, corners, center
 */
export function detectMarkers(
  imageData: Uint8ClampedArray,
  width: number,
  height: number
): ArucoResult[] {
  const det = getDetector();
  if (!det) return [];

  try {
    const imgData = { data: imageData, width, height };
    const markers = det.detect(imgData);

    if (!markers || markers.length === 0) {
      return [];
    }

    const results = markers
      .filter((m: any) => m && m.id !== undefined && m.id >= 0 && m.id <= 249 && m.corners)
      .map((m: any) => {
        const corners = m.corners.map((c: any) => ({
          x: typeof c.x === 'number' ? c.x : c[0],
          y: typeof c.y === 'number' ? c.y : c[1],
        }));

        const centerX = corners.reduce((sum: number, c: { x: number }) => sum + c.x, 0) / corners.length;
        const centerY = corners.reduce((sum: number, c: { y: number }) => sum + c.y, 0) / corners.length;

        return {
          id: m.id,
          corners,
          center: { x: centerX, y: centerY },
        };
      });

    if (results.length > 0) {
      return results;
    }
  } catch (e) {
    console.error('[ArUco] Detection error:', e);
  }

  return [];
}

/**
 * Konvertiert RGBA-Daten (4 Bytes/Pixel) in Graustufen (1 Byte/Pixel).
 * js-aruco2 erwartet ein Graustufen-Array, kein RGBA.
 * Verwendet die Standard-Luminanz-Formel: 0.299*R + 0.587*G + 0.114*B
 */
export function toGrayscale(data: Uint8ClampedArray): Uint8ClampedArray {
  const len = data.length;
  const grayLen = len / 4;
  const gray = new Uint8ClampedArray(grayLen);
  for (let i = 0; i < grayLen; i++) {
    const offset = i * 4;
    gray[i] = Math.round(0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2]);
  }
  return gray;
}
