import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Vibration, ScrollView, Dimensions
} from 'react-native';
import { CameraView } from 'expo-camera';
import { useArucoScanner } from '../hooks/useArucoScanner';
import { calculateDistance, formatDistance } from '../utils/distance';
import { playClickSound, playErrorSound, playPerfectSound, playTimerWarning, playTimerTick } from '../utils/sounds';
import { PanoramaLocation, getRandomLocation, findLocationById } from '../data/panoramaLocations';
import PanoramaViewer from '../components/PanoramaViewer';

const { width } = Dimensions.get('window');

const C = {
  bg: '#262523',
  surface: '#2e2d2b',
  surfaceHigh: '#3a3836',
  primary: '#F2A344',
  onPrimary: '#262523',
  onSurface: '#F1E8E1',
  outline: '#6b6560',
  error: '#D9593C',
  muted: '#8a8580',
};

const FF = {
  regular: 'SpaceGrotesk_400Regular',
  bold: 'SpaceGrotesk_700Bold',
};

interface Player {
  id: number;
  name: string;
  city: string;
  cityId: number;
  lat: number;
  lng: number;
  score: number;
}

interface TableCity {
  city: string;
  lat: number;
  lng: number;
  ownerPlayerId: number | null;
  isPlayerCity: boolean;
}

interface Props {
  players: Player[];
  timerSetting: number;
  roundsSetting: number;
  onGameEnd: (finalPlayers: Player[]) => void;
  onBackToSetup: () => void;
}

