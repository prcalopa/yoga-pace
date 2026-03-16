const presets = {
  calma: ['#A06CD5', '#B8F2E6', '#CDE7FF', '#D8F3DC', '#F7D6E0'],
  amanecer: ['#FF9770', '#FFD670', '#F9F871', '#F7B267', '#F4845F'],
  bosque: ['#1B4332', '#2D6A4F', '#40916C', '#74C69D', '#B7E4C7'],
  sunset: ['#7B2CBF', '#9D4EDD', '#C77DFF', '#FF758F', '#FFB4A2'],
};

const defaults = {
  totalMinutes: 20,
  intervalMinutes: 2,
  palette: presets.calma,
  preset: 'calma',
  vibrationEnabled: true,
  flashIntensity: 35,
  panelExpanded: false,
};

const state = {
  settings: loadSettings(),
  running: false,
  paused: false,
  elapsedMs: 0,
  timerId: null,
  lastFrameAt: null,
  currentColor: '',
  wakeLock: null,
  deferredPrompt: null,
  lastPhaseIndex: 0,
};

const canvas = document.querySelector('#ambient-canvas');
const ctx = canvas.getContext('2d');
const flashOverlay = document.querySelector('#screen-flash');
const settingsButton = document.querySelector('#settings-button');
const installButton = document.querySelector('#install-button');
const modal = document.querySelector('#settings-modal');
const settingsForm = document.querySelector('#settings-form');
const totalMinutesInput = document.querySelector('#total-minutes');
const intervalMinutesInput = document.querySelector('#interval-minutes');
const palettePresetInput = document.querySelector('#palette-preset');
const paletteInput = document.querySelector('#palette-input');
const vibrationEnabledInput = document.querySelector('#vibration-enabled');
const flashIntensityInput = document.querySelector('#flash-intensity');
const flashIntensityValue = document.querySelector('#flash-intensity-value');
const palettePreviewTrack = document.querySelector('#palette-preview-track');
const playButton = document.querySelector('#play-button');
const pauseButton = document.querySelector('#pause-button');
const stopButton = document.querySelector('#stop-button');
const secondaryControls = document.querySelector('#secondary-controls');
const sessionPanel = document.querySelector('#session-panel');
const sessionToggle = document.querySelector('#session-toggle');
const sessionDetails = document.querySelector('#session-details');
const sessionToggleTime = document.querySelector('#session-toggle-time');
const sessionTogglePhase = document.querySelector('#session-toggle-phase');
const elapsedTime = document.querySelector('#elapsed-time');
const remainingTime = document.querySelector('#remaining-time');
const intervalTime = document.querySelector('#interval-time');
const nextChangeTime = document.querySelector('#next-change-time');
const currentColor = document.querySelector('#current-color');
const currentPhase = document.querySelector('#current-phase');
const deviceStatus = document.querySelector('#device-status');

function loadSettings() {
  try {
    const raw = localStorage.getItem('yoga-pace-settings');
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    const palette = Array.isArray(parsed.palette) && parsed.palette.length ? parsed.palette : defaults.palette;
    const preset = parsed.preset && presets[parsed.preset] ? parsed.preset : detectPreset(palette);

    return {
      totalMinutes: Number(parsed.totalMinutes) || defaults.totalMinutes,
      intervalMinutes: Number(parsed.intervalMinutes) || defaults.intervalMinutes,
      palette,
      preset,
      vibrationEnabled: parsed.vibrationEnabled ?? defaults.vibrationEnabled,
      flashIntensity: Number(parsed.flashIntensity ?? defaults.flashIntensity),
      panelExpanded: parsed.panelExpanded ?? defaults.panelExpanded,
    };
  } catch {
    return { ...defaults };
  }
}

function saveSettings() {
  localStorage.setItem('yoga-pace-settings', JSON.stringify(state.settings));
}

function detectPreset(palette) {
  const normalized = JSON.stringify(palette);
  const match = Object.entries(presets).find(([, colors]) => JSON.stringify(colors) === normalized);
  return match ? match[0] : 'custom';
}

