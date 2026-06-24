import { useCallback, useRef, useState, useEffect } from 'react';
import { CameraView } from 'expo-camera';
import jpeg from 'jpeg-js';
import { detectMarkers, ArucoResult } from '../utils/arucoDetector';
import { getLocations } from '../data/panoramaLocations';

const VALID_MARKER_IDS = new Set<number>();
try {
  const locs = getLocations();
  locs.forEach(l => {
    if (l.id >= 1) VALID_MARKER_IDS.add(l.id);
  });
  console.log('[ArUco] Gültige Marker-IDs in DB:', [...VALID_MARKER_IDS].sort((a, b) => a - b).join(', '));
} catch (e) {
  console.warn('[ArUco] Konnte gültige Marker-IDs nicht laden:', e);
}

const SCAN_INTERVAL_MS = 250;

export function useArucoScanner(
  externalCameraRef?: React.RefObject<CameraView>,
  callbacks?: {
    onDetected?: (ids: number[]) => void;
    onError?: (error: string) => void;
  }
) {
  const [isScanning, setIsScanning] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [lastResult, setLastResult] = useState<ArucoResult[] | null>(null);
  const internalCameraRef = useRef<CameraView>(null);
  const cameraRef = externalCameraRef ?? internalCameraRef;
  const isScanningRef = useRef(false);
  const isProcessingRef = useRef(false);
  const fallbackModeRef = useRef(false);
  const consecutiveErrorsRef = useRef(0);
  const cameraReadyRef = useRef(false);

  useEffect(() => {
    console.log('[ArUco] Hook mounted');
    return () => {
      console.log('[ArUco] Cleanup – Hook wird unmounted');
      isScanningRef.current = false;
    };
  }, []);

  // cameraReadyRef synchron halten
  useEffect(() => {
    cameraReadyRef.current = cameraReady;
  }, [cameraReady]);

  const processImageData = useCallback((width: number, height: number, rawData: Uint8ClampedArray): ArucoResult[] => {
    const contrastData = new Uint8ClampedArray(rawData.length);
    for (let i = 0; i < rawData.length; i += 4) {
      const r = rawData[i], g = rawData[i + 1], b = rawData[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const val = lum > 90 ? 255 : 0;
      contrastData[i] = val;
      contrastData[i + 1] = val;
      contrastData[i + 2] = val;
      contrastData[i + 3] = 255;
    }
    return detectMarkers(contrastData, width, height);
  }, []);

  const decodeAndDetect = useCallback((base64: string): { markers: ArucoResult[], width: number, height: number } | null => {
    try {
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const decoded = jpeg.decode(bytes, { useTArray: true });
      const rawData = new Uint8ClampedArray(
        decoded.data.buffer,
        decoded.data.byteOffset,
        decoded.data.length
      );
      const markers = processImageData(decoded.width, decoded.height, rawData);
      return { markers, width: decoded.width, height: decoded.height };
    } catch (e) {
      console.error('[ArUco] decodeAndDetect Fehler:', e);
      return null;
    }
  }, [processImageData]);

  const handleDetectedMarkers = useCallback((markers: ArucoResult[]): number[] => {
    setLastResult(markers);
    if (markers.length === 0) return [];

    // IDs 1:1 – kein Offset
    const validIds = markers.map(m => m.id).filter(id => VALID_MARKER_IDS.has(id));
    if (validIds.length === 0) return [];

    callbacks?.onDetected?.(validIds);
    return validIds;
  }, [callbacks]);

  // Einzelner Scan-Durchlauf – gibt true zurück wenn Marker gefunden
  const runSingleScan = useCallback(async (): Promise<boolean> => {
    if (!cameraRef.current) {
      console.error('[ArUco] CameraRef nicht verfügbar');
      return false;
    }
    if (!cameraReadyRef.current) {
      return false;
    }

    try {
      let base64: string | undefined;

      if (fallbackModeRef.current) {
        // Fallback: ohne skipProcessing
        const photo = await Promise.race([
          cameraRef.current.takePictureAsync({ quality: 0.1, base64: true }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('takePicture timeout')), 8000)),
        ]);
        base64 = photo?.base64;
      } else {
        // Hauptpfad: minimal, schnell
        const photo = await Promise.race([
          cameraRef.current.takePictureAsync({ quality: 0.1, skipProcessing: true, base64: true }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('takePicture timeout')), 8000)),
        ]);
        base64 = photo?.base64;
      }

      if (!base64) return false;

      consecutiveErrorsRef.current = 0;

      const result = decodeAndDetect(base64);
      if (!result) return false;

      // Verarbeitungs-Sperre: kein weiterer Frame während UI noch rendert
      if (result.markers.length > 0 && !isProcessingRef.current) {
        isProcessingRef.current = true;
        stopScanning();
        const ids = result.markers.map(m => m.id).filter(id => VALID_MARKER_IDS.has(id));
        callbacks?.onDetected?.(ids);
        return true;
      }

      const ids = handleDetectedMarkers(result.markers);
      return ids.length > 0;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      consecutiveErrorsRef.current++;

      if (consecutiveErrorsRef.current >= 3 && !fallbackModeRef.current) {
        console.log('[ArUco] AKTIVIERE FALLBACK-MODUS (ohne skipProcessing)');
        fallbackModeRef.current = true;
      }

      // Stille Fehler (kein onError-Callback, kein UI-Noise)
      if (
        msg.includes('timeout') ||
        msg.includes('ExpoCameraView') ||
        msg.includes('Unable to find') ||
        msg.includes('ERR_IMAGE_CAPTURE_FAILED') ||
        msg.includes('ERR_VIEW_NOT_FOUND')
      ) {
        return false;
      }

      console.error('[ArUco] FEHLER in runSingleScan:', msg);
      return false;
    }
  }, [cameraRef, decodeAndDetect, handleDetectedMarkers]);

  // Kontinuierliche Scan-Schleife via setTimeout
  const scanLoop = useCallback(async () => {
    if (!isScanningRef.current) return;

    const found = await runSingleScan();

    if (found) {
      // Marker gefunden → Schleife stoppen
      isScanningRef.current = false;
      setIsScanning(false);
      return;
    }

    if (isScanningRef.current) {
      setTimeout(scanLoop, SCAN_INTERVAL_MS);
    }
  }, [runSingleScan]);

  const startScanning = useCallback(() => {
    if (isScanningRef.current) {
      console.log('[ArUco] Scan läuft bereits, ignoriert');
      return;
    }
    if (!cameraReadyRef.current) {
      console.log('[ArUco] Kamera noch nicht bereit, startScanning ignoriert');
      return;
    }

    console.log('[ArUco] startScanning – Loop startet');
    isScanningRef.current = true;
    isProcessingRef.current = false;
    setIsScanning(true);
    setLastResult(null);
    consecutiveErrorsRef.current = 0;
    fallbackModeRef.current = false;

    setTimeout(scanLoop, 0);
  }, [scanLoop]);

  const stopScanning = useCallback(() => {
    console.log('[ArUco] stopScanning');
    isScanningRef.current = false;
    setIsScanning(false);
  }, []);

  const onCameraReadyHandler = useCallback(() => {
    console.log('[ArUco] Kamera bereit');
    setCameraReady(true);
  }, []);

  return {
    startScanning,
    stopScanning,
    isScanning,
    cameraReady,
    lastResult,
    cameraRef,
    onCameraReady: onCameraReadyHandler,
  };
}