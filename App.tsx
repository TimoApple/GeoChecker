// GeoCheckr - QR Card Game
// Design System: "The Tactical Cartographer"
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Animated,
  Vibration, Platform, KeyboardAvoidingView, StatusBar, ScrollView, Dimensions, Image, PanResponder
} from 'react-native';
import { WebView } from 'react-native-webview';
import { CameraView, useCameraPermissions } from 'expo-camera';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import * as NavigationBar from 'expo-navigation-bar';
import { useFonts, SpaceGrotesk_400Regular, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { Video, ResizeMode } from 'expo-av';

import { calculateDistance, formatDistance } from './src/utils/distance';
import { playClickSound, playSuccessSound, playErrorSound, playPerfectSound, playTimerWarning, playTimerTick, playAnswerphoneBeep } from './src/utils/sounds';
import { panoramaLocations, PanoramaLocation } from './src/data/panoramaLocations';

const { width, height } = Dimensions.get('window');
const API_KEY = 'AIzaSyCl3ogHqguF1QcwhyHdvJmUkbgx3bpKLJI';
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
type Screen = 'intro' | 'tutorial' | 'setup' | 'scan-city' | 'game' | 'result';

// LOADING QUOTES
const QUOTES = [
  'Die Welt ist ein Buch. Wer nicht reist, liest nur eine Seite.',
  'Nicht jeder, der wandert, hat sich verloren.',
  'Reisen ist Leben.',
  'Die Erde hat eine Melodie – für die, die zuhören.',
  'Das Abenteuer ist sein eigener Lohn.',
  'Irgendwo auf der Erde liegt deine Antwort. Rate schneller.',
];

// STREET VIEW HTML
function buildStreetViewHtml(lat: number, lng: number): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>*{margin:0;padding:0;box-sizing:border-box}html,body,#pano{width:100%;height:100%;overflow:hidden;background:#000}#status{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#888;font-family:sans-serif;text-align:center;font-size:14px;z-index:999}#status .spinner{width:32px;height:32px;border:3px solid #333;border-top-color:#F2A344;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 12px}@keyframes spin{to{transform:rotate(360deg)}}</style></head><body><div id="pano"></div><div id="status"><div class="spinner"></div>Ort wird geladen...</div><script>function init(){var sv=new google.maps.StreetViewService();sv.getPanorama({location:{lat:${lat},lng:${lng}},radius:50000,preference:google.maps.StreetViewPreference.NEAREST,source:google.maps.StreetViewSource.DEFAULT},function(data,st){if(st===google.maps.StreetViewStatus.OK){new google.maps.StreetViewPanorama(document.getElementById('pano'),{pano:data.location.pano,pov:{heading:Math.random()*360,pitch:0},zoom:0,addressControl:false,linksControl:true,panControl:true,zoomControl:true,fullscreenControl:false,motionTracking:false,motionTrackingControl:false,enableCloseButton:false,clickToGo:true,scrollwheel:true,disableDefaultUI:false});document.getElementById('status').style.display='none';window.ReactNativeWebView&&window.ReactNativeWebView.postMessage('loaded')}else{document.getElementById('status').innerHTML='Kein Ort verfügbar';window.ReactNativeWebView&&window.ReactNativeWebView.postMessage('error')}})}</script><script async defer src="https://maps.googleapis.com/maps/api/js?key=${API_KEY}&callback=init&libraries=streetView"></script></body></html>`;
}