function syncForm() {
  totalMinutesInput.value = state.settings.totalMinutes;
  intervalMinutesInput.value = state.settings.intervalMinutes;
  palettePresetInput.value = state.settings.preset || 'custom';
  paletteInput.value = state.settings.palette.join(', ');
  vibrationEnabledInput.checked = state.settings.vibrationEnabled;
  flashIntensityInput.value = state.settings.flashIntensity;
  flashIntensityValue.textContent = `${state.settings.flashIntensity}%`;
  renderPalettePreview(state.settings.palette);
  applyPanelState();
}

function renderPalettePreview(palette) {
  palettePreviewTrack.innerHTML = '';
  palette.forEach((color) => {
    const swatch = document.createElement('div');
    swatch.className = 'palette-swatch';
    swatch.style.background = color;
    swatch.title = color;
    palettePreviewTrack.appendChild(swatch);
  });
}

function parsePalette(value) {
  return value
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawBackground(state.elapsedMs);
}

function getSessionDurationMs() {
  return state.settings.totalMinutes * 60 * 1000;
}

function getIntervalDurationMs() {
  return state.settings.intervalMinutes * 60 * 1000;
}

function hexToRgb(color) {
  if (color.startsWith('rgb')) {
    const values = color.match(/\d+/g)?.map(Number) || [255, 255, 255];
    return { r: values[0], g: values[1], b: values[2] };
  }

  const normalized = color.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((char) => char + char).join('')
    : normalized;
  const int = parseInt(value, 16);

  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function rgbToString({ r, g, b }) {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function mixColor(a, b, t) {
  const start = hexToRgb(a);
  const end = hexToRgb(b);

  return rgbToString({
    r: start.r + (end.r - start.r) * t,
    g: start.g + (end.g - start.g) * t,
    b: start.b + (end.b - start.b) * t,
  });
}

function shadeColor(color, amount) {
  const rgb = hexToRgb(color);
  return rgbToString({
    r: Math.max(0, Math.min(255, rgb.r + amount)),
    g: Math.max(0, Math.min(255, rgb.g + amount)),
    b: Math.max(0, Math.min(255, rgb.b + amount)),
  });
}

function getColorState(elapsedMs) {
  const palette = state.settings.palette.length ? state.settings.palette : defaults.palette;
  if (!palette.length) {
    return { color: defaults.palette[0], phaseIndex: 0, nextChangeInMs: getIntervalDurationMs() };
  }

  if (!state.running && !state.paused && elapsedMs === 0) {
    return { color: palette[0], phaseIndex: 0, nextChangeInMs: getIntervalDurationMs() };
  }

  const intervalMs = getIntervalDurationMs();
  const safeElapsed = Math.max(elapsedMs, 0);
  const phaseIndex = Math.floor(safeElapsed / intervalMs);
  const currentIndex = phaseIndex % palette.length;
  const nextIndex = (currentIndex + 1) % palette.length;
  const progress = (safeElapsed % intervalMs) / intervalMs;
  const color = mixColor(palette[currentIndex], palette[nextIndex], progress);
  const nextChangeInMs = intervalMs - (safeElapsed % intervalMs || 0);

  return { color, phaseIndex, nextChangeInMs };
}

function drawBackground(elapsedMs) {
  const { color } = getColorState(elapsedMs);
  state.currentColor = color;
  const gradient = ctx.createLinearGradient(0, 0, window.innerWidth, window.innerHeight);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, shadeColor(color, -28));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
  currentColor.textContent = color.toUpperCase();
}

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function getPhaseLabel() {
  if (state.paused) return 'En pausa';
  if (state.running) return 'Activa';
  if (state.elapsedMs >= getSessionDurationMs() && state.elapsedMs !== 0) return 'Completada';
  return 'Preparada';
}

function updateDeviceStatus(message = 'Lista para empezar.') {
  deviceStatus.textContent = message;
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) {
    updateDeviceStatus('Wake Lock no disponible en este navegador.');
    return;
  }

  try {
    state.wakeLock = await navigator.wakeLock.request('screen');
    state.wakeLock.addEventListener('release', () => {
      state.wakeLock = null;
      if (state.running || state.paused) {
        updateDeviceStatus('Pantalla libre. Si se apaga, vuelve a tocar Play.');
      }
    });
    updateDeviceStatus('Pantalla activa durante la sesión.');
  } catch {
    updateDeviceStatus('No se pudo bloquear la pantalla activa.');
  }
}

