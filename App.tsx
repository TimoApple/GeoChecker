// GeoCheckr — Berlin Street Edition
// App.tsx – Nur noch Orchestrierung: Screen-Routing + Setup + Result
// Game-Flow ist in GameScreen.tsx
// Scanner-Logik ist in useArucoScanner.ts
// Panorama-Viewer ist in PanoramaViewer.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Animated,
  Vibration, Platform, KeyboardAvoidingView, StatusBar, ScrollView, Dimensions, Image, PanResponder
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFonts, SpaceGrotesk_400Regular, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useArucoScanner } from './src/hooks/useArucoScanner';

import { calculateDistance, formatDistance } from './src/utils/distance';
import { playClickSound, playSuccessSound, playErrorSound, playPerfectSound, playTimerWarning, playTimerTick, playAnswerphoneBeep } from './src/utils/sounds';
import { panoramaLocations, PanoramaLocation, getRandomLocation, fetchLocationsFromDB, findLocationById, getLocations } from './src/data/panoramaLocations';
import PanoramaViewer from './src/components/PanoramaViewer';
import GameScreen from './src/screens/GameScreen';

const { width, height } = Dimensions.get('window');
const FF = { regular: 'SpaceGrotesk_400Regular', bold: 'SpaceGrotesk_700Bold' };

// CI COLORS — German Version
const C = {
  bg: '#262523', surfaceLow: '#1a1918', surface: '#2e2d2b',
  surfaceHigh: '#3a3836', surfaceHighest: '#4a4845',
  primary: '#F2A344', primaryBright: '#f5b866',
  onPrimary: '#262523', onPrimaryContainer: '#262523',
  secondary: '#D9593C', secondaryContainer: '#D9593C',
  onSecondaryContainer: '#ffffff',
  onSurface: '#F1E8E1', outline: '#6b6560',
  error: '#D9593C', accent: '#D9593C', green: '#F2A344', blue: '#D9593C',
  text: '#F1E8E1', muted: '#8a8580',
};

// TYPES
interface Player { id: number; name: string; city: string; cityId: number; lat: number; lng: number; score: number; }
interface TableCity { city: string; lat: number; lng: number; ownerPlayerId: number | null; isPlayerCity: boolean; }
type Screen = 'intro' | 'loading' | 'tutorial' | 'setup' | 'game' | 'result';

// LOADING QUOTES
const QUOTES = [
  'Die Welt ist ein Buch. Wer nicht reist, liest nur eine Seite.',
  'Nicht jeder, der wandert, hat sich verloren.',
  'Reisen ist Leben.',
  'Die Erde hat eine Melodie – für die, die zuhören.',
  'Das Abenteuer ist sein eigener Lohn.',
  'Irgendwo auf der Erde liegt deine Antwort. Rate schneller.',
];