export default function App() {
  useFonts({ SpaceGrotesk_400Regular, SpaceGrotesk_700Bold });
  const [screen, setScreen] = useState<Screen>('intro');
  const [tutorialPage, setTutorialPage] = useState(0);
  const [introPhase, setIntroPhase] = useState<'video' | 'still' | 'freeze'>('video');
  const [loadingQuote] = useState(QUOTES[Math.floor(Math.random() * QUOTES.length)]);

  // Setup
  const [players, setPlayers] = useState<Player[]>([
    { id: 1, name: 'Spieler 1', city: '', cityId: -1, lat: 0, lng: 0, score: 0 },
    { id: 2, name: 'Spieler 2', city: '', cityId: -1, lat: 0, lng: 0, score: 0 },
  ]);
  const [timerSetting, setTimerSetting] = useState(30);
  const [roundsSetting, setRoundsSetting] = useState(10);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // City scan
  const [scanCityForIdx, setScanCityForIdx] = useState<number | null>(null);
  const [showCityScanner, setShowCityScanner] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scanError, setScanError] = useState('');
  const [manualCode, setManualCode] = useState('');

  // Game
  const [tableCities, setTableCities] = useState<TableCity[]>([]);
  const [activePlayerIdx, setActivePlayerIdx] = useState(0);
  const [round, setRound] = useState(1);
  const [maxRounds, setMaxRounds] = useState(10);
  const [location, setLocation] = useState<PanoramaLocation>(panoramaLocations[0]);
  const [usedLocations, setUsedLocations] = useState<number[]>([]);
  const [phase, setPhase] = useState<'scan-qr' | 'view' | 'pick' | 'challenge' | 'result'>('scan-qr');
  const [challengerId, setChallengerId] = useState<number | null>(null);
  const [activePickIdx, setActivePickIdx] = useState<number | null>(null);
  const [timer, setTimer] = useState(30);
  const [timerPaused, setTimerPaused] = useState(false);
  const [svLoaded, setSvLoaded] = useState(false);
  const [svError, setSvError] = useState(false);
  const [showQrScanner, setShowQrScanner] = useState(false);
  const [closestCityIdx, setClosestCityIdx] = useState<number | null>(null);
  const [distances, setDistances] = useState<number[]>([]);
  const [winnerId, setWinnerId] = useState<number | null>(null);
  const [challengerPickIdx, setChallengerPickIdx] = useState<number | null>(null);

  const timerPulse = useRef(new Animated.Value(1)).current;
  const resultScale = useRef(new Animated.Value(0)).current;
  const tutScrollRef = useRef<ScrollView>(null);
  const cameraRef = useRef<CameraView>(null);

  // Intro state (muss auf oberster Ebene sein, nicht in if-Block)
  const [showQuote, setShowQuote] = useState(false);
  const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allPlayersScanned = players.length >= 2 && players.every(p => p.city.length > 0);

  // Navigation bar color
  useEffect(() => {
    NavigationBar.setBackgroundColorAsync('#262523').catch(() => {});
  }, []);

  // Intro quote timer - erscheint nach 2,5s auf dem Video
  useEffect(() => {
    if (screen === 'intro') {
      quoteTimerRef.current = setTimeout(() => {
        setShowQuote(true);
      }, 2500);
    }
    return () => {
      if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
      setShowQuote(false);
    };
  }, [screen]);

  // MAX ROUNDS based on available cards (205 total, minus player cities)
  const maxPossibleRounds = useCallback(() => {
    const availableCards = 200; // ~205 total, reserve 5
    return Math.max(1, Math.floor(availableCards / players.length));
  }, [players.length]);

  // TIMER
  useEffect(() => {
    if (phase !== 'view' || timerPaused || timer <= 0) return;
    const interval = setInterval(() => setTimer(t => t - 1), 1000);
    return () => clearInterval(interval);
  }, [phase, timerPaused, timer]);

  useEffect(() => {
    if (timer <= 10 && timer > 0 && phase === 'view') {
      playTimerTick(); Vibration.vibrate(200);
      Animated.sequence([
        Animated.timing(timerPulse, { toValue: 1.3, duration: 150, useNativeDriver: true }),
        Animated.timing(timerPulse, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]).start();
    }
    if (timer === 0 && phase === 'view') { playTimerWarning(); Vibration.vibrate(500); setPhase('pick'); }
  }, [timer, phase]);

  // GAME LOGIC
  const getRandomLocation = useCallback(() => {
    const available = panoramaLocations.filter(l => !usedLocations.includes(l.id));
    return available.length > 0 ? available[Math.floor(Math.random() * available.length)] : panoramaLocations[Math.floor(Math.random() * panoramaLocations.length)];
  }, [usedLocations]);

  const addPlayer = () => {
    if (players.length >= 10) return; // max 10 players
    const count = players.length + 1;
    setPlayers(prev => [...prev, { id: Date.now(), name: `Spieler ${count}`, city: '', cityId: -1, lat: 0, lng: 0, score: 0 }]);
    playClickSound();
  };

  const openCityScan = (idx: number) => {
    setScanCityForIdx(idx); setShowCityScanner(true); setScanned(false); setScanError(''); setManualCode('');
  };

  // Manual code entry for city cards
  const submitManualCode = useCallback(() => {
    if (!manualCode.trim() || scanCityForIdx === null) return;
    const code = manualCode.trim();
    const assign = (loc: any, id: number) => {
      const takenBy = players.find(p => p.city.toLowerCase() === loc.city.toLowerCase() && players.indexOf(p) !== scanCityForIdx);
      if (takenBy) {
        setScanError(`Diese Karte ist bereits vergeben von ${takenBy.name}`);
        setTimeout(() => setScanError(''), 2500);
        return;
      }
      playClickSound(); Vibration.vibrate(100);
      setUsedLocations(prev => [...prev, id]);
      setPlayers(prev => prev.map((p, i) =>
        i === scanCityForIdx ? { ...p, city: loc.city, cityId: id, lat: loc.lat, lng: loc.lng } : p
      ));
      setShowCityScanner(false); setScanned(false); setScanCityForIdx(null); setManualCode('');
    };
    const numMatch = code.match(/#?(\d+)/);
    if (numMatch) {
      const id = parseInt(numMatch[1], 10);
      if (id >= 0 && id < panoramaLocations.length) {
        const loc = panoramaLocations.find(l => l.id === id);
        if (loc) { assign(loc, id); return; }
      }
    }
    const normalized = code.toLowerCase().trim().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');
    const textMatch = panoramaLocations.find(l => l.city.toLowerCase() === normalized);
    if (textMatch) { assign(textMatch, textMatch.id); return; }
    setScanError('Nicht erkannt – Code oder Stadtname prüfen');
    setTimeout(() => setScanError(''), 2000);
  }, [manualCode, scanCityForIdx, players]);

  const startGame = () => {
    if (!allPlayersScanned) return;
    playClickSound();
    setTableCities(players.map(p => ({ city: p.city, lat: p.lat, lng: p.lng, ownerPlayerId: p.id, isPlayerCity: true })));
    setRound(1); setMaxRounds(roundsSetting * players.length); setActivePlayerIdx(0); setUsedLocations([]);
    setPhase('scan-qr'); setScreen('game');
  };

  const startRound = useCallback(() => {
    setPhase('scan-qr'); setSvLoaded(false); setSvError(false);
    setClosestCityIdx(null); setDistances([]); setWinnerId(null);
    setChallengerId(null); setActivePickIdx(null); setChallengerPickIdx(null);
    setTimer(timerSetting); setTimerPaused(false); resultScale.setValue(0);
  }, [timerSetting]);

  const onQrScanned = useCallback((loc: PanoramaLocation) => {
    setLocation(loc); setUsedLocations(prev => [...prev, loc.id]);
    setTimer(timerSetting); setTimerPaused(false); setPhase('view');
    setShowQrScanner(false); setScanned(false); Vibration.vibrate(100);
  }, [timerSetting]);

  const pickCity = useCallback((idx: number) => {
    playClickSound(); setTimerPaused(true);
    const dists = tableCities.map(tc => calculateDistance(location.lat, location.lng, tc.lat, tc.lng));
    setDistances(dists);
    let minIdx = 0; for (let i = 1; i < dists.length; i++) if (dists[i] < dists[minIdx]) minIdx = i;
    setClosestCityIdx(minIdx);
    setActivePickIdx(idx);
    setPhase('challenge');
    setChallengerId(null);
  }, [tableCities, location]);

  const resolveRound = useCallback(() => {
    const minIdx = closestCityIdx;
    const pickedIdx = challengerId !== null && challengerPickIdx !== null ? challengerPickIdx : activePickIdx;
    if (minIdx === null || pickedIdx === null) return;
    const isCorrect = pickedIdx === minIdx;
    const activePlayerId = players[activePlayerIdx].id;

    if (challengerId !== null) {
      // Challenge mode: challenger picked a city
      if (isCorrect) {
        // Challenger was right - they get the point
        playPerfectSound(); Vibration.vibrate([100, 50, 100]);
        setPlayers(prev => prev.map(p => p.id === challengerId ? { ...p, score: p.score + 1 } : p));
        setWinnerId(challengerId);
      } else {
        // Challenger was wrong - active player was right, they keep their point
        playErrorSound(); Vibration.vibrate(500);
        setPlayers(prev => prev.map(p => p.id === activePlayerId ? { ...p, score: p.score + 1 } : p));
        setWinnerId(activePlayerId);
      }
    } else {
      // No challenge: active player's pick is evaluated
      if (isCorrect) {
        playPerfectSound(); Vibration.vibrate([100, 50, 100]);
        setPlayers(prev => prev.map(p => p.id === activePlayerId ? { ...p, score: p.score + 1 } : p));
        setWinnerId(activePlayerId);
      } else {
        playErrorSound(); Vibration.vibrate(500);
        setWinnerId(null);
      }
    }

    setTableCities(prev => [...prev, { city: location.city, lat: location.lat, lng: location.lng, ownerPlayerId: null, isPlayerCity: false }]);
    Animated.spring(resultScale, { toValue: 1, friction: 6, useNativeDriver: true }).start();
    setPhase('result');
  }, [closestCityIdx, activePickIdx, challengerId, challengerPickIdx, tableCities, location, activePlayerIdx, players]);

  const nextTurn = () => {
    playClickSound();
    if (round >= maxRounds) { setScreen('result'); return; }
    setActivePlayerIdx(prev => (prev + 1) % players.length);
    setRound(r => r + 1); startRound();
  };

  // Camera capture + OCR
  const captureAndRecognize = useCallback(async () => {
    if (!cameraRef.current || scanned || scanCityForIdx === null) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.5 });
      if (!photo?.uri) return;
      const result = await TextRecognition.recognize(photo.uri);
      const allText = result.text.toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');
      const matched = panoramaLocations.find(l => allText.includes(l.city.toLowerCase()));
      if (matched) {
        const takenBy = players.find(p => p.city.toLowerCase() === matched.city.toLowerCase() && players.indexOf(p) !== scanCityForIdx);
        if (takenBy) {
          setScanError(`Diese Karte ist bereits vergeben von ${takenBy.name}`);
          setScanned(true);
          setTimeout(() => { setScanError(''); setScanned(false); }, 2500);
          return;
        }
        playClickSound(); setScanned(true); Vibration.vibrate(100);
        setPlayers(prev => prev.map((p, i) =>
          i === scanCityForIdx ? { ...p, city: matched.city, cityId: matched.id, lat: matched.lat, lng: matched.lng } : p
        ));
        setShowCityScanner(false); setScanned(false); setScanCityForIdx(null);
      } else {
        setScanError('Stadt nicht erkannt – nochmal versuchen oder Code eingeben');
        setTimeout(() => setScanError(''), 2500);
      }
    } catch (e) {
      setScanError('Aufnahme fehlgeschlagen – nochmal versuchen');
      setTimeout(() => setScanError(''), 2000);
    }
  }, [scanned, scanCityForIdx, players]);

  // ═══════════════ SCAN HANDLER ═══════════════
  const handleScan = useCallback(({ data }: { data: string }) => {
    if (scanned || !data) return;

    // GAME QR → Street View
    if (showQrScanner) {
      const numMatch = data.match(/#?(\d+)/);
      if (numMatch) {
        const id = parseInt(numMatch[1], 10);
        if (id >= 0 && id < panoramaLocations.length) {
          const loc = panoramaLocations.find(l => l.id === id);
          if (loc) { 
            if (usedLocations.includes(id) || tableCities.some(tc => tc.city.toLowerCase() === loc.city.toLowerCase())) {
              setScanError('Diese Stadt liegt bereits auf dem Tisch!');
              setScanned(true); setTimeout(() => { setScanError(''); setScanned(false); }, 2500); return;
            }
            playClickSound(); setScanned(true); Vibration.vibrate(100); onQrScanned(loc); return; 
          }
        }
      }
      if (data.startsWith('city:')) {
        const id = parseInt(data.split(':')[1]);
        if (id >= 0 && id < panoramaLocations.length) {
          const loc = panoramaLocations.find(l => l.id === id);
          if (loc) { 
            if (usedLocations.includes(id) || tableCities.some(tc => tc.city.toLowerCase() === loc.city.toLowerCase())) {
              setScanError('Diese Stadt liegt bereits auf dem Tisch!');
              setScanned(true); setTimeout(() => { setScanError(''); setScanned(false); }, 2500); return;
            }
            playClickSound(); setScanned(true); Vibration.vibrate(100); onQrScanned(loc); return; 
          }
        }
      }
      return;
    }

    // CITY CARD ASSIGNMENT
    if (!showCityScanner || scanCityForIdx === null) return;

    const assign = (loc: any, id: number) => {
      const takenBy = players.find(p => p.city.toLowerCase() === loc.city.toLowerCase() && players.indexOf(p) !== scanCityForIdx);
      if (takenBy) {
        setScanError(`Diese Karte ist bereits vergeben von ${takenBy.name}`);
        setScanned(true);
        setTimeout(() => { setScanError(''); setScanned(false); }, 2500);
        return;
      }
      playClickSound(); setScanned(true); Vibration.vibrate(100);
      setUsedLocations(prev => [...prev, id]);
      setPlayers(prev => prev.map((p, i) =>
        i === scanCityForIdx ? { ...p, city: loc.city, cityId: id, lat: loc.lat, lng: loc.lng } : p
      ));
      setShowCityScanner(false); setScanned(false); setScanCityForIdx(null);
    };

    const numMatch = data.match(/#?(\d+)/);
    if (numMatch) {
      const id = parseInt(numMatch[1], 10);
      if (id >= 0 && id < panoramaLocations.length) {
        const loc = panoramaLocations.find(l => l.id === id);
        if (loc) { assign(loc, id); return; }
      }
    }

    const normalized = data.toLowerCase().trim().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');
    const textMatch = panoramaLocations.find(l => l.city.toLowerCase() === normalized);
    if (textMatch) { assign(textMatch, textMatch.id); return; }

    if (data.startsWith('city:')) {
      const id = parseInt(data.split(':')[1]);
      if (id >= 0 && id < panoramaLocations.length) {
        const loc = panoramaLocations.find(l => l.id === id);
        if (loc) { assign(loc, id); return; }
      }
    }

    setScanError('Karte nicht erkannt – nochmal versuchen');
    setTimeout(() => setScanError(''), 2000);
  }, [scanned, showCityScanner, scanCityForIdx, showQrScanner, onQrScanned]);

  // TUTORIAL
  const TUT_PAGES = [
    { bg: '#262523', titleColor: '#D9593C', bodyColor: '#F1E8E1', title: 'Eine Aufgabe. Nur eine.', body: 'Du stehst plötzlich irgendwo auf der Welt. Wo bist du nur? Auf dem Tisch liegen Stadtnamen. Deine Aufgabe: Welche Stadt liegt am nächsten zu dem, was du siehst?' },
    { bg: '#F2A344', titleColor: '#262523', bodyColor: '#262523', title: 'Ziehen. Scannen. Die Zeit läuft.', body: 'Zieh eine Karte vom Stapel. Scanne den QR-Code mit der App. Ein Ort irgendwo auf der Welt erscheint – und der Timer startet, ob du bereit bist oder nicht.' },
    { bg: '#262523', titleColor: '#F2A344', bodyColor: '#F1E8E1', title: 'Wo zur Hölle bist du?', body: 'Schau dich um. Lies die Zeichen. Hast du eine Landkarte im Kopf?\n\nWähle die Stadt vom Tisch, die am nächsten dran liegt. Je näher du liegst, desto mehr Punkte.' },
    { bg: '#D9593C', titleColor: '#262523', bodyColor: '#262523', title: 'Auf die harte Tour?', body: 'Denkst du, jemand lag falsch? Setz einen Token und nenn DEINE Stadt.\n\nRichtig → Bonuspunkte.\nFalsch → Tschüss, Token.\n\n→ Los geht\'s!' },
  ];

  // ═══════════════ SCANNERS ═══════════════
  if (showCityScanner || showQrScanner) {
    if (!cameraPermission?.granted) {
      return (
        <View style={s.container}><StatusBar hidden />
          <View style={s.centerScreen}>
            <Text style={{ color: C.onSurface, fontSize: 18, marginBottom: 20, textAlign: 'center' }}>Kamera-Berechtigung erforderlich</Text>
            <TouchableOpacity style={s.primaryBtn} onPress={requestCameraPermission}><Text style={s.primaryBtnText}>ERLAUBEN</Text></TouchableOpacity>
            <TouchableOpacity style={s.tertiaryBtn} onPress={() => { setShowCityScanner(false); setShowQrScanner(false); setScanned(false); }}><Text style={s.tertiaryBtnText}>ABBRECHEN</Text></TouchableOpacity>
          </View>
        </View>
      );
    }
    const assignName = showCityScanner && scanCityForIdx !== null ? players[scanCityForIdx]?.name : '';
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}><StatusBar hidden />
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleScan}
          barcodeScannerSettings={{ barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8'] }}
        >
          <View style={s.scanOverlay}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ color: C.primary, fontSize: 13, fontFamily: FF.bold, letterSpacing: 2, marginBottom: 6 }}>
                {showCityScanner ? 'KARTE ZUWEISEN' : 'QR-KARTE SCANNEN'}
              </Text>
              <Text style={{ color: '#fff', fontSize: 22, fontFamily: FF.bold }}>{assignName || 'Spieler'}</Text>
            </View>
            <View style={{ width: width * 0.7, height: width * 0.7, borderWidth: 2, borderColor: C.primary, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' }}>
              <Text style={{ color: C.primary, fontSize: 16, fontWeight: '600', textAlign: 'center' }}>
                {showCityScanner ? 'Stadtkarte in den Rahmen halten' : 'QR-Karte in den Rahmen halten'}
              </Text>
            </View>

            {showCityScanner && (
              <TouchableOpacity style={{ backgroundColor: C.error, width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center', marginTop: 20, alignSelf: 'center' }} onPress={captureAndRecognize}>
                <Text style={{ color: C.bg, fontSize: 26, fontFamily: FF.bold }}>◉</Text>
              </TouchableOpacity>
            )}

            {showCityScanner && (
              <View style={{ width: '100%', paddingHorizontal: 20, marginTop: 16 }}>
                <Text style={{ color: 'rgba(241,232,225,0.6)', fontSize: 11, fontFamily: FF.bold, letterSpacing: 2, textAlign: 'center', marginBottom: 10, textTransform: 'uppercase' }}>Oder Code manuell eingeben</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, backgroundColor: 'rgba(25,26,45,0.9)', borderWidth: 1, borderColor: 'rgba(68,73,52,0.4)', borderRadius: 0 }}>
                    <TextInput
                      style={{ color: '#fff', fontSize: 16, fontFamily: FF.bold, paddingVertical: 12, paddingHorizontal: 16 }}
                      value={manualCode}
                      onChangeText={setManualCode}
                      placeholder="#042 oder Berlin"
                      placeholderTextColor="rgba(241,232,225,0.3)"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="go"
                      onSubmitEditing={submitManualCode}
                    />
                  </View>
                  <TouchableOpacity style={{ backgroundColor: C.primary, paddingVertical: 12, paddingHorizontal: 20, justifyContent: 'center' }} onPress={submitManualCode}>
                    <Text style={{ color: C.onPrimaryContainer, fontSize: 14, fontFamily: FF.bold }}>GO</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {scanError ? (
              <View style={{ backgroundColor: 'rgba(255,100,100,0.9)', paddingVertical: 10, paddingHorizontal: 20, marginTop: 16 }}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>{scanError}</Text>
              </View>
            ) : null}
            <TouchableOpacity style={s.scanCloseBtn} onPress={() => { setShowCityScanner(false); setShowQrScanner(false); setScanned(false); setManualCode(''); }}>
              <Text style={s.scanCloseText}>SCHLIESSEN</Text>
            </TouchableOpacity>
          </View>
        </CameraView>
       </View>
    );
  }

  // ═══════════════ INTRO ═══════════════
  if (screen === 'intro') {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}><StatusBar hidden />
        {/* Video - stoppt bei 4s */}
        <Video
          source={require('./assets/intro.mp4')}
          style={{ ...StyleSheet.absoluteFillObject }}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping={false}
          progressUpdateIntervalMillis={100}
          onPlaybackStatusUpdate={(status: any) => {
            if (status.positionMillis >= 4000) {
              // Video bei 4s stoppen
              setTimeout(() => setScreen('tutorial'), 3000);
            }
          }}
          onError={(e: any) => { console.warn('Intro video error', e); setScreen('tutorial'); }}
        />
        {/* Quote auf dem Video - erscheint ab Sekunde 2,5 */}
        {showQuote && (
          <View style={{ position: 'absolute', bottom: height * 0.12 + 60, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 30 }}>
            <Text style={{ color: C.primary, fontSize: 16, fontFamily: FF.regular, fontStyle: 'italic', textAlign: 'center', lineHeight: 24 }}>„{loadingQuote}“</Text>
          </View>
        )}
        {/* Überspringen-Button */}
        <TouchableOpacity
          activeOpacity={1}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          onPress={() => setScreen('tutorial')}
        >
          <View style={{ position: 'absolute', top: 50, right: 20 }}>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, fontFamily: FF.regular }}>Überspringen</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  // ═══════════════ TUTORIAL ═══════════════
  if (screen === 'tutorial') {
    const handleTutScroll = (e: any) => {
      const x = e.nativeEvent.contentOffset.x;
      const newPage = Math.round(x / width);
      if (newPage >= TUT_PAGES.length) {
        setScreen('setup');
        return;
      }
      if (newPage !== tutorialPage && newPage >= 0 && newPage < TUT_PAGES.length) {
        setTutorialPage(newPage);
      }
    };
    return (
      <View style={{ flex: 1 }}>
        <StatusBar hidden />
        <ScrollView
          ref={tutScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScrollEndDrag={handleTutScroll}
          onMomentumScrollEnd={handleTutScroll}
        >
          {TUT_PAGES.map((p, i) => (
            <View key={i} style={{ width, height, backgroundColor: p.bg, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 36 }}>
              <View style={{ alignItems: 'center', paddingHorizontal: 10 }}>
                <Text style={{ color: p.titleColor, fontSize: 48, fontFamily: FF.bold, textAlign: 'center', marginBottom: 36, lineHeight: 56 }}>{p.title}</Text>
                <Text style={{ color: p.bodyColor || '#F1E8E1', fontSize: 24, fontFamily: FF.regular, textAlign: 'center', lineHeight: 38, opacity: 0.95 }}>{p.body}</Text>
              </View>
            </View>
          ))}
          <View style={{ width, height, backgroundColor: C.bg }} />
        </ScrollView>
        <View style={{ position: 'absolute', bottom: 100, width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
          {TUT_PAGES.map((_, i) => <View key={i} style={{ width: tutorialPage === i ? 28 : 8, height: 8, borderRadius: 4, backgroundColor: tutorialPage === i ? TUT_PAGES[i].titleColor : 'rgba(255,255,255,0.2)', marginHorizontal: 2 }} />)}
        </View>
        <View style={{ position: 'absolute', bottom: 40, width: '100%', paddingHorizontal: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => setScreen('setup')}><Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14, fontFamily: FF.regular }}>Tutorial überspringen</Text></TouchableOpacity>
          {tutorialPage < TUT_PAGES.length - 1 ? (
            <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, fontFamily: FF.regular }}>Swipe →</Text>
          ) : (
            <TouchableOpacity style={{ backgroundColor: C.error, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 9999 }} onPress={() => setScreen('setup')}>
              <Text style={{ color: '#fff', fontSize: 17, fontFamily: FF.bold }}>Auf geht's!</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // ═══════════════ SETUP ═══════════════
  if (screen === 'setup') {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <StatusBar hidden />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
          {/* HEADER */}
          <View style={{ paddingHorizontal: 24, paddingTop: 50, paddingBottom: 12 }}>
            <Text style={{ color: C.primary, fontSize: 13, fontFamily: FF.bold, letterSpacing: 3, marginBottom: 4, textTransform: 'uppercase' }}>Spielaufbau</Text>
            <Text style={{ color: C.onSurface, fontSize: 28, fontFamily: FF.bold }}>Wer spielt?</Text>
          </View>

          {/* PLAYERS */}
          <View style={{ paddingHorizontal: 24, gap: 8 }}>
            {players.map((p, idx) => (
              <View key={p.id} style={{ backgroundColor: C.surface, padding: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ color: C.primary, fontSize: 11, fontFamily: FF.bold, letterSpacing: 2, textTransform: 'uppercase' }}>Spieler {idx + 1}</Text>
                  {players.length > 2 && (
                    <TouchableOpacity onPress={() => setPlayers(prev => prev.filter((_, i) => i !== idx))}>
                      <Text style={{ color: C.error, fontSize: 14, fontFamily: FF.bold }}>Entfernen</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <TextInput
                  style={{ color: C.onSurface, fontSize: 16, fontFamily: FF.bold, backgroundColor: C.surfaceLow, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 8 }}
                  value={p.name}
                  onChangeText={t => setPlayers(prev => prev.map((pl, i) => i === idx ? { ...pl, name: t } : pl))}
                  placeholder="Name eingeben"
                  placeholderTextColor={C.muted}
                  onFocus={() => {
                    if (p.name === `Spieler ${idx + 1}`) {
                      setPlayers(prev => prev.map((pl, i) => i === idx ? { ...pl, name: '' } : pl));
                    }
                  }}
                />
                <TouchableOpacity
                  style={{ backgroundColor: p.city ? C.primary : C.surfaceHigh, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                  onPress={() => openCityScan(idx)}
                >
                  <Text style={{ color: p.city ? C.onPrimaryContainer : C.muted, fontSize: 14, fontFamily: FF.bold }}>
                    {p.city || 'Stadtkarte zuweisen'}
                  </Text>
                  <Text style={{ color: p.city ? C.onPrimaryContainer : C.muted, fontSize: 16 }}>+</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity style={{ backgroundColor: C.surface, padding: 12, alignItems: 'center' }} onPress={addPlayer}>
              <Text style={{ color: C.muted, fontSize: 14, fontFamily: FF.bold }}>+ Spieler hinzufügen</Text>
            </TouchableOpacity>
          </View>

          {/* SETTINGS */}
          <View style={{ paddingHorizontal: 24, marginTop: 20, gap: 10 }}>
            <Text style={{ color: C.primary, fontSize: 13, fontFamily: FF.bold, letterSpacing: 3, textTransform: 'uppercase' }}>Einstellungen</Text>
            <View style={{ backgroundColor: C.surface, padding: 14 }}>
              <Text style={{ color: C.onSurface, fontSize: 14, fontFamily: FF.regular, marginBottom: 8 }}>Timer pro Runde: {timerSetting}s</Text>
              <View style={{ height: 60, justifyContent: 'center' }}>
                <SliderTrack
                  value={timerSetting}
                  onChange={setTimerSetting}
                  min={1}
                  max={60}
                />
              </View>
            </View>
            <View style={{ backgroundColor: C.surface, padding: 14 }}>
              <Text style={{ color: C.onSurface, fontSize: 14, fontFamily: FF.regular, marginBottom: 8 }}>Runden pro Spieler</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[5, 10, 15, 20].filter(r => r <= maxPossibleRounds()).map(r => (
                  <TouchableOpacity key={r} style={{ flex: 1, backgroundColor: roundsSetting === r ? C.primary : C.surfaceHigh, paddingVertical: 10, alignItems: 'center' }} onPress={() => setRoundsSetting(r)}>
                    <Text style={{ color: roundsSetting === r ? C.onPrimaryContainer : C.onSurface, fontSize: 14, fontFamily: FF.bold }}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </ScrollView>

        {/* START BUTTON */}
        <View style={{ paddingHorizontal: 24, paddingBottom: 30, paddingTop: 12 }}>
          <TouchableOpacity
            style={{ backgroundColor: allPlayersScanned ? C.primary : C.surfaceHigh, paddingVertical: 16, alignItems: 'center', opacity: allPlayersScanned ? 1 : 0.5 }}
            onPress={startGame}
            disabled={!allPlayersScanned}
          >
            <Text style={{ color: allPlayersScanned ? C.onPrimaryContainer : C.muted, fontSize: 18, fontFamily: FF.bold, letterSpacing: 2 }}>
              {allPlayersScanned ? 'SPIEL STARTEN' : 'ALLE KARTEN ZUWEISEN'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ═══════════════ GAME ═══════════════
  if (screen === 'game') {
    const activePlayer = players[activePlayerIdx];
    const otherPlayers = players.filter(p => p.id !== activePlayer.id);

    // SCAN QR PHASE
    if (phase === 'scan-qr') {
      return (
        <View style={s.container}><StatusBar hidden />
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 }}>
            <View style={{ backgroundColor: C.surface, padding: 40, width: '100%', alignItems: 'center' }}>
              <Text style={{ color: C.primary, fontSize: 16, fontFamily: FF.bold, letterSpacing: 3, marginBottom: 12, textTransform: 'uppercase' }}>Runde {round}/{maxRounds}</Text>
              <Text style={{ color: C.onSurface, fontSize: 34, fontFamily: FF.bold, marginBottom: 12 }}>{activePlayer.name}</Text>
              <Text style={{ color: C.muted, fontSize: 18, fontFamily: FF.regular, marginBottom: 40, textAlign: 'center' }}>Ziehe eine Karte und scanne den QR-Code</Text>
              <TouchableOpacity style={{ backgroundColor: C.primary, paddingVertical: 18, paddingHorizontal: 48 }} onPress={() => { setShowQrScanner(true); setScanned(false); }}>
                <Text style={{ color: C.onPrimaryContainer, fontSize: 18, fontFamily: FF.bold, letterSpacing: 2 }}>QR SCANNEN</Text>
              </TouchableOpacity>
            </View>
            {/* SCOREBOARD - larger */}
            <View style={{ position: 'absolute', top: 60, left: 0, right: 0, paddingHorizontal: 24 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20 }}>
                {players.map(p => (
                  <View key={p.id} style={{ backgroundColor: p.id === activePlayer.id ? C.primary : C.surface, paddingVertical: 10, paddingHorizontal: 22 }}>
                    <Text style={{ color: p.id === activePlayer.id ? C.onPrimaryContainer : C.onSurface, fontSize: 18, fontFamily: FF.bold }}>{p.name}: {p.score}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </View>
      );
    }

    // VIEW PHASE — Street View
    if (phase === 'view') {
      return (
        <View style={{ flex: 1, backgroundColor: '#000' }}><StatusBar hidden />
          <WebView
            source={{ html: buildStreetViewHtml(location.lat, location.lng) }}
            style={{ flex: 1 }}
            javaScriptEnabled
            domStorageEnabled
            onMessage={(e) => {
              if (e.nativeEvent.data === 'loaded') setSvLoaded(true);
              if (e.nativeEvent.data === 'error') setSvError(true);
            }}
            onError={() => setSvError(true)}
          />
          {/* TIMER OVERLAY */}
          <View style={{ position: 'absolute', top: 50, left: 0, right: 0, alignItems: 'center' }}>
            <Animated.View style={{ backgroundColor: timer <= 10 ? C.error : 'rgba(0,0,0,0.7)', paddingVertical: 8, paddingHorizontal: 24, transform: [{ scale: timerPulse }] }}>
              <Text style={{ color: '#fff', fontSize: 36, fontFamily: FF.bold }}>{timer}</Text>
            </Animated.View>
          </View>
          {/* PICK BUTTON */}
          <View style={{ position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center' }}>
            <TouchableOpacity style={{ backgroundColor: C.primary, paddingVertical: 16, paddingHorizontal: 48 }} onPress={() => setPhase('pick')}>
              <Text style={{ color: C.onPrimaryContainer, fontSize: 18, fontFamily: FF.bold, letterSpacing: 2 }}>STADT WÄHLEN</Text>
            </TouchableOpacity>
          </View>
          {svError && (
            <View style={{ position: 'absolute', top: 100, left: 20, right: 20, backgroundColor: 'rgba(217,89,60,0.9)', padding: 16 }}>
              <Text style={{ color: '#fff', fontSize: 14, fontFamily: FF.bold, textAlign: 'center' }}>Street View nicht verfügbar. Trotzdem raten?</Text>
            </View>
          )}
        </View>
      );
    }

    // PICK PHASE
    if (phase === 'pick') {
      return (
        <View style={s.container}><StatusBar hidden />
          <View style={{ paddingHorizontal: 24, paddingTop: 60, paddingBottom: 20 }}>
            <Text style={{ color: C.primary, fontSize: 13, fontFamily: FF.bold, letterSpacing: 3, marginBottom: 8, textTransform: 'uppercase' }}>Stadt wählen</Text>
            <Text style={{ color: C.onSurface, fontSize: 24, fontFamily: FF.bold }}>{activePlayer.name}, welche Stadt liegt am nächsten?</Text>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, gap: 10, paddingBottom: 20 }}>
            {tableCities.map((tc, idx) => (
              <TouchableOpacity key={idx} style={{ backgroundColor: C.surface, padding: 18, borderWidth: 1, borderColor: C.outline, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }} onPress={() => pickCity(idx)}>
                <View>
                  <Text style={{ color: C.onSurface, fontSize: 20, fontFamily: FF.bold }}>{tc.city}</Text>
                  {tc.ownerPlayerId && <Text style={{ color: C.muted, fontSize: 12, fontFamily: FF.regular, marginTop: 2 }}>von {players.find(p => p.id === tc.ownerPlayerId)?.name}</Text>}
                </View>
                <Text style={{ color: C.primary, fontSize: 24 }}>→</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      );
    }

    // CHALLENGE PHASE
    if (phase === 'challenge') {
      return (
        <View style={s.container}><StatusBar hidden />
          <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 60 }}>
            <Text style={{ color: C.primary, fontSize: 15, fontFamily: FF.bold, letterSpacing: 3, marginBottom: 16, textTransform: 'uppercase' }}>Challenge!</Text>
            <Text style={{ color: C.onSurface, fontSize: 24, fontFamily: FF.bold, marginBottom: 8 }}>
              {activePlayer.name} wählte {tableCities[activePickIdx!]?.city}
            </Text>
            <Text style={{ color: C.muted, fontSize: 18, fontFamily: FF.regular, marginBottom: 24 }}>
              Denkst du, das war falsch? Setz einen Token!
            </Text>
            <View style={{ flexDirection: 'column', gap: 12, width: '100%' }}>
              <TouchableOpacity style={{ backgroundColor: C.primary, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center' }} onPress={() => { setChallengerId(null); resolveRound(); }}>
                <Text style={{ color: C.onPrimaryContainer, fontSize: 16, fontFamily: FF.bold }}>Kein Challenge → Auflösen</Text>
              </TouchableOpacity>
              {otherPlayers.map(p => (
                <TouchableOpacity key={p.id} style={{ backgroundColor: C.secondary, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center' }} onPress={() => { setChallengerId(p.id); }}>
                  <Text style={{ color: C.onSecondaryContainer, fontSize: 16, fontFamily: FF.bold }}>{p.name} challenged</Text>
                </TouchableOpacity>
              ))}
            </View>
            {challengerId !== null && (
              <View style={{ marginTop: 24 }}>
                <Text style={{ color: C.onSurface, fontSize: 18, fontFamily: FF.bold, marginBottom: 12 }}>
                  {players.find(p => p.id === challengerId)?.name}, welche Stadt liegt deiner Meinung nach am nächsten?
                </Text>
                <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ gap: 8 }}>
                  {tableCities.map((tc, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={{ backgroundColor: challengerPickIdx === idx ? C.primary : C.surface, padding: 14, borderWidth: 1, borderColor: challengerPickIdx === idx ? C.primary : C.outline, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                      onPress={() => setChallengerPickIdx(idx)}
                    >
                      <Text style={{ color: challengerPickIdx === idx ? C.onPrimaryContainer : C.onSurface, fontSize: 18, fontFamily: FF.bold }}>{tc.city}</Text>
                      {tc.ownerPlayerId && <Text style={{ color: C.muted, fontSize: 12, fontFamily: FF.regular }}>von {players.find(p => p.id === tc.ownerPlayerId)?.name}</Text>}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  style={{ backgroundColor: challengerPickIdx !== null ? C.primary : C.surfaceHigh, paddingVertical: 14, marginTop: 16, width: '100%', alignItems: 'center', opacity: challengerPickIdx !== null ? 1 : 0.5 }}
                  disabled={challengerPickIdx === null}
                  onPress={resolveRound}
                >
                  <Text style={{ color: challengerPickIdx !== null ? C.onPrimaryContainer : C.muted, fontSize: 16, fontFamily: FF.bold }}>AUFLÖSEN</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      );
    }

    // RESULT PHASE
    if (phase === 'result') {
      const correct = closestCityIdx === activePickIdx;
      const closestCity = closestCityIdx !== null ? tableCities[closestCityIdx] : null;
      const dist = closestCityIdx !== null && activePickIdx !== null ? distances[activePickIdx] : 0;
      return (
        <View style={s.container}><StatusBar hidden />
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 }}>
            <View style={{ width: '100%', alignItems: 'center' }}>
              <Text style={{ color: C.primary, fontSize: 15, fontFamily: FF.bold, letterSpacing: 3, marginBottom: 16, textTransform: 'uppercase' }}>Ergebnis</Text>
              <Text style={{ color: C.onSurface, fontSize: 28, fontFamily: FF.bold, marginBottom: 8 }}>{location.city}</Text>
              {closestCity && (
                <Text style={{ color: C.muted, fontSize: 18, fontFamily: FF.regular, marginBottom: 16 }}>
                  Nächste Stadt: {closestCity.city} ({formatDistance(distances[closestCityIdx!])})
                </Text>
              )}
              {winnerId !== null ? (
                <Text style={{ color: C.primary, fontSize: 24, fontFamily: FF.bold, marginBottom: 8 }}>
                  +1 Punkt für {players.find(p => p.id === winnerId)?.name}!
                </Text>
              ) : (
                <Text style={{ color: C.error, fontSize: 24, fontFamily: FF.bold, marginBottom: 8 }}>Niemand bekommt Punkte</Text>
              )}
              <Text style={{ color: C.muted, fontSize: 16, fontFamily: FF.regular, marginBottom: 24 }}>
                Gewählt: {activePickIdx !== null ? tableCities[activePickIdx]?.city : '—'} ({formatDistance(dist)})
              </Text>
              <TouchableOpacity style={{ backgroundColor: C.primary, paddingVertical: 14, width: '100%', alignItems: 'center' }} onPress={nextTurn}>
                <Text style={{ color: C.onPrimaryContainer, fontSize: 16, fontFamily: FF.bold, letterSpacing: 2 }}>
                  {round >= maxRounds ? 'ERGEBNISSE' : 'NÄCHSTE RUNDE'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    return null;
  }

  // ═══════════════ RESULT ═══════════════
  if (screen === 'result') {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    return (
      <View style={s.container}><StatusBar hidden />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 }}>
          <View style={{ width: '100%', alignItems: 'center' }}>
            <Text style={{ color: C.primary, fontSize: 15, fontFamily: FF.bold, letterSpacing: 3, marginBottom: 16, textTransform: 'uppercase' }}>Spiel beendet</Text>
            <Text style={{ color: C.onSurface, fontSize: 32, fontFamily: FF.bold, marginBottom: 24 }}>{winner.name} gewinnt!</Text>
            <View style={{ width: '100%', gap: 8 }}>
              {sorted.map((p, i) => (
                <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: i === 0 ? C.primary : C.surfaceHigh, paddingVertical: 12, paddingHorizontal: 16 }}>
                  <Text style={{ color: i === 0 ? C.onPrimaryContainer : C.onSurface, fontSize: 18, fontFamily: FF.bold }}>{i + 1}. {p.name}</Text>
                  <Text style={{ color: i === 0 ? C.onPrimaryContainer : C.onSurface, fontSize: 18, fontFamily: FF.bold }}>{p.score} Pkt</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={{ backgroundColor: C.primary, paddingVertical: 14, width: '100%', alignItems: 'center', marginTop: 24 }} onPress={() => { setScreen('setup'); setPlayers(prev => prev.map(p => ({ ...p, score: 0 }))); }}>
              <Text style={{ color: C.onPrimaryContainer, fontSize: 16, fontFamily: FF.bold, letterSpacing: 2 }}>NOCHMAL SPIELEN</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ marginTop: 12 }} onPress={() => { setScreen('intro'); setPlayers(prev => prev.map(p => ({ ...p, score: 0, city: '', cityId: -1, lat: 0, lng: 0 }))); }}>
              <Text style={{ color: C.muted, fontSize: 14, fontFamily: FF.regular }}>Zum Startbildschirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return null;
}

// ═══════════════ SLIDER TRACK COMPONENT ═══════════════
const SNAP_VALUES = [1, 5, 10, 20, 30, 45];
function SliderTrack({ value, onChange }: { value: number; onChange: (v: number) => void; min: number; max: number }) {
  const containerRef = useRef<View>(null);
  const containerLayoutRef = useRef({ x: 0, y: 0, w: 0 });

  const currentSnapIdx = SNAP_VALUES.indexOf(value);
  const numSnaps = SNAP_VALUES.length;
  const LABEL_W = 40; // width of each number label block

  // Calculate the center position of label i in a space-between layout
  // space-between: first label at 0, last label at (containerW - LABEL_W)
  // gap = (containerW - numSnaps * LABEL_W) / (numSnaps - 1)
  // center of label i = i * (LABEL_W + gap) + LABEL_W/2
  const getLabelCenter = useCallback((idx: number, containerW: number) => {
    if (containerW <= 0) return 0;
    const gap = (containerW - numSnaps * LABEL_W) / (numSnaps - 1);
    return idx * (LABEL_W + gap) + LABEL_W / 2;
  }, []);

  const getSnapFromX = useCallback((pageX: number) => {
    const { x, w } = containerLayoutRef.current;
    if (w <= 0) return value;
    const relativeX = pageX - x;
    // Find nearest label center
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
      onPanResponderGrant: (e) => {
        updateLayout();
        onChange(getSnapFromX(e.nativeEvent.pageX));
      },
      onPanResponderMove: (e) => {
        if (containerLayoutRef.current.w > 0) {
          onChange(getSnapFromX(e.nativeEvent.pageX));
        }
      },
    })
  ).current;

  const [containerWidth, setContainerWidth] = useState(0);
  const circleCenter = currentSnapIdx >= 0 && containerWidth > 0
    ? getLabelCenter(currentSnapIdx, containerWidth)
    : 0;

  return (
    <View
      ref={containerRef}
      style={{ height: 60, justifyContent: 'center', position: 'relative' }}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        setContainerWidth(w);
        containerLayoutRef.current.x = 0;
        containerLayoutRef.current.w = w;
        updateLayout();
      }}
      {...panResponder.panHandlers}
    >
      {/* Track bar */}
      <View style={{ position: 'absolute', left: 0, top: 13, right: 0, height: 6, backgroundColor: C.surfaceHigh }}>
        <View style={{ position: 'absolute', left: 0, top: 0, height: 6, width: circleCenter, backgroundColor: C.primary }} />
      </View>
      {/* Circle - positioned exactly over the label center */}
      <View
        style={{ position: 'absolute', left: circleCenter - 12, top: 4, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: C.outline, backgroundColor: C.surface }}
      />
      {/* Labels - same layout used for circle positioning */}
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

// ═══════════════ STYLES ═══════════════
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  centerScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  primaryBtn: { backgroundColor: C.primary, paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { color: C.onPrimaryContainer, fontSize: 16, fontFamily: FF.bold, letterSpacing: 2 },
  tertiaryBtn: { paddingVertical: 10, paddingHorizontal: 20 },
  tertiaryBtnText: { color: C.muted, fontSize: 14, fontFamily: FF.regular },
  scanOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  scanCloseBtn: { position: 'absolute', bottom: 40, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingVertical: 10, paddingHorizontal: 24 },
  scanCloseText: { color: '#fff', fontSize: 14, fontFamily: FF.bold, letterSpacing: 2 },
});
