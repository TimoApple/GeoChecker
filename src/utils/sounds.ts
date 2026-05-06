// GeoCheckr — REAL Audio Beeps via Web Audio API
// Uses a hidden WebView to generate tones (no external files needed)

let webViewRef: any = null;

// HTML that generates beeps via Web Audio API
const AUDIO_HTML = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:transparent;">
<script>
let ctx = null;
let ctxReady = false;

function ensureCtx() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch(e) { return; }
  }
  if (ctx && ctx.state === 'suspended') {
    ctx.resume();
  }
  ctxReady = true;
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('ready');
}

// Initialize immediately (works in newer Android WebViews)
ensureCtx();

// Also on touch (fallback for older WebViews)
document.addEventListener('touchstart', function() { ensureCtx(); }, {once: true});
document.addEventListener('click', function() { ensureCtx(); }, {once: true});

function beep(freq, duration, volume) {
  if (!ctxReady) ensureCtx();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.value = volume || 0.3;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.stop(ctx.currentTime + duration);
  } catch(e) {}
}

// Listen for commands from React Native
window.addEventListener('message', (e) => {
  try {
    const cmd = JSON.parse(e.data);
    ensureCtx();
    if (cmd.type === 'tick') beep(880, 0.08, 0.2);
    if (cmd.type === 'warning') { beep(440, 0.3, 0.4); setTimeout(() => beep(440, 0.3, 0.4), 350); }
    if (cmd.type === 'click') beep(660, 0.05, 0.15);
    if (cmd.type === 'success') { beep(523, 0.1, 0.3); setTimeout(() => beep(659, 0.1, 0.3), 120); setTimeout(() => beep(784, 0.15, 0.3), 240); }
    if (cmd.type === 'perfect') { beep(523, 0.1, 0.3); setTimeout(() => beep(659, 0.1, 0.3), 100); setTimeout(() => beep(784, 0.1, 0.3), 200); setTimeout(() => beep(1047, 0.2, 0.35), 300); }
    if (cmd.type === 'error') beep(220, 0.4, 0.3);
    if (cmd.type === 'scan') beep(440, 0.1, 0.25);
    if (cmd.type === 'answerphone') { beep(1400, 0.6, 0.5); setTimeout(() => beep(1000, 0.3, 0.4), 200); }
  } catch(e) {}
});

// Signal ready AND initialize audio context
document.addEventListener('DOMContentLoaded', function() {
  window.ReactNativeWebView && window.ReactNativeWebView.postMessage('ready');
});
</script>
</body></html>`;

// Store reference to send commands
let isReady = false;
let pendingCommands: string[] = [];

export function setAudioWebViewRef(ref: any) {
  webViewRef = ref;
}

export function onAudioReady() {
  isReady = true;
  // Send any pending commands
  pendingCommands.forEach(cmd => sendCommand(cmd));
  pendingCommands = [];
}

function sendCommand(type: string) {
  if (!isReady || !webViewRef) {
    pendingCommands.push(type);
    return;
  }
  try {
    webViewRef.injectJavaScript(`window.postMessage('${JSON.stringify({type})}', '*'); true;`);
  } catch(e) {
    pendingCommands.push(type);
  }
}

export async function playClickSound() { sendCommand('click'); }
export async function playSuccessSound() { sendCommand('success'); }
export async function playErrorSound() { sendCommand('error'); }
export async function playPerfectSound() { sendCommand('perfect'); }
export async function playSkipSound() { sendCommand('click'); }
export async function playTimerWarning() { sendCommand('warning'); }
export async function playTimerTick() { sendCommand('tick'); }
export async function playScanSound() { sendCommand('scan'); }
export async function playAnswerphoneBeep() { sendCommand('answerphone'); }

export { AUDIO_HTML };
