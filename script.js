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
};

const canvas = document.querySelector('#ambient-canvas');
const ctx = canvas.getContext('2d');
const app = document.querySelector('#app');
const settingsButton = document.querySelector('#settings-button');
const modal = document.querySelector('#settings-modal');
const settingsForm = document.querySelector('#settings-form');
const totalMinutesInput = document.querySelector('#total-minutes');
const intervalMinutesInput = document.querySelector('#interval-minutes');
const palettePresetInput = document.querySelector('#palette-preset');
const paletteInput = document.querySelector('#palette-input');
const palettePreviewTrack = document.querySelector('#palette-preview-track');
const playButton = document.querySelector('#play-button');
const pauseButton = document.querySelector('#pause-button');
const stopButton = document.querySelector('#stop-button');
const secondaryControls = document.querySelector('#secondary-controls');
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
  renderPalettePreview(state.settings.palette);
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
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
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

function preventTouchZoom(event) {
  if (event.touches?.length > 1) {
    event.preventDefault();
  }
}

function preventGestureZoom(event) {
  event.preventDefault();
}

function updateUI() {
  const totalMs = getSessionDurationMs();
  const { nextChangeInMs } = getColorState(state.elapsedMs);

  elapsedTime.textContent = formatTime(state.elapsedMs);
  remainingTime.textContent = formatTime(totalMs - state.elapsedMs);
  intervalTime.textContent = formatTime(getIntervalDurationMs());
  nextChangeTime.textContent = formatTime(nextChangeInMs);
  currentPhase.textContent = getPhaseLabel();
  drawBackground(state.elapsedMs);

  if (state.running || state.paused) {
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

  if (state.elapsedMs >= getSessionDurationMs()) {
    state.elapsedMs = getSessionDurationMs();
    finishSession();
    return;
  }

  updateUI();
}

async function startSession() {
  if (state.running && !state.paused) return;
  if (state.elapsedMs >= getSessionDurationMs()) {
    state.elapsedMs = 0;
  }
  state.running = true;
  state.paused = false;
  state.lastFrameAt = null;
  await requestFullscreen();
  await requestWakeLock();
  if (!state.timerId) {
    state.timerId = window.setInterval(() => tick(performance.now()), 100);
  }
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
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
  releaseWakeLock();
  updateDeviceStatus('Sesión detenida.');
  updateUI();
}

settingsButton.addEventListener('click', () => {
  syncForm();
  modal.showModal();
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
    totalMinutes: Number(totalMinutesInput.value),
    intervalMinutes: Number(intervalMinutesInput.value),
    palette,
    preset: palettePresetInput.value === 'custom' ? detectPreset(palette) : palettePresetInput.value,
  };
  saveSettings();
  if (!state.running && !state.paused) {
    state.elapsedMs = 0;
  }
  updateDeviceStatus('Ajustes guardados.');
  updateUI();
  modal.close();
});

playButton.addEventListener('click', startSession);
pauseButton.addEventListener('click', togglePause);
stopButton.addEventListener('click', stopSession);
window.addEventListener('resize', resizeCanvas);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (state.running || state.paused)) {
    requestWakeLock();
  }
});
document.addEventListener('touchstart', preventTouchZoom, { passive: false });
document.addEventListener('touchmove', preventTouchZoom, { passive: false });
document.addEventListener('gesturestart', preventGestureZoom);
document.addEventListener('gesturechange', preventGestureZoom);
document.addEventListener('dblclick', (event) => event.preventDefault(), { passive: false });

syncForm();
resizeCanvas();
updateUI();