export default function GameScreen({ players: initialPlayers, timerSetting, roundsSetting, onGameEnd, onBackToSetup }: Props) {
  const [players, setPlayers] = useState(initialPlayers.map(p => ({ ...p, score: 0 })));
  const [tableCities, setTableCities] = useState<TableCity[]>(
    initialPlayers.map(p => ({ city: p.city, lat: p.lat, lng: p.lng, ownerPlayerId: p.id, isPlayerCity: true }))
  );
  const [activePlayerIdx, setActivePlayerIdx] = useState(0);
  const [round, setRound] = useState(1);
  const [maxRounds, setMaxRounds] = useState(roundsSetting * initialPlayers.length);
  const [location, setLocation] = useState<PanoramaLocation | null>(null);
  const [usedLocations, setUsedLocations] = useState<number[]>([]);
  const [phase, setPhase] = useState<'scan-qr' | 'view' | 'pick' | 'challenge' | 'result'>('scan-qr');
  const [challengerId, setChallengerId] = useState<number | null>(null);
  const [activePickIdx, setActivePickIdx] = useState<number | null>(null);
  const [timer, setTimer] = useState(timerSetting);
  const [timerPaused, setTimerPaused] = useState(false);
  const [svLoaded, setSvLoaded] = useState(false);
  const [svError, setSvError] = useState(false);
  const [svLoadingLong, setSvLoadingLong] = useState(false);
  const [closestCityIdx, setClosestCityIdx] = useState<number | null>(null);
  const [distances, setDistances] = useState<number[]>([]);
  const [winnerId, setWinnerId] = useState<number | null>(null);
  const [scanError, setScanError] = useState('');

  const timerPulse = useRef(new Animated.Value(1)).current;
  const resultScale = useRef(new Animated.Value(0)).current;
  const cameraRef = useRef<CameraView>(null);

  const onDetected = useCallback((ids: number[]) => {
    if (ids.length === 0) return;
    const id = ids[0];
    const loc = findLocationById(id);
    if (!loc) {
      setScanError('Dieser Ort wurde nicht gefunden.');
      setTimeout(() => setScanError(''), 2500);
      return;
    }

    if (usedLocations.includes(id)) {
      setScanError('Diese Stadt liegt bereits auf dem Tisch!');
      setTimeout(() => setScanError(''), 2500);
      return;
    }

    if (tableCities.some(tc => tc.city.toLowerCase() === loc.name.toLowerCase())) {
      setScanError('Diese Stadt liegt bereits auf dem Tisch!');
      setTimeout(() => setScanError(''), 2500);
      return;
    }

    playClickSound();
    Vibration.vibrate(100);
    setLocation(loc);
    setUsedLocations(prev => [...prev, id]);
    setTimer(timerSetting);
    setTimerPaused(false);
    setSvLoaded(false);
    setSvError(false);
    setPhase('view');
  }, [timerSetting, usedLocations, tableCities]);

  const onError = useCallback((err: string) => {
    setScanError(err);
    setTimeout(() => setScanError(''), 2500);
  }, []);

  const scannerCallbacks = useMemo(() => ({ onDetected, onError }), [onDetected, onError]);
  const { startScanning, stopScanning, isScanning, cameraReady, onCameraReady } = useArucoScanner(cameraRef as any, scannerCallbacks);

  // Auto-Start: Scan beginnt sobald Phase 'scan-qr' UND Kamera bereit
  useEffect(() => {
    if (phase === 'scan-qr' && cameraReady) {
      startScanning();
    } else {
      stopScanning();
    }
  }, [phase, cameraReady]);

  // Timer-Countdown
  useEffect(() => {
    if (phase !== 'view' || timerPaused || timer <= 0) return;
    const interval = setInterval(() => setTimer(t => t - 1), 1000);
    return () => clearInterval(interval);
  }, [phase, timerPaused, timer]);

  // Timer-Effekte (Pulse + Sound)
  useEffect(() => {
    if (timer <= 10 && timer > 0 && phase === 'view') {
      playTimerTick();
      Vibration.vibrate(200);
      Animated.sequence([
        Animated.timing(timerPulse, { toValue: 1.3, duration: 150, useNativeDriver: true }),
        Animated.timing(timerPulse, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    }
    if (timer === 0 && phase === 'view') {
      playTimerWarning();
      Vibration.vibrate(500);
      setPhase('pick');
    }
  }, [timer, phase, timerPulse]);

  // Ladezeit-Indikator für Panorama
  useEffect(() => {
    if (phase !== 'view' || svLoaded || svError) {
      setSvLoadingLong(false);
      return;
    }
    const t = setTimeout(() => setSvLoadingLong(true), 5000);
    return () => clearTimeout(t);
  }, [phase, svLoaded, svError, location]);

  const activePlayer = players[activePlayerIdx];
  const isLastRound = round >= maxRounds;

  const startRound = useCallback(() => {
    setPhase('scan-qr');
    setSvLoaded(false);
    setSvError(false);
    setSvLoadingLong(false);
    setClosestCityIdx(null);
    setDistances([]);
    setWinnerId(null);
    setChallengerId(null);
    setActivePickIdx(null);
    setTimer(timerSetting);
    setTimerPaused(false);
    resultScale.setValue(0);
  }, [timerSetting, resultScale]);

  const loadNewCard = useCallback(() => {
    const newLoc = getRandomLocation(usedLocations);
    setLocation(newLoc);
    setUsedLocations(prev => [...prev, newLoc.id]);
    setSvLoaded(false);
    setSvError(false);
    setSvLoadingLong(false);
    setTimer(timerSetting);
    setTimerPaused(false);
  }, [usedLocations, timerSetting]);

  const pickCity = useCallback((idx: number) => {
    if (!location) return;
    playClickSound();
    setTimerPaused(true);
    setActivePickIdx(idx);
    setPhase('challenge');
    setChallengerId(null);
  }, [location]);

  const resolveRound = useCallback(() => {
    if (activePickIdx === null || !location) return;

    const dists = tableCities.map(tc => calculateDistance(location.lat, location.lng, tc.lat, tc.lng));
    setDistances(dists);

    let minIdx = 0;
    for (let i = 1; i < dists.length; i++) {
      if (dists[i] < dists[minIdx]) minIdx = i;
    }
    setClosestCityIdx(minIdx);

    const originalCorrect = activePickIdx === minIdx;

    if (challengerId !== null) {
      if (originalCorrect) {
        playPerfectSound();
        Vibration.vibrate([100, 50, 100]);
        setPlayers(prev => prev.map(p => p.id === players[activePlayerIdx].id ? { ...p, score: p.score + 1 } : p));
        setWinnerId(players[activePlayerIdx].id);
      } else {
        playPerfectSound();
        Vibration.vibrate([100, 50, 100]);
        setPlayers(prev => prev.map(p => p.id === challengerId ? { ...p, score: p.score + 1 } : p));
        setWinnerId(challengerId);
      }
    } else {
      if (originalCorrect) {
        playPerfectSound();
        Vibration.vibrate([100, 50, 100]);
        setPlayers(prev => prev.map(p => p.id === players[activePlayerIdx].id ? { ...p, score: p.score + 1 } : p));
        setWinnerId(players[activePlayerIdx].id);
      } else {
        playErrorSound();
        Vibration.vibrate(500);
        setWinnerId(null);
      }
    }

    setTableCities(prev => [...prev, { city: location.name, lat: location.lat, lng: location.lng, ownerPlayerId: null, isPlayerCity: false }]);
    Animated.spring(resultScale, { toValue: 1, friction: 6, useNativeDriver: true }).start();
    setPhase('result');
  }, [activePickIdx, location, tableCities, challengerId, activePlayerIdx, players, resultScale]);

  const nextTurn = () => {
    playClickSound();
    if (round >= maxRounds) {
      onGameEnd(players);
      return;
    }
    setActivePlayerIdx(prev => (prev + 1) % players.length);
    setRound(r => r + 1);
    startRound();
  };

  // ─── SCAN-QR PHASE ───
  if (phase === 'scan-qr') {
    return (
      <View style={s.container}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" onCameraReady={onCameraReady} />
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', paddingHorizontal: 30, paddingTop: 60, paddingBottom: 40 }}>
          <View>
            <Text style={{ color: C.muted, fontSize: 13, fontFamily: FF.bold, letterSpacing: 2, marginBottom: 8 }}>RUNDE {round}/{maxRounds}</Text>
            <Text style={{ color: C.onSurface, fontSize: 24, fontFamily: FF.bold, marginBottom: 4 }}>{activePlayer.name}</Text>
            <Text style={{ color: C.muted, fontSize: 14, fontFamily: FF.regular }}>Punkte: {activePlayer.score}</Text>
          </View>

          <View style={{ alignItems: 'center' }}>
            {/* Scan-Rahmen */}
            <View style={{ width: 240, height: 240, borderWidth: 2, borderColor: isScanning ? C.primary : C.outline, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: isScanning ? C.primary : C.muted, fontSize: 13, fontFamily: FF.regular, textAlign: 'center' }}>
                {!cameraReady
                  ? 'Kamera wird geladen...'
                  : isScanning
                    ? 'SUCHE MARKER...'
                    : 'Karte in den Rahmen halten'}
              </Text>
            </View>

            {/* Fehler-Anzeige */}
            {scanError ? (
              <View style={{ backgroundColor: 'rgba(255,100,100,0.9)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20, marginTop: 16 }}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>{scanError}</Text>
              </View>
            ) : null}

            {/* Scanning-Indikator */}
            {isScanning && (
              <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary }} />
                <Text style={{ color: C.primary, fontSize: 12, fontFamily: FF.bold, letterSpacing: 1 }}>AKTIV</Text>
              </View>
            )}
          </View>

          {/* loadNewCard-Button bleibt erhalten (für kaputte/fehlende Karten) */}
          <TouchableOpacity
            style={[s.secondaryBtn]}
            onPress={loadNewCard}
          >
            <Text style={s.secondaryBtnText}>NEUE KARTE LADEN</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── VIEW PHASE ───
  if (phase === 'view' && location) {
    return (
      <View style={s.container}>
        <View style={{ position: 'absolute', top: 50, left: 0, right: 0, zIndex: 10, alignItems: 'center' }}>
          <Animated.View style={{ backgroundColor: timer <= 10 ? C.error : 'rgba(0,0,0,0.6)', paddingVertical: 6, paddingHorizontal: 20, transform: [{ scale: timerPulse }] }}>
            <Text style={{ color: '#fff', fontSize: 28, fontFamily: FF.bold }}>{timer}</Text>
          </Animated.View>
        </View>

        <PanoramaViewer
          key={`${location.id}-${round}-${phase}`}
          url={location.url_avif}
          onLoad={() => setSvLoaded(true)}
          onError={() => setSvError(true)}
        />

        {!svLoaded && !svError && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)' }}>
            <Text style={{ color: C.primary, fontSize: 16, fontFamily: FF.bold }}>Panorama wird geladen...</Text>
            {svLoadingLong && (
              <TouchableOpacity style={{ marginTop: 20, backgroundColor: C.primary, paddingVertical: 12, paddingHorizontal: 24 }} onPress={loadNewCard}>
                <Text style={{ color: C.onPrimary, fontSize: 14, fontFamily: FF.bold }}>NEUE KARTE LADEN</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {svError && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)' }}>
            <Text style={{ color: C.error, fontSize: 16, fontFamily: FF.bold, marginBottom: 20 }}>Fehler beim Laden</Text>
            <TouchableOpacity style={s.primaryBtn} onPress={loadNewCard}>
              <Text style={s.primaryBtnText}>NEUE KARTE LADEN</Text>
            </TouchableOpacity>
          </View>
        )}

        {svLoaded && (
          <View style={{ position: 'absolute', bottom: 40, left: 20, right: 20 }}>
            <TouchableOpacity style={s.primaryBtn} onPress={() => setPhase('pick')}>
              <Text style={s.primaryBtnText}>ORT WÄHLEN</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ─── PICK PHASE ───
  if (phase === 'pick') {
    return (
      <View style={s.container}>
        <View style={{ paddingHorizontal: 20, paddingTop: 60, flex: 1 }}>
          <Text style={{ color: C.muted, fontSize: 13, fontFamily: FF.bold, letterSpacing: 2, marginBottom: 8 }}>ORT WÄHLEN</Text>
          <Text style={{ color: C.onSurface, fontSize: 18, fontFamily: FF.bold, marginBottom: 20 }}>{activePlayer.name}, welcher Ort liegt am nächsten?</Text>
          <ScrollView>
            {tableCities.map((tc, i) => (
              <TouchableOpacity
                key={i}
                style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.outline, paddingVertical: 16, paddingHorizontal: 20, marginBottom: 8 }}
                onPress={() => pickCity(i)}
              >
                <Text style={{ color: C.onSurface, fontSize: 16, fontFamily: FF.bold }}>{tc.city}</Text>
                {tc.ownerPlayerId !== null && (
                  <Text style={{ color: C.muted, fontSize: 12, fontFamily: FF.regular }}>Startort von {players.find(p => p.id === tc.ownerPlayerId)?.name}</Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    );
  }

  // ─── CHALLENGE PHASE ───
  if (phase === 'challenge' && location) {
    const pickedCity = activePickIdx !== null ? tableCities[activePickIdx]?.city : '';

    return (
      <View style={s.container}>
        <View style={{ paddingHorizontal: 20, paddingTop: 60, flex: 1 }}>
          <Text style={{ color: C.muted, fontSize: 13, fontFamily: FF.bold, letterSpacing: 2, marginBottom: 8 }}>HERAUSFORDERUNG</Text>
          <Text style={{ color: C.onSurface, fontSize: 18, fontFamily: FF.bold, marginBottom: 20 }}>
            {activePlayer.name} wählte: {pickedCity}
          </Text>

          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: C.primary, fontSize: 14, fontFamily: FF.bold, marginBottom: 10 }}>Jemand anderes? (Token einsetzen)</Text>
            <ScrollView horizontal style={{ marginBottom: 10 }}>
              {players.filter(p => p.id !== activePlayer.id).map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={{ backgroundColor: challengerId === p.id ? C.primary : C.surface, borderWidth: 1, borderColor: C.outline, paddingVertical: 12, paddingHorizontal: 20, marginRight: 8 }}
                  onPress={() => setChallengerId(challengerId === p.id ? null : p.id)}
                >
                  <Text style={{ color: challengerId === p.id ? C.onPrimary : C.onSurface, fontSize: 14, fontFamily: FF.bold }}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <TouchableOpacity style={s.primaryBtn} onPress={resolveRound}>
            <Text style={s.primaryBtnText}>AUFLÖSEN</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── RESULT PHASE ───
  if (phase === 'result' && location) {
    const isTie = players.filter(p => p.score === Math.max(...players.map(pl => pl.score))).length > 1;

    return (
      <View style={s.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 }}>
          <Animated.View style={{ transform: [{ scale: resultScale }], alignItems: 'center' }}>
            {winnerId !== null ? (
              <>
                <Text style={{ color: C.primary, fontSize: 48, fontFamily: FF.bold, marginBottom: 10 }}>✓</Text>
                <Text style={{ color: C.onSurface, fontSize: 22, fontFamily: FF.bold, marginBottom: 4 }}>
                  {players.find(p => p.id === winnerId)?.name} punktet!
                </Text>
              </>
            ) : (
              <>
                <Text style={{ color: C.error, fontSize: 48, fontFamily: FF.bold, marginBottom: 10 }}>✕</Text>
                <Text style={{ color: C.onSurface, fontSize: 22, fontFamily: FF.bold, marginBottom: 4 }}>Leider daneben!</Text>
              </>
            )}

            <Text style={{ color: C.muted, fontSize: 14, fontFamily: FF.regular, marginBottom: 30 }}>
              {location.name} ({location.district})
            </Text>

            {activePickIdx !== null && distances[activePickIdx] !== undefined && closestCityIdx !== null && (
              <View style={{ backgroundColor: C.surface, padding: 15, borderRadius: 8, marginBottom: 30, width: width - 60 }}>
                <Text style={{ color: C.onSurface, fontFamily: FF.regular, fontSize: 14, marginBottom: 6 }}>
                  Gewählt: <Text style={{ fontFamily: FF.bold }}>{tableCities[activePickIdx]?.city}</Text> ({formatDistance(distances[activePickIdx])})
                </Text>
                {activePickIdx !== closestCityIdx && (
                  <Text style={{ color: C.primary, fontFamily: FF.regular, fontSize: 14 }}>
                    Richtige Antwort: <Text style={{ fontFamily: FF.bold }}>{tableCities[closestCityIdx]?.city}</Text> ({formatDistance(distances[closestCityIdx])})
                  </Text>
                )}
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 20, marginBottom: 30 }}>
              {players.map(p => (
                <View key={p.id} style={{ alignItems: 'center' }}>
                  <Text style={{ color: p.id === winnerId ? C.primary : C.muted, fontSize: 14, fontFamily: FF.bold }}>{p.name}</Text>
                  <Text style={{ color: p.id === winnerId ? C.primary : C.muted, fontSize: 24, fontFamily: FF.bold }}>{p.score}</Text>
                </View>
              ))}
            </View>

            {isLastRound && isTie ? (
              <TouchableOpacity
                style={s.primaryBtn}
                onPress={() => {
                  const tiePlayers = players.filter(p => p.score === Math.max(...players.map(pl => pl.score)));
                  setRound(r => r + 1);
                  setMaxRounds(maxRounds + tiePlayers.length);
                  setPhase('scan-qr');
                  setActivePlayerIdx(0);
                  startRound();
                }}
              >
                <Text style={s.primaryBtnText}>TIE BREAKER — PLAY ON!</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.primaryBtn} onPress={nextTurn}>
                <Text style={s.primaryBtnText}>{isLastRound ? 'ERGEBNIS ANZEIGEN' : 'NÄCHSTE RUNDE'}</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        </View>
      </View>
    );
  }

  return null;
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  primaryBtn: { backgroundColor: C.primary, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: C.onPrimary, fontSize: 16, fontFamily: FF.bold, letterSpacing: 2 },
  secondaryBtn: { borderWidth: 1, borderColor: C.outline, paddingVertical: 12, paddingHorizontal: 32, alignItems: 'center' },
  secondaryBtnText: { color: C.muted, fontSize: 13, fontFamily: FF.bold, letterSpacing: 2 },
});
