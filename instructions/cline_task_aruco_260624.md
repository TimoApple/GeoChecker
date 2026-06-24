# Cline Task: ArUco Live-Intervall-Scanner

## Kontext & App-Überblick
- React Native App mit Expo (kein Prebuild, kein Eject)
- Spielprinzip: Spieler scannt eine physische ArUco-Karte mit der Kamera → App lädt Panorama-Bild des Ortes → Spieler tippen den nächstgelegenen Ort auf dem Tisch → Punkte vergeben
- Kein react-native-vision-camera, kein nativer Frame Processor — alles bleibt in Expo

## Relevante Dateien
- `src/hooks/useArucoScanner.ts` — ArUco-Scan-Hook
- `src/screens/GameScreen.tsx` — Spielscreen mit Kamera-UI
- `src/utils/arucoDetector.ts` — ArUco-Erkennung (bleibt unverändert)
- `src/data/panoramaLocations.ts` — Ortsdaten (bleibt unverändert)

## Aktuelles Problem
Der Scanner funktioniert prinzipiell, hat aber zwei Bugs:
1. `startScanning()` wird automatisch per `useEffect` ausgelöst, bevor die Kamera wirklich bereit ist → "CameraRef nie verfügbar" Fehler
2. `takePictureAsync` blockiert den UI-Thread und ist fragil → Timeouts und ERR_IMAGE_CAPTURE_FAILED

## Was du tun sollst

### 1. `useArucoScanner.ts` umbauen

**Ziel:** Kontinuierliche Schleife alle 250 ms, die vollautomatisch und lautlos scannt.

- `takePictureAsync` mit minimalen Optionen:
  ```ts
  { quality: 0.1, skipProcessing: true, base64: true }
  ```
- Kein FileSystem-Umweg mehr — `base64` direkt aus dem Foto verwenden
- Kein ImageManipulator mehr nötig (spart Zeit)
- Schleife via `setTimeout` alle 250 ms, solange `isScanningRef.current === true`
- Sofortiger Abbruch der Schleife, sobald ein gültiger Marker gefunden wird
- `startScanning()` startet die Schleife
- `stopScanning()` setzt `isScanningRef.current = false` → Schleife endet nach aktuellem Durchlauf
- **WICHTIG:** Schleife darf erst laufen, wenn `cameraReady === true` (wird von außen per Callback gesetzt)

### 2. `GameScreen.tsx` anpassen

**Ziel:** Kamera läuft flüssig, Scan passiert automatisch im Hintergrund.

- `CameraView` bekommt `onCameraReady={() => setCameraReady(true)}`
- `useEffect` startet `startScanning()` erst, wenn `phase === 'scan-qr' && cameraReady === true`
- Kein manueller "SCANNEN"-Button mehr nötig — stattdessen visueller Indikator z.B. "SUCHE MARKER..." mit `isScanning`-State
- `stopScanning()` wird weiterhin aufgerufen, wenn `phase !== 'scan-qr'`
- `loadNewCard`-Button bleibt erhalten (für kaputte/fehlende Karten)

### 3. Was NICHT geändert werden soll
- `arucoDetector.ts` — bleibt unverändert
- `panoramaLocations.ts` — bleibt unverändert
- `PanoramaViewer.tsx` — bleibt unverändert
- Game-Flow (pick/challenge/result/timer) — bleibt unverändert
- Scoring-Logik — bleibt unverändert

## Wichtige technische Details
- `VALID_MARKER_IDS` enthält IDs 1–39 (aus panoramaLocations.ts)
- ArUco-Dictionary: `DICT_7X7_250`
- `handleDetectedMarkers` mapped `m.id + 1` auf die DB-IDs
- Fallback-Modus (base64:true) ist bereits vorhanden und soll bleiben
- `consecutiveErrorsRef` zählt Fehler für Fallback-Aktivierung

## Erwartetes Verhalten nach dem Umbau
1. Spieler öffnet Scan-Screen → Kamera startet sofort
2. Sobald `onCameraReady` feuert → Schleife startet automatisch
3. Alle 250 ms wird ein Mini-Bild analysiert
4. Sobald Marker gefunden → Schleife stoppt, `onDetected` callback feuert, Phase wechselt zu `view`
5. Kein UI-Einfrieren, kein manueller Button nötig
6. Auf echtem Gerät: Erkennung innerhalb 1–3 Sekunden

## Bekannte Fallstricke
- `takePictureAsync` mit `skipProcessing: true` funktioniert auf manchen Android-Geräten nicht → Fallback ohne `skipProcessing` einbauen
- Hook wird mehrfach remountet wenn Phase wechselt → `isActiveRef` Guards sind wichtig
- `console.log` im Hook nur für Fehler, nicht für jeden Frame (Performance)


## Datenquelle & Admin-System

### Woher kommen die Ortsdaten?
- Es gibt ein Admin-Backend unter **timoboese.com/pamo/admin.html**
- Dort werden Panorama-Orte gepflegt: Name, Bezirk, GPS-Koordinaten, Panorama-URL (AVIF), ArUco-Marker-ID
- Aus dem Admin-Panel wird eine **JSON-Datei exportiert**
- Diese JSON liegt unter `assets/` im Projekt und wird von `src/data/panoramaLocations.ts` geladen

### Struktur eines Eintrags (PanoramaLocation)
```ts
interface PanoramaLocation {
  id: number;        // = ArUco Marker ID (1–39 aktuell)
  name: string;      // Ortsname (z.B. "Alexanderplatz")
  district: string;  // Bezirk (z.B. "Mitte")
  lat: number;       // Breitengrad
  lng: number;       // Längengrad
  url_avif: string;  // URL zum Panorama-Bild
  qr_data: string;   // QR-Code-Daten (legacy, wird kaum genutzt)
}
```

### Was Cline wissen muss
- Die JSON aus dem Admin wird **nicht dynamisch geladen** — sie liegt statisch in `assets/` und wird beim Build eingebunden
- `panoramaLocations.ts` exportiert `getLocations()` und `findLocationById(id: number)`
- Die ArUco-Marker-ID auf der physischen Karte entspricht direkt dem `id`-Feld in der JSON
- Aktuell sind 39 Orte (IDs 1–39) in der Datenbank
- `VALID_MARKER_IDS` im Hook wird aus `getLocations()` befüllt — so werden nur bekannte Karten akzeptiert

### Was nicht geändert werden soll
- `panoramaLocations.ts` und die Assets-JSON bleiben vollständig unverändert
- Das Admin-System und der Export-Workflow sind außerhalb des Projekts