// ═══════════════ SLIDER TRACK COMPONENT ═══════════════
const SNAP_VALUES = [1, 5, 10, 20, 30, 45];
function SliderTrack({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const containerRef = useRef<View>(null);
  const containerLayoutRef = useRef({ x: 0, y: 0, w: 0 });
  const currentSnapIdx = SNAP_VALUES.indexOf(value);
  const numSnaps = SNAP_VALUES.length;
  const LABEL_W = 40;

  const getLabelCenter = useCallback((idx: number, containerW: number) => {
    if (containerW <= 0) return 0;
    const gap = (containerW - numSnaps * LABEL_W) / (numSnaps - 1);
    return idx * (LABEL_W + gap) + LABEL_W / 2;
  }, []);

  const getSnapFromX = useCallback((pageX: number) => {
    const { x, w } = containerLayoutRef.current;
    if (w <= 0) return value;
    const relativeX = pageX - x;
    let minDist = Infinity;
    let nearestIdx = 0;
    for (let i = 0; i < numSnaps; i++) {
      const center = getLabelCenter(i, w);
      const dist = Math.abs(relativeX - center);
      if (dist < minDist) { minDist = dist; nearestIdx = i; }
    }
    return SNAP_VALUES[nearestIdx];
  }, [value, getLabelCenter]);

  const updateLayout = useCallback(() => {
    containerRef.current?.measureInWindow((x, y, w) => {
      containerLayoutRef.current = { x, y, w };
    });
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => { updateLayout(); onChange(getSnapFromX(e.nativeEvent.pageX)); },
      onPanResponderMove: (e) => { if (containerLayoutRef.current.w > 0) onChange(getSnapFromX(e.nativeEvent.pageX)); },
    })
  ).current;

  const [containerWidth, setContainerWidth] = useState(0);
  const circleCenter = currentSnapIdx >= 0 && containerWidth > 0 ? getLabelCenter(currentSnapIdx, containerWidth) : 0;

  return (
    <View ref={containerRef} style={{ height: 60, justifyContent: 'center', position: 'relative' }}
      onLayout={(e) => { const w = e.nativeEvent.layout.width; setContainerWidth(w); containerLayoutRef.current.x = 0; containerLayoutRef.current.w = w; updateLayout(); }}
      {...panResponder.panHandlers}>
      <View style={{ position: 'absolute', left: 0, top: 13, right: 0, height: 6, backgroundColor: C.surfaceHigh }}>
        <View style={{ position: 'absolute', left: 0, top: 0, height: 6, width: circleCenter, backgroundColor: C.primary }} />
      </View>
      <View style={{ position: 'absolute', left: circleCenter - 12, top: 4, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.outline, backgroundColor: C.surface }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 30 }}>
        {SNAP_VALUES.map(t => (
          <TouchableOpacity key={t} style={{ width: LABEL_W, height: 28, justifyContent: 'center', alignItems: 'center' }} onPress={() => onChange(t)}>
            <Text style={{ color: value === t ? C.primary : C.muted, fontSize: 14, fontFamily: FF.bold }}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ SpaceGrotesk_400Regular, SpaceGrotesk_700Bold });
  const [screen, setScreen] = useState<Screen>('intro');
  const [tutorialPage, setTutorialPage] = useState(0);
  const [introPhase, setIntroPhase] = useState<'video' | 'still' | 'freeze'>('video');
  const [loadingFade] = useState(new Animated.Value(0));
  const [loadingQuote] = useState(QUOTES[Math.floor(Math.random() * QUOTES.length)]);

  // Setup
  const [players, setPlayers] = useState<Player[]>([
    { id: 1, name: 'Spieler 1', city: '', cityId: -1, lat: 0, lng: 0, score: 0 },
    { id: 2, name: 'Spieler 2', city: '', cityId: -1, lat: 0, lng: 0, score: 0 },
  ]);
  const [timerSetting, setTimerSetting] = useState(10);
  const [roundsSetting, setRoundsSetting] = useState(10);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // City scan (Setup-Phase)
  const [scanCityForIdx, setScanCityForIdx] = useState<number | null>(null);
  const [showCityScanner, setShowCityScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scanError, setScanError] = useState('');
  const [manualCode, setManualCode] = useState('');

  // Game state (für Result-Screen nach Spielende)
  const [gameResultPlayers, setGameResultPlayers] = useState<Player[]>([]);

  const allPlayersScanned = players.length >= 2 && players.every(p => p.city.length > 0);

  // LOADING SCREEN + DB-FETCH
  useEffect(() => {
    Animated.timing(loadingFade, { toValue: 1, duration: 800, useNativeDriver: true }).start();
    try { require('expo-navigation-bar').then((nb: any) => nb.setBackgroundColorAsync('#262523').catch(() => {})); } catch (_) {}
    fetchLocationsFromDB().then(locs => {
      console.log(`[App] ${locs.length} Locations geladen (live von DB)`);
    });
    const t = setTimeout(() => setScreen('tutorial'), 2500);
    return () => clearTimeout(t);
  }, []);

  // Intro video player
  const introPlayer = useVideoPlayer(require('./assets/intro.mp4'), (player) => {
    player.loop = false;
    player.play();
  });

  // City-Scan: ArUco Scanner für Setup-Phase (nicht mehr aktiv genutzt, aber Hook bleibt für onDetected-Callback)
  const { startScanning: triggerCityScan } = useArucoScanner(undefined, {
    onDetected: (ids) => {
      if (!showCityScanner || scanCityForIdx === null || ids.length === 0) return;
      const id = ids[0];
      const loc = findLocationById(id);
      if (!loc) {
        setScanError('Dieser Ort wurde nicht gefunden.');
        setTimeout(() => setScanError(''), 2500);
        return;
      }
      const takenBy = players.find(p => loc.name && p.city && p.city.toLowerCase() === loc.name.toLowerCase() && players.indexOf(p) !== scanCityForIdx);
      if (takenBy) {
        setScanError(`Diese Karte ist bereits vergeben von ${takenBy.name}`);
        setTimeout(() => setScanError(''), 2500);
        return;
      }
      playClickSound();
      Vibration.vibrate(100);
      setUsedLocations(prev => [...prev, loc.id]);
      setPlayers(prev => prev.map((p, i) => i === scanCityForIdx ? { ...p, city: loc.name, cityId: loc.id, lat: loc.lat, lng: loc.lng } : p));
      setShowCityScanner(false);
      setScanned(false);
      setScanCityForIdx(null);
      setManualCode('');
    },
    onError: (err) => {
      setScanError(err);
      setTimeout(() => setScanError(''), 2500);
    },
  });

  const [usedLocations, setUsedLocations] = useState<number[]>([]);

  const addPlayer = () => {
    const count = players.length + 1;
    setPlayers(prev => [...prev, { id: Date.now(), name: `Spieler ${count}`, city: '', cityId: -1, lat: 0, lng: 0, score: 0 }]);
    playClickSound();
  };

  const openCityScan = (idx: number) => {
    setScanCityForIdx(idx);
    setShowCityScanner(true);
    setScanned(false);
    setScanError('');
    setManualCode('');
  };

  const submitManualCode = useCallback(() => {
    if (!manualCode.trim() || scanCityForIdx === null) return;
    const code = manualCode.trim();
    const assign = (loc: PanoramaLocation, id: number) => {
      const takenBy = players.find(p => loc.name && p.city && p.city.toLowerCase() === loc.name.toLowerCase() && players.indexOf(p) !== scanCityForIdx);
      if (takenBy) { setScanError(`Diese Karte ist bereits vergeben von ${takenBy.name}`); setTimeout(() => setScanError(''), 2500); return; }
      playClickSound(); Vibration.vibrate(100);
      setUsedLocations(prev => [...prev, id]);
      setPlayers(prev => prev.map((p, i) => i === scanCityForIdx ? { ...p, city: loc.name, cityId: id, lat: loc.lat, lng: loc.lng } : p));
      setShowCityScanner(false); setScanned(false); setScanCityForIdx(null); setManualCode('');
    };
    const numMatch = code.match(/#?(\d+)/);
    if (numMatch) {
      const id = parseInt(numMatch[1], 10);
      const loc = findLocationById(id);
      if (loc) { assign(loc, id); return; }
    }
    const normalized = code.toLowerCase().trim().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');
    const allLocs = getLocations();
    const textMatch = allLocs.find(l => l.name.toLowerCase() === normalized);
    if (textMatch) { assign(textMatch, textMatch.id); return; }
    setScanError('Nicht erkannt – Code oder Stadtname prüfen');
    setTimeout(() => setScanError(''), 2000);
  }, [manualCode, scanCityForIdx, players]);

  const startGame = () => {
    if (!allPlayersScanned) return;
    playClickSound();
    setScreen('game');
  };

  const handleGameEnd = useCallback((finalPlayers: Player[]) => {
    setGameResultPlayers(finalPlayers);
    setScreen('result');
  }, []);

  const handleBackToSetup = useCallback(() => {
    setScreen('setup');
    setPlayers(prev => prev.map(p => ({ ...p, score: 0, city: '', cityId: -1, lat: 0, lng: 0 })));
    setUsedLocations([]);
  }, []);

  const cameraRef = useRef<CameraView>(null) as any;
  const tutScrollRef = useRef<ScrollView>(null);

  // TUTORIAL
  const TUT_PAGES = [
    { bg: '#262523', titleColor: '#D9593C', bodyColor: '#F1E8E1', title: 'Eine Aufgabe. Nur eine.', body: 'Du stehst plötzlich irgendwo in Berlin. Wo bist du nur? Auf dem Tisch liegen Berliner Orte. Deine Aufgabe: Welcher Ort liegt am nächsten zu dem, was du siehst?' },
    { bg: '#F2A344', titleColor: '#262523', bodyColor: '#262523', title: 'Ziehen. Scannen. Die Zeit läuft.', body: 'Zieh eine Karte vom Stapel. Scanne den Code mit der App. Ein Berliner Ort erscheint – und der Timer startet, ob du bereit bist oder nicht.' },
    { bg: '#262523', titleColor: '#F2A344', bodyColor: '#F1E8E1', title: 'Wo zur Hölle bist du?', body: 'Schau dich um. Erkennst du den Ort?\n\nWähle den Ort vom Tisch, der am nächsten dran liegt. Je näher du liegst, desto mehr Punkte.' },
    { bg: '#D9593C', titleColor: '#262523', bodyColor: '#262523', title: 'Auf die harte Tour?', body: 'Denkst du, jemand lag falsch? Setz einen Token und nenn DEINEN Ort.\n\nRichtig → Bonuspunkte.\nFalsch → Tschüss, Token.\n\n→ Los geht\'s!' },
  ];

  // ═══════════════ SCREEN RENDER ═══════════════

  // CITY SCANNER (Setup-Phase)
  if (showCityScanner) {
    if (!cameraPermission?.granted) {
      return (
        <View style={s.container}><StatusBar hidden />
          <View style={s.centerScreen}>
            <Text style={{ color: C.onSurface, fontSize: 18, marginBottom: 20, textAlign: 'center' }}>Kamera-Berechtigung erforderlich</Text>
            <TouchableOpacity style={s.primaryBtn} onPress={requestCameraPermission}><Text style={s.primaryBtnText}>ERLAUBEN</Text></TouchableOpacity>
            <TouchableOpacity style={s.tertiaryBtn} onPress={() => { setShowCityScanner(false); setScanned(false); }}><Text style={s.tertiaryBtnText}>ABBRECHEN</Text></TouchableOpacity>
          </View>
        </View>
      );
    }
    const assignName = scanCityForIdx !== null ? players[scanCityForIdx]?.name : '';
    return (
      <View style={s.container}><StatusBar hidden />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 }}>
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <Text style={{ color: C.primary, fontSize: 13, fontFamily: FF.bold, letterSpacing: 2, marginBottom: 6 }}>
              KARTE ZUWEISEN
            </Text>
            <Text style={{ color: C.onSurface, fontSize: 22, fontFamily: FF.bold }}>{assignName || 'Spieler'}</Text>
          </View>
          <Text style={{ color: C.muted, fontSize: 11, fontFamily: FF.bold, letterSpacing: 2, textAlign: 'center', marginBottom: 10, textTransform: 'uppercase' }}>
            Code oder Stadt eingeben
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
            <View style={{ flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.outline }}>
              <TextInput style={{ color: C.onSurface, fontSize: 16, fontFamily: FF.bold, paddingVertical: 12, paddingHorizontal: 16 }}
                value={manualCode} onChangeText={setManualCode} placeholder="#042 oder Berlin" placeholderTextColor={C.muted}
                autoCapitalize="none" autoCorrect={false} returnKeyType="go" onSubmitEditing={submitManualCode} />
            </View>
            <TouchableOpacity style={{ backgroundColor: C.primary, paddingVertical: 12, paddingHorizontal: 20, justifyContent: 'center' }} onPress={submitManualCode}>
              <Text style={{ color: C.onPrimaryContainer, fontSize: 14, fontFamily: FF.bold }}>GO</Text>
            </TouchableOpacity>
          </View>
          {scanError ? (<View style={{ backgroundColor: 'rgba(255,100,100,0.9)', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20, marginTop: 16 }}><Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>{scanError}</Text></View>) : null}
          <TouchableOpacity style={{ marginTop: 24, paddingVertical: 10, paddingHorizontal: 20 }} onPress={() => { setShowCityScanner(false); setScanned(false); setManualCode(''); }}>
            <Text style={{ color: C.muted, fontSize: 14, fontFamily: FF.regular }}>SCHLIESSEN</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // INTRO
  if (screen === 'intro') {
    return (
      <View style={{ flex: 1, backgroundColor: '#262523' }}><StatusBar hidden />
        <TouchableOpacity activeOpacity={1} style={{ ...StyleSheet.absoluteFill, zIndex: 10 }} onPress={() => setScreen('tutorial')}>
          <View style={{ position: 'absolute', top: 50, right: 20, zIndex: 20 }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, fontFamily: FF.regular }}>Überspringen</Text>
          </View>
        </TouchableOpacity>
        <VideoView player={introPlayer} style={{ ...StyleSheet.absoluteFill }}
          contentFit="cover" nativeControls={false} />
      </View>
    );
  }

  // TUTORIAL
  if (screen === 'tutorial') {
    const currentBg = TUT_PAGES[tutorialPage]?.bg || '#262523';
    return (
      <View style={{ flex: 1, backgroundColor: currentBg }}><StatusBar hidden />
        <ScrollView
          ref={tutScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEnabled
          onMomentumScrollEnd={(e) => {
            const page = Math.round(e.nativeEvent.contentOffset.x / width);
            if (page >= TUT_PAGES.length) {
              setTutorialPage(0);
              setScreen('setup');
            } else {
              setTutorialPage(page);
            }
          }}
          style={{ flex: 1 }}>
          {TUT_PAGES.map((page, i) => (
            <TouchableOpacity key={i} activeOpacity={1} style={{ width, flex: 1, backgroundColor: page.bg, justifyContent: 'center', paddingHorizontal: 30 }}
              onPress={(e) => {
                const touchX = e.nativeEvent.locationX;
                if (touchX > width / 2) {
                  if (i < TUT_PAGES.length - 1) {
                    tutScrollRef.current?.scrollTo({ x: (i + 1) * width, animated: true });
                    setTutorialPage(i + 1);
                  } else {
                    setTutorialPage(0);
                    setScreen('setup');
                  }
                } else {
                  if (i > 0) {
                    tutScrollRef.current?.scrollTo({ x: (i - 1) * width, animated: true });
                    setTutorialPage(i - 1);
                  }
                }
              }}>
              <Text style={{ color: page.titleColor, fontSize: 51, fontFamily: FF.bold, marginBottom: 20, lineHeight: 60 }}>{page.title}</Text>
              <Text style={{ color: page.bodyColor, fontSize: 25, fontFamily: FF.regular, lineHeight: 34 }}>{page.body}</Text>
            </TouchableOpacity>
          ))}
          <View style={{ width, flex: 1 }} />
        </ScrollView>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, paddingBottom: 60, backgroundColor: currentBg }}>
          {TUT_PAGES.map((_, i) => (
            <View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: i === tutorialPage ? C.primary : C.muted }} />
          ))}
        </View>
      </View>
    );
  }

  // ═══════════════ SETUP ═══════════════
  if (screen === 'setup') {
    return (
      <View style={s.container}><StatusBar hidden />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Logo */}
            <View style={{ alignItems: 'center', marginTop: 60, marginBottom: 30 }}>
              <Image source={require('./assets/GeoChecker_Aruco_Square_01.png')} style={{ width: 200, height: 80, resizeMode: 'contain' }} />
            </View>

            {/* Players */}
            <View style={{ paddingHorizontal: 20 }}>
              <View style={s.sectionLabel}><Text style={s.sectionLabelText}>SPIELER</Text></View>
              {players.map((p, i) => (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
                  <View style={{ flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.outline, height: 48, justifyContent: 'center' }}>
                    <TextInput
                      style={{ color: C.onSurface, fontSize: 16, fontFamily: FF.bold, paddingVertical: 0, paddingHorizontal: 16 }}
                      value={p.name} onChangeText={(t) => setPlayers(prev => prev.map((pl, j) => j === i ? { ...pl, name: t } : pl))}
                      placeholder={`Spieler ${i + 1}`} placeholderTextColor={C.muted}
                    />
                  </View>
                  <TouchableOpacity
                    style={{ backgroundColor: p.city ? C.primary : C.surfaceHigh, height: 48, justifyContent: 'center', paddingHorizontal: 16, borderWidth: 1, borderColor: p.city ? C.primary : C.outline }}
                    onPress={() => openCityScan(i)}
                  >
                    <Text style={{ color: p.city ? C.onPrimaryContainer : C.muted, fontSize: 13, fontFamily: FF.bold }}>
                      {p.city ? p.city : 'KARTE'}
                    </Text>
                  </TouchableOpacity>
                  {players.length > 2 && (
                    <TouchableOpacity onPress={() => setPlayers(prev => prev.filter((_, j) => j !== i))}>
                      <Text style={{ color: C.error, fontSize: 20 }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity onPress={addPlayer} style={{ marginBottom: 20 }}>
                <Text style={{ color: C.primary, fontSize: 14, fontFamily: FF.bold }}>+ SPIELER HINZUFÜGEN</Text>
              </TouchableOpacity>
            </View>

            {/* Timer Slider */}
            <View style={{ paddingHorizontal: 20, marginBottom: 20 }}>
              <View style={s.sectionLabel}><Text style={s.sectionLabelText}>TIMER (SEKUNDEN)</Text></View>
              <SliderTrack value={timerSetting} onChange={setTimerSetting} />
            </View>

            {/* Rounds */}
            <View style={{ paddingHorizontal: 20, marginBottom: 30 }}>
              <View style={s.sectionLabel}><Text style={s.sectionLabelText}>RUNDEN PRO SPIELER</Text></View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[5, 10, 15].map(r => (
                  <TouchableOpacity key={r}
                    style={{ flex: 1, backgroundColor: roundsSetting === r ? C.primary : C.surface, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: roundsSetting === r ? C.primary : C.outline }}
                    onPress={() => setRoundsSetting(r)}>
                    <Text style={{ color: roundsSetting === r ? C.onPrimaryContainer : C.onSurface, fontSize: 16, fontFamily: FF.bold }}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Start */}
            <View style={{ paddingHorizontal: 20 }}>
              <TouchableOpacity
                style={[s.primaryBtn, { opacity: allPlayersScanned ? 1 : 0.4 }]}
                onPress={startGame}
                disabled={!allPlayersScanned}
              >
                <Text style={s.primaryBtnText}>SPIEL STARTEN</Text>
              </TouchableOpacity>
              {!allPlayersScanned && (
                <Text style={{ color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 8 }}>
                  Jeder Spieler braucht eine zugewiesene Karte
                </Text>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ═══════════════ GAME ═══════════════
  if (screen === 'game') {
    return (
      <GameScreen
        players={players}
        timerSetting={timerSetting}
        roundsSetting={roundsSetting}
        onGameEnd={handleGameEnd}
        onBackToSetup={handleBackToSetup}
      />
    );
  }

  // ═══════════════ RESULT SCREEN ═══════════════
  if (screen === 'result') {
    const sorted = [...gameResultPlayers].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    const isTie = gameResultPlayers.filter(p => p.score === winner.score).length > 1;
    return (
      <View style={s.container}><StatusBar hidden />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 }}>
          <Text style={{ color: C.muted, fontSize: 13, fontFamily: FF.bold, letterSpacing: 2, marginBottom: 10 }}>SPIEL BEENDET</Text>
          {isTie ? (
            <Text style={{ color: C.primary, fontSize: 28, fontFamily: FF.bold, marginBottom: 20, textAlign: 'center' }}>UNENTSCHIEDEN!</Text>
          ) : (
            <>
              <Text style={{ color: C.primary, fontSize: 48, fontFamily: FF.bold, marginBottom: 4 }}>{winner.name}</Text>
              <Text style={{ color: C.onSurface, fontSize: 20, fontFamily: FF.regular, marginBottom: 20 }}>gewinnt mit {winner.score} Punkten!</Text>
            </>
          )}
          <View style={{ width: '100%', marginBottom: 30 }}>
            {sorted.map((p, i) => (
              <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.surface, paddingVertical: 14, paddingHorizontal: 20, marginBottom: 4 }}>
                <Text style={{ color: C.onSurface, fontSize: 16, fontFamily: FF.bold }}>{i + 1}. {p.name}</Text>
                <Text style={{ color: C.primary, fontSize: 16, fontFamily: FF.bold }}>{p.score}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={s.primaryBtn} onPress={() => {
            setScreen('setup');
            setPlayers(prev => prev.map(p => ({ ...p, score: 0, city: '', cityId: -1, lat: 0, lng: 0 })));
            setUsedLocations([]);
          }}>
            <Text style={s.primaryBtnText}>NOCH EIN SPIEL</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 12 }} onPress={() => {
            setScreen('intro');
            setPlayers(prev => prev.map(p => ({ ...p, score: 0, city: '', cityId: -1, lat: 0, lng: 0 })));
            setUsedLocations([]);
          }}>
            <Text style={{ color: C.muted, fontSize: 14, fontFamily: FF.regular }}>Zum Startbildschirm</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
}

// ═══════════════ STYLES ═══════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centerScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  primaryBtn: { backgroundColor: C.primary, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: C.onPrimaryContainer, fontSize: 16, fontFamily: FF.bold, letterSpacing: 2 },
  tertiaryBtn: { paddingVertical: 10, paddingHorizontal: 20 },
  tertiaryBtnText: { color: C.muted, fontSize: 14, fontFamily: FF.regular },
  sectionLabel: { marginBottom: 10, paddingBottom: 6 },
  sectionLabelText: { color: C.muted, fontSize: 11, fontFamily: FF.bold, letterSpacing: 2 },
  scanOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 250, height: 250, borderWidth: 2, borderColor: C.primary, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  scanCloseBtn: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingVertical: 10, paddingHorizontal: 24 },
  scanCloseText: { color: '#fff', fontSize: 14, fontFamily: FF.bold, letterSpacing: 2 },
});