async function releaseWakeLock() {
  if (!state.wakeLock) return;
  try {
    await state.wakeLock.release();
  } catch {
    // ignore
  } finally {
    state.wakeLock = null;
  }
}

async function requestFullscreen() {
  const target = document.documentElement;
  if (!document.fullscreenEnabled || document.fullscreenElement) return;

  try {
    await target.requestFullscreen();
    updateDeviceStatus('Pantalla completa activada.');
  } catch {
    updateDeviceStatus('Pantalla completa no disponible; seguimos igual.');
  }
}

async function installApp() {
  if (!state.deferredPrompt) return;
  state.deferredPrompt.prompt();
  try {
    await state.deferredPrompt.userChoice;
  } finally {
    state.deferredPrompt = null;
    installButton.classList.add('hidden');
  }
}

function triggerFlash() {
  const intensity = Math.max(0, Math.min(100, Number(state.settings.flashIntensity || 0)));
  if (!intensity) return;
  document.documentElement.style.setProperty('--flash-opacity', (intensity / 100).toFixed(2));
  flashOverlay.classList.remove('is-active');
  void flashOverlay.offsetWidth;
  flashOverlay.classList.add('is-active');
}

function triggerVibration() {
  if (!state.settings.vibrationEnabled || !('vibrate' in navigator)) return;
  navigator.vibrate([90, 60, 90]);
}

function notifyIntervalChange(phaseIndex) {
  if (phaseIndex <= 0 || phaseIndex === state.lastPhaseIndex) return;
  triggerVibration();
  triggerFlash();
}

function preventTouchZoom(event) {
  if (event.touches?.length > 1) event.preventDefault();
}

function preventGestureZoom(event) {
  event.preventDefault();
}

function applyPanelState() {
  const expanded = !!state.settings.panelExpanded;
  sessionPanel.classList.toggle('session-panel--collapsed', !expanded);
  sessionToggle.setAttribute('aria-expanded', String(expanded));
  sessionDetails.classList.toggle('hidden', !expanded);
}

function updateUI() {
  const totalMs = getSessionDurationMs();
  const { nextChangeInMs } = getColorState(state.elapsedMs);
  const phaseLabel = getPhaseLabel();
  const sessionLocked = state.running || state.paused;

  elapsedTime.textContent = formatTime(state.elapsedMs);
  remainingTime.textContent = formatTime(totalMs - state.elapsedMs);
  intervalTime.textContent = formatTime(getIntervalDurationMs());
  nextChangeTime.textContent = formatTime(nextChangeInMs);
  currentPhase.textContent = phaseLabel;
  sessionToggleTime.textContent = formatTime(state.elapsedMs);
  sessionTogglePhase.textContent = phaseLabel;
  settingsButton.disabled = sessionLocked;
  settingsButton.setAttribute('aria-disabled', String(sessionLocked));
  drawBackground(state.elapsedMs);

  if (sessionLocked) {
    if (modal.open) modal.close();
    playButton.classList.add('hidden');
    secondaryControls.classList.remove('hidden');
    pauseButton.textContent = state.paused ? 'Resume' : 'Pause';
  } else {
    playButton.classList.remove('hidden');
    secondaryControls.classList.add('hidden');
  }
}

function finishSession() {
  state.running = false;
  state.paused = false;
  state.lastFrameAt = null;
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
  releaseWakeLock();
  updateDeviceStatus('Sesión completada.');
  updateUI();
}

function tick(now) {
  if (!state.running || state.paused) return;
  if (!state.lastFrameAt) state.lastFrameAt = now;

  const delta = now - state.lastFrameAt;
  state.lastFrameAt = now;
  state.elapsedMs += delta;

  const { phaseIndex } = getColorState(state.elapsedMs);
  if (phaseIndex !== state.lastPhaseIndex) {
    notifyIntervalChange(phaseIndex);
    state.lastPhaseIndex = phaseIndex;
  }

  if (state.elapsedMs >= getSessionDurationMs()) {
    state.elapsedMs = getSessionDurationMs();
    finishSession();
    return;
  }

  updateUI();
}

async function startSession() {
  if (state.running && !state.paused) return;
  if (modal.open) modal.close();
  if (state.elapsedMs >= getSessionDurationMs()) state.elapsedMs = 0;
  state.running = true;
  state.paused = false;
  state.lastFrameAt = null;
  state.lastPhaseIndex = getColorState(state.elapsedMs).phaseIndex;
  await requestFullscreen();
  await requestWakeLock();
  if (!state.timerId) state.timerId = window.setInterval(() => tick(performance.now()), 100);
  updateUI();
}

function togglePause() {
  if (!state.running && !state.paused) return;
  state.paused = !state.paused;
  state.lastFrameAt = null;
  updateDeviceStatus(state.paused ? 'Sesión en pausa.' : 'Sesión activa.');
  updateUI();
}

function stopSession() {
  state.running = false;
  state.paused = false;
  state.elapsedMs = 0;
  state.lastFrameAt = null;
  state.lastPhaseIndex = 0;
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
  releaseWakeLock();
  updateDeviceStatus('Sesión detenida.');
  updateUI();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  state.deferredPrompt = event;
  installButton.classList.remove('hidden');
});

window.addEventListener('appinstalled', () => {
  state.deferredPrompt = null;
  installButton.classList.add('hidden');
  updateDeviceStatus('App instalada.');
});

settingsButton.addEventListener('click', () => {
  syncForm();
  modal.showModal();
});

installButton.addEventListener('click', installApp);

sessionToggle.addEventListener('click', () => {
  state.settings.panelExpanded = !state.settings.panelExpanded;
  saveSettings();
  applyPanelState();
});

palettePresetInput.addEventListener('change', () => {
  const preset = palettePresetInput.value;
  if (preset !== 'custom' && presets[preset]) {
    paletteInput.value = presets[preset].join(', ');
    renderPalettePreview(presets[preset]);
  }
});

paletteInput.addEventListener('input', () => {
  const palette = parsePalette(paletteInput.value);
  palettePresetInput.value = detectPreset(palette);
  renderPalettePreview(palette);
});

flashIntensityInput.addEventListener('input', () => {
  flashIntensityValue.textContent = `${flashIntensityInput.value}%`;
});

flashOverlay.addEventListener('animationend', () => {
  flashOverlay.classList.remove('is-active');
});

settingsForm.addEventListener('submit', (event) => {
  const action = event.submitter?.value ?? 'cancel';
  if (action !== 'save') return;

  event.preventDefault();
  const palette = parsePalette(paletteInput.value);
  if (!palette.length) {
    paletteInput.setCustomValidity('Añade al menos un color.');
    paletteInput.reportValidity();
    return;
  }

  paletteInput.setCustomValidity('');
  state.settings = {
    ...state.settings,
    totalMinutes: Number(totalMinutesInput.value),
    intervalMinutes: Number(intervalMinutesInput.value),
    palette,
    preset: palettePresetInput.value === 'custom' ? detectPreset(palette) : palettePresetInput.value,
    vibrationEnabled: vibrationEnabledInput.checked,
    flashIntensity: Number(flashIntensityInput.value),
  };
  saveSettings();
  if (!state.running && !state.paused) state.elapsedMs = 0;
  updateDeviceStatus('Ajustes guardados.');
  updateUI();
  modal.close();
});

playButton.addEventListener('click', startSession);
pauseButton.addEventListener('click', togglePause);
stopButton.addEventListener('click', stopSession);
window.addEventListener('resize', resizeCanvas);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (state.running || state.paused)) requestWakeLock();
});
document.addEventListener('touchstart', preventTouchZoom, { passive: false });
document.addEventListener('touchmove', preventTouchZoom, { passive: false });
document.addEventListener('gesturestart', preventGestureZoom);
document.addEventListener('gesturechange', preventGestureZoom);
document.addEventListener('dblclick', (event) => event.preventDefault(), { passive: false });

syncForm();
resizeCanvas();
updateUI();
