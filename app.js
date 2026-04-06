const FIELD = {
  width: 110,
  height: 68,
  goalWidth: 20,
  playerRadius: 2,
  ballRadius: 1,
  pxPerMeter: 10,
};

const INPUT_SIZE = 31;
const OUTPUT_SIZE = 2;
const SENSOR_COUNT = 8;
const MAX_SIGHT = 130;
const MAX_PLAYER_SPEED = 12;
const STEP_DT = 0.08;
const FAST_STEPS = 24;
const ULTRA_STEPS = 120;
const SLOW_STEPS = 1;
const BALL_TRAIL_SPEED_THRESHOLD = 1.1;
const MATCH_RATE_WINDOW_MS = 10000;
const MAX_TOURNAMENT_GAMES = 500;
const FITNESS_SETTINGS_DEFAULTS = {
  goalReward: 1,
  concededPenalty: 0,
  ownGoalPenalty: -0.01,
};
const CROSSOVER_RATE_DEFAULT = 0;
const MUTATION_SETTINGS_DEFAULTS = {
  rate: 0.01,
  amount: 0.28,
};
const NETWORK_VIZ_MAX_HIDDEN_NODES = 100;
const DEFAULT_NETWORK_VIZ_HISTORY_DEPTH = 30;
const NETWORK_VIZ_HISTORY_LIMIT = 100;
const NETWORK_VIZ_EPSILON = 1e-6;
const NETWORK_VIZ_INPUT_GROUPS = [
  { key: "teammates", label: "Свои", size: 8 },
  { key: "opponents", label: "Чужие", size: 8 },
  { key: "ball", label: "Мяч", size: 2 },
  { key: "boundary", label: "Бордюр", size: 8 },
  { key: "ownGoal", label: "Свои ворота", size: 2 },
  { key: "oppGoal", label: "Чужие ворота", size: 2 },
  { key: "time", label: "Время", size: 1 },
];
const HARD_COLLISION_THRESHOLD = 1.5;
const MAX_LOG_ENTRIES = 1000;
const FITNESS_BREAKDOWN_ROWS = [
  { key: "goals", label: "Гол сопернику" },
  { key: "conceded", label: "Пропущенный гол" },
  { key: "ownGoal", label: "Автогол" },
  { key: "total", label: "Итого", total: true },
];
const APP_ASSET_VERSION = "2026-04-06-1";
const SETTINGS_STORAGE_KEY = "flower-3.settings.v1";
const AUTOSAVE_STORAGE_KEY = "flower-3.autosave.v1";
const MAX_AUTOSAVE_HOURS = 168;
const MIN_AUTOSAVE_INTERVAL_MS = 60 * 1000;

const TEAM_COLORS = {
  A: "#61a8ff",
  B: "#ff8d6b",
};

const ui = {
  appShell: document.getElementById("appShell"),
  sidebarToggle: document.getElementById("sidebarToggle"),
  canvas: document.getElementById("pitch"),
  pitchStage: document.getElementById("pitchStage"),
  generationFlowPanel: document.getElementById("generationFlowPanel"),
  generationFlowScroll: document.getElementById("generationFlowScroll"),
  generationFlowCanvas: document.getElementById("generationFlowCanvas"),
  generationFlowStatus: document.getElementById("generationFlowStatus"),
  networkVizPanel: document.getElementById("networkVizPanel"),
  networkVizCanvas: document.getElementById("networkVizCanvas"),
  networkVizStatus: document.getElementById("networkVizStatus"),
  networkVizOlderBtn: document.getElementById("networkVizOlderBtn"),
  networkVizNewerBtn: document.getElementById("networkVizNewerBtn"),
  networkVizStepInfo: document.getElementById("networkVizStepInfo"),
  teamSize: document.getElementById("teamSize"),
  hiddenLayers: document.getElementById("hiddenLayers"),
  neuronsPerLayer: document.getElementById("neuronsPerLayer"),
  populationSize: document.getElementById("populationSize"),
  tournamentGames: document.getElementById("tournamentGames"),
  matchMinutes: document.getElementById("matchMinutes"),
  goalWidth: document.getElementById("goalWidth"),
  speedMultiplier: document.getElementById("speedMultiplier"),
  crossoverRate: document.getElementById("crossoverRate"),
  mutationRate: document.getElementById("mutationRate"),
  mutationAmount: document.getElementById("mutationAmount"),
  networkVizHistoryDepth: document.getElementById("networkVizHistoryDepth"),
  autoSaveHours: document.getElementById("autoSaveHours"),
  fitnessGoal: document.getElementById("fitnessGoal"),
  fitnessConceded: document.getElementById("fitnessConceded"),
  fitnessOwnGoal: document.getElementById("fitnessOwnGoal"),
  startBtn: document.getElementById("startBtn"),
  loadBtn: document.getElementById("loadBtn"),
  saveFileBtn: document.getElementById("saveFileBtn"),
  loadFileBtn: document.getElementById("loadFileBtn"),
  loadFileInput: document.getElementById("loadFileInput"),
  slowBtn: document.getElementById("slowBtn"),
  fastBtn: document.getElementById("fastBtn"),
  ultraBtn: document.getElementById("ultraBtn"),
  maxBtn: document.getElementById("maxBtn"),
  showBtn: document.getElementById("showBtn"),
  hideBtn: document.getElementById("hideBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  skipBtn: document.getElementById("skipBtn"),
  showTimeToggle: document.getElementById("showTimeToggle"),
  showFieldStripesToggle: document.getElementById("showFieldStripesToggle"),
  fitnessPanels: document.getElementById("fitnessPanels"),
  fitnessHeaderA: document.getElementById("fitnessHeaderA"),
  fitnessHeaderB: document.getElementById("fitnessHeaderB"),
  fitnessTableCombined: document.getElementById("fitnessTableCombined"),
  generation: document.getElementById("generation"),
  matchInfo: document.getElementById("matchInfo"),
  gamesPerSecond: document.getElementById("gamesPerSecond"),
  bestFitness: document.getElementById("bestFitness"),
  modeInfo: document.getElementById("modeInfo"),
  renderInfo: document.getElementById("renderInfo"),
  saveStatus: document.getElementById("saveStatus"),
  log: document.getElementById("log"),
};

const preferSafeMainThreadRenderer = typeof navigator !== "undefined"
  && /Linux/i.test([navigator.userAgent || "", navigator.platform || ""].join(" "));
const supportsOffscreenCanvas = !preferSafeMainThreadRenderer && typeof ui.canvas.transferControlToOffscreen === "function";
let ctx = supportsOffscreenCanvas ? null : ui.canvas.getContext("2d");
let generationFlowCtx = ui.generationFlowCanvas?.getContext("2d");
let networkVizCtx = ui.networkVizCanvas?.getContext("2d");

const state = {
  showGames: true,
  stepsPerFrame: FAST_STEPS,
  speedPreset: "fast",
  speedMultiplier: 0.25,
  useMaxSpeed: false,
  mode: "Быстрый",
  trainer: null,
  worker: null,
  workerStatus: null,
  previousWorkerStatus: null,
  workerStatusAt: 0,
  previousWorkerStatusAt: 0,
  workerSnapshotInterval: 33,
  workerSaveData: null,
  pendingSaveRequest: null,
  lastFrameTime: null,
  pitchWidth: 550,
  pitchResize: null,
  savedPopulationData: null,
  sidebarCollapsed: true,
  isPaused: false,
  showTimeIndicator: true,
  showFieldStripes: true,
  useWorkerRenderer: supportsOffscreenCanvas,
  offscreenTransferred: false,
  generationTimeline: [],
  generationFlowHitboxes: [],
  generationFlowVersionRendered: null,
  generationFlowRenderWidth: 0,
  generationFlowRenderHeight: 0,
  selectedVisualizationGeneration: null,
  selectedVisualizationIndividualId: null,
  networkVizData: null,
  networkVizVersionRendered: null,
  networkVizRenderWidth: 0,
  networkVizRenderHeight: 0,
  networkVizHistoryDepth: DEFAULT_NETWORK_VIZ_HISTORY_DEPTH,
  networkVizHistoryOffset: 0,
  autoSaveHours: 0,
  autoSaveTimerId: null,
  autoSaveInProgress: false,
  lastAutoSaveAt: 0,
};

let nextIndividualId = 0;
let rngSeed = 1;

function setRandomSeed(seed = Date.now()) {
  rngSeed = (Math.floor(seed) >>> 0) || 1;
  return rngSeed;
}

function random() {
  rngSeed += 0x6D2B79F5;
  let t = rngSeed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const initialRandomSeed = setRandomSeed(Date.now());

const logs = [];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function randRange(min, max) {
  return min + random() * (max - min);
}

function normalizeAngle(angle) {
  while (angle <= -Math.PI) angle += Math.PI * 2;
  while (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function addLog(_message) {
}

function clearLogs() {
  logs.length = 0;
}

function normalizeAutoSaveHours(value) {
  const normalized = toFiniteNumber(value, 0);
  return clamp(Math.round(normalized * 100) / 100, 0, MAX_AUTOSAVE_HOURS);
}

function formatAutoSaveHours(value) {
  const normalized = normalizeAutoSaveHours(value);
  return Number.isInteger(normalized)
    ? String(normalized)
    : normalized.toFixed(2).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function saveAutoSaveToLocalStorage(payload) {
  if (typeof localStorage === "undefined" || !payload?.population?.length) {
    return false;
  }

  try {
    localStorage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.warn("Не удалось сохранить автосохранение в localStorage:", error);
    return false;
  }
}

function scheduleAutoSave() {
  if (state.autoSaveTimerId) {
    clearTimeout(state.autoSaveTimerId);
    state.autoSaveTimerId = null;
  }

  const hours = normalizeAutoSaveHours(state.autoSaveHours);
  if (hours <= 0) {
    updateSaveStatus();
    return;
  }

  const intervalMs = Math.max(MIN_AUTOSAVE_INTERVAL_MS, Math.round(hours * 60 * 60 * 1000));
  state.autoSaveTimerId = window.setTimeout(() => {
    void runAutoSave();
  }, intervalMs);
  updateSaveStatus();
}

async function runAutoSave() {
  if (state.autoSaveInProgress) {
    return false;
  }

  state.autoSaveInProgress = true;
  try {
    const payload = await requestLatestSaveData(2500);
    if (!payload?.population?.length) {
      return false;
    }

    const savedToBrowser = saveAutoSaveToLocalStorage(payload);
    const fileName = exportPopulationToFile(payload);
    if (fileName || savedToBrowser) {
      state.lastAutoSaveAt = Date.now();
      updateSaveStatus(payload);
      return true;
    }
  } catch (error) {
    console.error("Не удалось выполнить автосохранение:", error);
  } finally {
    state.autoSaveInProgress = false;
    scheduleAutoSave();
  }

  return false;
}

function applyAutoSaveSettings(hours, options = {}) {
  const normalized = normalizeAutoSaveHours(hours);
  state.autoSaveHours = normalized;

  if (ui.autoSaveHours) {
    ui.autoSaveHours.value = formatAutoSaveHours(normalized);
  }

  if (options.notifyWorker && state.worker) {
    postToWorker("updateConfig", { autoSaveHours: normalized });
  }

  if (options.persist) {
    saveSettingsToLocalStorage();
    savePopulation();
  }

  scheduleAutoSave();
  return normalized;
}

function saveSettingsToLocalStorage(config = readConfig()) {
  if (typeof localStorage === "undefined") {
    return false;
  }

  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch (error) {
    console.warn("Не удалось сохранить настройки в localStorage:", error);
    return false;
  }
}

function loadSettingsFromLocalStorage() {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.warn("Не удалось загрузить настройки из localStorage:", error);
    return null;
  }
}

function postToWorker(type, payload = {}) {
  state.worker?.postMessage({ type, payload });
}

function handleWorkerMessage(event) {
  const { type, payload, message } = event.data || {};

  if (type === "ready") {
    postToWorker("setStepsPerFrame", {
      stepsPerFrame: state.stepsPerFrame,
      useMaxSpeed: state.useMaxSpeed,
    });
    postToWorker("setPaused", { isPaused: state.isPaused });
    postToWorker("updateConfig", {
      showGames: state.showGames,
      showTimeIndicator: state.showTimeIndicator,
      showFieldStripes: state.showFieldStripes,
      speedPreset: state.speedPreset,
      speedMultiplier: state.speedMultiplier,
      useMaxSpeed: state.useMaxSpeed,
      networkVizHistoryOffset: state.networkVizHistoryOffset,
    });
    return;
  }

  if (type === "status") {
    const snapshotAt = Number.isFinite(payload?.snapshotAt) ? payload.snapshotAt : performance.now();

    if (state.workerStatus) {
      state.previousWorkerStatus = state.workerStatus;
      state.previousWorkerStatusAt = state.workerStatusAt || snapshotAt;
      const snapshotInterval = snapshotAt - state.previousWorkerStatusAt;
      if (Number.isFinite(snapshotInterval) && snapshotInterval > 0) {
        state.workerSnapshotInterval = clamp(snapshotInterval, 16, 120);
      }
    } else {
      state.previousWorkerStatus = null;
      state.previousWorkerStatusAt = 0;
    }

    state.workerStatus = payload || null;
    state.workerStatusAt = snapshotAt;
    if (!state.generationTimeline.length && payload?.networkViz) {
      state.networkVizData = selectNetworkVizHistoryEntry(payload.networkViz, state.networkVizHistoryOffset);
      state.networkVizVersionRendered = null;
      updateNetworkVizNavigation(state.networkVizData);
    }
    if (typeof payload?.isPaused === "boolean") {
      state.isPaused = payload.isPaused;
    }
    return;
  }

  if (type === "saveData") {
    state.workerSaveData = payload || null;
    savePopulation(payload);
    applyVisualizationPayload(payload);

    if (state.pendingSaveRequest) {
      const { resolve, timeoutId } = state.pendingSaveRequest;
      clearTimeout(timeoutId);
      state.pendingSaveRequest = null;
      resolve(state.workerSaveData);
    }
    return;
  }

  if (type === "log" && message) {
    addLog(message);
    return;
  }

  if (type === "error") {
    console.error("Worker error:", message);
    addLog(`Ошибка Worker: ${message}`);
  }
}

function ensureWorker() {
  if (state.worker) {
    return state.worker;
  }

  const worker = new Worker(new URL(`./worker.js?v=${APP_ASSET_VERSION}`, import.meta.url), { type: "module" });
  worker.addEventListener("message", handleWorkerMessage);
  worker.addEventListener("error", (event) => {
    console.error("Не удалось запустить Worker:", event);
    addLog("Ошибка запуска Worker. Симуляция не была перенесена в фоновый поток.");
  });

  if (state.useWorkerRenderer && !state.offscreenTransferred) {
    try {
      const offscreenCanvas = ui.canvas.transferControlToOffscreen();
      worker.postMessage(
        {
          type: "initCanvas",
          canvas: offscreenCanvas,
          payload: {
            width: ui.canvas.width,
            height: ui.canvas.height,
          },
        },
        [offscreenCanvas],
      );
      state.offscreenTransferred = true;
    } catch (error) {
      console.error("OffscreenCanvas init failed:", error);
      state.useWorkerRenderer = false;
      if (!ctx) {
        ctx = ui.canvas.getContext("2d");
      }
      addLog("OffscreenCanvas недоступен — используется обычная отрисовка.");
    }
  } else if (!state.useWorkerRenderer && !ctx) {
    ctx = ui.canvas.getContext("2d");
  }

  state.worker = worker;
  return worker;
}

function canInterpolateMatchStates(previousMatch, currentMatch) {
  if (!previousMatch || !currentMatch || !previousMatch.ball || !currentMatch.ball) {
    return false;
  }

  if (!Array.isArray(previousMatch.players) || !Array.isArray(currentMatch.players)) {
    return false;
  }

  const previousA = previousMatch.individualAId ?? null;
  const previousB = previousMatch.individualBId ?? null;
  const currentA = currentMatch.individualAId ?? null;
  const currentB = currentMatch.individualBId ?? null;

  return previousA === currentA
    && previousB === currentB
    && previousMatch.players.length === currentMatch.players.length
    && previousMatch.score?.A === currentMatch.score?.A
    && previousMatch.score?.B === currentMatch.score?.B
    && Boolean(previousMatch.done) === Boolean(currentMatch.done);
}

function interpolateMatchState(previousMatch, currentMatch, alpha) {
  if (!canInterpolateMatchStates(previousMatch, currentMatch)) {
    return currentMatch;
  }

  const t = clamp(alpha, 0, 1);
  return {
    ...currentMatch,
    time: lerp(Number(previousMatch.time) || 0, Number(currentMatch.time) || 0, t),
    ball: {
      ...currentMatch.ball,
      x: lerp(Number(previousMatch.ball?.x) || 0, Number(currentMatch.ball?.x) || 0, t),
      y: lerp(Number(previousMatch.ball?.y) || 0, Number(currentMatch.ball?.y) || 0, t),
      vx: lerp(Number(previousMatch.ball?.vx) || 0, Number(currentMatch.ball?.vx) || 0, t),
      vy: lerp(Number(previousMatch.ball?.vy) || 0, Number(currentMatch.ball?.vy) || 0, t),
    },
    players: currentMatch.players.map((player, index) => {
      const previousPlayer = previousMatch.players?.[index] || player;
      const previousDir = Number(previousPlayer.dir) || 0;
      const currentDir = Number(player.dir) || 0;
      return {
        ...player,
        x: lerp(Number(previousPlayer.x) || 0, Number(player.x) || 0, t),
        y: lerp(Number(previousPlayer.y) || 0, Number(player.y) || 0, t),
        dir: normalizeAngle(previousDir + normalizeAngle(currentDir - previousDir) * t),
      };
    }),
  };
}

function getRenderedMatch(frameTime = performance.now()) {
  if (state.useWorkerRenderer || !state.showGames) {
    return null;
  }

  const currentMatch = state.workerStatus?.currentMatch || null;
  if (!currentMatch?.ball || !Array.isArray(currentMatch.players)) {
    return null;
  }

  const previousMatch = state.previousWorkerStatus?.currentMatch || null;
  if (!canInterpolateMatchStates(previousMatch, currentMatch)) {
    return currentMatch;
  }

  const interval = Math.max(16, state.workerSnapshotInterval || 33);
  const elapsedSinceSnapshot = Math.max(0, frameTime - state.workerStatusAt);
  const alpha = clamp(elapsedSinceSnapshot / interval, 0, 1);
  return interpolateMatchState(previousMatch, currentMatch, alpha);
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function readNumberInput(element, fallback) {
  return toFiniteNumber(element.value, fallback);
}

function normalizeSpeedMultiplier(value) {
  return clamp(toFiniteNumber(value, 1), 0.25, 100);
}

function normalizeGoalWidth(value) {
  return clamp(Math.round(toFiniteNumber(value, FIELD.goalWidth)), 6, 40);
}

function normalizeTournamentGames(value, populationSize = 12) {
  const fallback = clamp(Math.round(toFiniteNumber(populationSize, 12)) - 1, 1, MAX_TOURNAMENT_GAMES);
  return clamp(Math.round(toFiniteNumber(value, fallback)), 1, MAX_TOURNAMENT_GAMES);
}

function ensureTournamentSchedule(schedule, populationSize, minimumGamesPerIndividual) {
  const size = Math.max(0, Math.floor(Number(populationSize) || 0));
  if (size < 2) {
    return [];
  }

  const targetGames = normalizeTournamentGames(minimumGamesPerIndividual, size);
  const allPairs = [];
  for (let indexA = 0; indexA < size; indexA += 1) {
    for (let indexB = indexA + 1; indexB < size; indexB += 1) {
      allPairs.push([indexA, indexB]);
    }
  }

  const normalizedSchedule = Array.isArray(schedule)
    ? schedule
        .filter((pair) => Array.isArray(pair) && pair.length === 2)
        .map(([indexA, indexB]) => [
          clamp(Math.floor(Number(indexA) || 0), 0, size - 1),
          clamp(Math.floor(Number(indexB) || 0), 0, size - 1),
        ])
        .filter(([indexA, indexB]) => indexA !== indexB)
        .map(([indexA, indexB]) => (indexA < indexB ? [indexA, indexB] : [indexB, indexA]))
    : [];

  const extendedSchedule = [...normalizedSchedule];
  const gamesPerIndividual = new Array(size).fill(0);
  for (const [indexA, indexB] of extendedSchedule) {
    gamesPerIndividual[indexA] += 1;
    gamesPerIndividual[indexB] += 1;
  }

  while (gamesPerIndividual.some((games) => games < targetGames)) {
    let addedInPass = false;
    for (const [indexA, indexB] of shuffle(allPairs)) {
      if (gamesPerIndividual[indexA] >= targetGames && gamesPerIndividual[indexB] >= targetGames) {
        continue;
      }

      extendedSchedule.push([indexA, indexB]);
      gamesPerIndividual[indexA] += 1;
      gamesPerIndividual[indexB] += 1;
      addedInPass = true;

      if (gamesPerIndividual.every((games) => games >= targetGames)) {
        break;
      }
    }

    if (!addedInPass) {
      break;
    }
  }

  return extendedSchedule;
}

function buildTournamentSchedule(populationSize, minimumGamesPerIndividual) {
  return ensureTournamentSchedule([], populationSize, minimumGamesPerIndividual);
}

function getBaseStepsForPreset(preset) {
  if (preset === "slow") return SLOW_STEPS;
  if (preset === "ultra") return ULTRA_STEPS;
  return FAST_STEPS;
}

function formatMultiplier(multiplier) {
  const value = normalizeSpeedMultiplier(multiplier);
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function applySpeedState(options = {}) {
  const requestedPreset = options.preset ?? state.speedPreset ?? "fast";
  const normalizedPreset = requestedPreset === "max" ? "fast" : requestedPreset;
  const multiplier = normalizeSpeedMultiplier(options.multiplier ?? state.speedMultiplier ?? 1);
  const useMaxSpeed = Boolean(options.useMaxSpeed ?? state.useMaxSpeed);
  const effectiveMultiplier = useMaxSpeed ? 1 : multiplier;
  const shouldNotifyWorker = options.notifyWorker ?? Boolean(state.worker);
  const shouldPersist = options.persist ?? false;

  state.speedPreset = useMaxSpeed ? "max" : normalizedPreset;
  state.speedMultiplier = multiplier;
  state.useMaxSpeed = useMaxSpeed;
  state.stepsPerFrame = Math.max(1, Math.round(getBaseStepsForPreset(normalizedPreset) * effectiveMultiplier));
  state.mode = useMaxSpeed
    ? "Max"
    : `${normalizedPreset === "slow" ? "Медленный" : normalizedPreset === "ultra" ? "Ультра-быстрый" : "Быстрый"}${multiplier !== 1 ? ` ×${formatMultiplier(multiplier)}` : ""}`;

  ui.speedMultiplier.value = formatMultiplier(multiplier);

  if (shouldNotifyWorker) {
    postToWorker("setStepsPerFrame", {
      stepsPerFrame: state.stepsPerFrame,
      useMaxSpeed: state.useMaxSpeed,
    });
    postToWorker("updateConfig", {
      speedPreset: state.speedPreset,
      speedMultiplier: state.speedMultiplier,
      useMaxSpeed: state.useMaxSpeed,
    });
  }

  if (shouldPersist) {
    saveSettingsToLocalStorage();
    savePopulation();
  }
}

function normalizeFitnessSettings(settings = {}) {
  return {
    goalReward: toFiniteNumber(settings.goalReward, FITNESS_SETTINGS_DEFAULTS.goalReward),
    concededPenalty: toFiniteNumber(settings.concededPenalty, FITNESS_SETTINGS_DEFAULTS.concededPenalty),
    ownGoalPenalty: toFiniteNumber(settings.ownGoalPenalty, FITNESS_SETTINGS_DEFAULTS.ownGoalPenalty),
  };
}

function normalizeCrossoverRate(value) {
  return clamp(toFiniteNumber(value, CROSSOVER_RATE_DEFAULT), 0, 1);
}

function normalizeMutationSettings(settings = {}) {
  return {
    rate: clamp(toFiniteNumber(settings.rate, MUTATION_SETTINGS_DEFAULTS.rate), 0, 1),
    amount: clamp(toFiniteNumber(settings.amount, MUTATION_SETTINGS_DEFAULTS.amount), 0, 2),
  };
}

function normalizeNetworkVizHistoryDepth(value) {
  return clamp(Math.round(toFiniteNumber(value, DEFAULT_NETWORK_VIZ_HISTORY_DEPTH)), 1, NETWORK_VIZ_HISTORY_LIMIT);
}

function normalizeNetworkVizHistoryOffset(value, maxOffset = NETWORK_VIZ_HISTORY_LIMIT - 1) {
  return clamp(Math.round(toFiniteNumber(value, 0)), 0, Math.max(0, Math.floor(maxOffset)));
}

function trimVisualizationHistory(history = [], historyDepth = DEFAULT_NETWORK_VIZ_HISTORY_DEPTH) {
  const normalizedDepth = normalizeNetworkVizHistoryDepth(historyDepth);
  return normalizeVisualizationHistory(history).slice(0, normalizedDepth);
}

function trimGenerationTimeline(timeline = [], historyDepth = DEFAULT_NETWORK_VIZ_HISTORY_DEPTH) {
  const normalizedDepth = normalizeNetworkVizHistoryDepth(historyDepth);
  const normalizedTimeline = normalizeGenerationTimeline(timeline);
  return normalizedTimeline.slice(Math.max(0, normalizedTimeline.length - normalizedDepth));
}

function trimVisualizationState(visualization = null, historyDepth = DEFAULT_NETWORK_VIZ_HISTORY_DEPTH) {
  if (!visualization || typeof visualization !== "object") {
    return null;
  }

  return {
    ...visualization,
    history: trimVisualizationHistory(visualization.history, historyDepth),
    generationTimeline: trimGenerationTimeline(visualization.generationTimeline, historyDepth),
  };
}

function readFitnessSettings() {
  return normalizeFitnessSettings({
    goalReward: readNumberInput(ui.fitnessGoal, FITNESS_SETTINGS_DEFAULTS.goalReward),
    concededPenalty: readNumberInput(ui.fitnessConceded, FITNESS_SETTINGS_DEFAULTS.concededPenalty),
    ownGoalPenalty: readNumberInput(ui.fitnessOwnGoal, FITNESS_SETTINGS_DEFAULTS.ownGoalPenalty),
  });
}

function readMutationSettings() {
  return normalizeMutationSettings({
    rate: readNumberInput(ui.mutationRate, MUTATION_SETTINGS_DEFAULTS.rate),
    amount: readNumberInput(ui.mutationAmount, MUTATION_SETTINGS_DEFAULTS.amount),
  });
}

function applyLiveFitnessSettings() {
  const fitnessSettings = readFitnessSettings();

  postToWorker("updateFitnessSettings", { fitnessSettings });

  const saveSource = state.workerSaveData || state.savedPopulationData;
  if (saveSource?.config) {
    saveSource.config.fitnessSettings = fitnessSettings;
    savePopulation(saveSource);
  }

  saveSettingsToLocalStorage();
  return fitnessSettings;
}

function applyLiveCrossoverSettings() {
  const crossoverRate = normalizeCrossoverRate(ui.crossoverRate?.value);
  if (ui.crossoverRate) {
    ui.crossoverRate.value = crossoverRate.toFixed(2);
  }

  postToWorker("updateConfig", { crossoverRate });

  if (state.trainer?.config) {
    state.trainer.config.crossoverRate = crossoverRate;
  }

  const saveSource = state.workerSaveData || state.savedPopulationData;
  if (saveSource?.config) {
    saveSource.config.crossoverRate = crossoverRate;
    savePopulation(saveSource);
  }

  saveSettingsToLocalStorage();
  return crossoverRate;
}

function applyLiveMutationSettings() {
  const mutationSettings = readMutationSettings();
  ui.mutationRate.value = mutationSettings.rate.toFixed(2);
  ui.mutationAmount.value = mutationSettings.amount.toFixed(2);

  postToWorker("updateConfig", { mutationSettings });

  if (state.trainer?.config) {
    state.trainer.config.mutationSettings = mutationSettings;
  }

  const saveSource = state.workerSaveData || state.savedPopulationData;
  if (saveSource?.config) {
    saveSource.config.mutationSettings = mutationSettings;
    savePopulation(saveSource);
  }

  saveSettingsToLocalStorage();
  return mutationSettings;
}

function applyLiveNetworkVizSettings() {
  return 1;
}

function selectNetworkVizHistoryEntry(data, offset = 0) {
  if (!data) {
    return null;
  }

  const historyEntries = normalizeVisualizationHistory(data.historyEntries);
  const maxOffset = Math.max(0, historyEntries.length - 1);
  const activeHistoryIndex = normalizeNetworkVizHistoryOffset(offset, maxOffset);
  const rootSnapshot = deserializeNetworkSnapshot(data.rootSnapshot);
  const hasSnapshotHistory = historyEntries.some((entry) => entry?.snapshot?.network);

  if (hasSnapshotHistory || rootSnapshot?.network) {
    return createNetworkVisualizationData(
      rootSnapshot || historyEntries[0]?.snapshot || null,
      historyEntries,
      Number(data.version) || 0,
      activeHistoryIndex,
    );
  }

  const activeHistoryEntry = historyEntries[activeHistoryIndex] || null;
  return {
    ...data,
    historyEntries: historyEntries.map((entry) => ({
      generation: entry.generation,
      changedConnections: [...entry.changedConnections],
    })),
    availableHistory: historyEntries.length,
    activeHistoryIndex,
    activeHistoryGeneration: activeHistoryEntry?.generation ?? data.activeHistoryGeneration ?? null,
    activeChangedCount: activeHistoryEntry?.changedConnections?.length || data.activeChangedCount || 0,
  };
}

function updateNetworkVizNavigation(data = state.networkVizData) {
  const total = Math.max(0, Math.floor(Number(data?.availableHistory) || 0));
  const maxOffset = Math.max(0, total - 1);
  state.networkVizHistoryOffset = normalizeNetworkVizHistoryOffset(state.networkVizHistoryOffset, maxOffset);

  if (ui.networkVizOlderBtn) {
    ui.networkVizOlderBtn.disabled = total <= 1 || state.networkVizHistoryOffset >= maxOffset;
  }
  if (ui.networkVizNewerBtn) {
    ui.networkVizNewerBtn.disabled = total <= 1 || state.networkVizHistoryOffset <= 0;
  }
  if (ui.networkVizStepInfo) {
    ui.networkVizStepInfo.textContent = total > 0 ? `${state.networkVizHistoryOffset + 1}/${total}` : "0/0";
  }
}

function setNetworkVizHistoryOffset(offset, options = {}) {
  const shouldNotifyWorker = options.notifyWorker !== false;
  const total = Math.max(0, Math.floor(Number(state.networkVizData?.availableHistory) || 0));
  const maxOffset = Math.max(0, total - 1);
  const normalized = normalizeNetworkVizHistoryOffset(offset, total > 0 ? maxOffset : 0);

  state.networkVizHistoryOffset = normalized;

  if (state.trainer?.updateNetworkVizHistoryOffset) {
    state.trainer.updateNetworkVizHistoryOffset(normalized);
    if (!state.worker && state.trainer.getNetworkVisualizationData) {
      state.networkVizData = state.trainer.getNetworkVisualizationData();
    }
  }

  if (state.networkVizData && !state.worker) {
    state.networkVizData = selectNetworkVizHistoryEntry(state.networkVizData, normalized);
    state.networkVizVersionRendered = null;
    drawNetworkVisualization(state.networkVizData);
  } else {
    updateNetworkVizNavigation();
  }

  if (shouldNotifyWorker) {
    postToWorker("updateConfig", { networkVizHistoryOffset: normalized });
  }

  return normalized;
}

function findGenerationTimelineIndividual(generation, individualId, timeline = state.generationTimeline) {
  for (const entry of timeline) {
    if (entry.generation !== generation) {
      continue;
    }

    const individual = entry.individuals.find((candidate) => candidate.id === individualId);
    if (individual) {
      return individual;
    }
  }

  return null;
}

function getDefaultGenerationTimelineIndividual(timeline = state.generationTimeline) {
  const latestEntry = timeline[timeline.length - 1];
  return latestEntry?.individuals?.[0] || null;
}

function buildNetworkVisualizationForIndividual(individual) {
  if (!individual?.snapshot?.network) {
    return null;
  }

  const snapshot = {
    generation: individual.generation,
    id: individual.id,
    fitness: individual.fitness,
    network: individual.snapshot.network.clone(),
    parentIds: [...individual.parentIds],
    createdBy: individual.createdBy,
  };

  return createNetworkVisualizationData(
    snapshot,
    [{
      generation: individual.generation,
      changedConnections: [...individual.changedConnections],
      parentIds: [...individual.parentIds],
      createdBy: individual.createdBy,
      snapshot,
    }],
    Date.now(),
    0,
  );
}

function syncSelectedVisualizationFromTimeline(fallbackVisualization = null) {
  let selected = findGenerationTimelineIndividual(
    state.selectedVisualizationGeneration,
    state.selectedVisualizationIndividualId,
  );

  if (!selected) {
    selected = getDefaultGenerationTimelineIndividual();
  }

  if (selected) {
    state.selectedVisualizationGeneration = selected.generation;
    state.selectedVisualizationIndividualId = selected.id;
    state.networkVizData = buildNetworkVisualizationForIndividual(selected);
  } else if (fallbackVisualization) {
    try {
      const fallbackSnapshot = deserializeNetworkSnapshot(
        fallbackVisualization.generationLeader || fallbackVisualization.lineageBest,
      );
      state.networkVizData = fallbackSnapshot?.network
        ? createNetworkVisualizationData(
            fallbackSnapshot,
            trimVisualizationHistory(fallbackVisualization.history, state.networkVizHistoryDepth),
            Date.now(),
            0,
          )
        : null;
    } catch (error) {
      console.warn("Не удалось восстановить fallback-визуализацию нейросети:", error);
      state.networkVizData = null;
    }
  } else {
    state.networkVizData = null;
  }

  state.generationFlowVersionRendered = null;
  state.networkVizVersionRendered = null;
}

function applyVisualizationPayload(payload = state.workerSaveData || state.savedPopulationData) {
  const historyDepth = normalizeNetworkVizHistoryDepth(payload?.config?.networkVizHistoryDepth ?? state.networkVizHistoryDepth);
  const visualization = trimVisualizationState(payload?.visualization || null, historyDepth);

  state.networkVizHistoryDepth = historyDepth;
  if (ui.networkVizHistoryDepth) {
    ui.networkVizHistoryDepth.value = String(historyDepth);
  }

  state.generationTimeline = trimGenerationTimeline(visualization?.generationTimeline, historyDepth);
  syncSelectedVisualizationFromTimeline(visualization);
}

function selectGenerationTimelineIndividual(generation, individualId, options = {}) {
  const selected = findGenerationTimelineIndividual(generation, individualId) || getDefaultGenerationTimelineIndividual();
  if (!selected) {
    return null;
  }

  const changed = selected.generation !== state.selectedVisualizationGeneration
    || selected.id !== state.selectedVisualizationIndividualId;

  state.selectedVisualizationGeneration = selected.generation;
  state.selectedVisualizationIndividualId = selected.id;
  state.networkVizData = buildNetworkVisualizationForIndividual(selected);
  state.generationFlowVersionRendered = null;
  state.networkVizVersionRendered = null;
  drawGenerationFlow();
  drawNetworkVisualization(state.networkVizData);

  if (options.log && changed) {
    addLog(`Выбрана особь #${selected.id} из поколения G${selected.generation}.`);
  }

  return selected;
}

function drawGenerationFlow() {
  if (!ui.generationFlowCanvas || !generationFlowCtx) {
    return;
  }

  const timeline = Array.isArray(state.generationTimeline) ? state.generationTimeline : [];
  const visibleCount = timeline.length;
  const containerWidth = Math.max(360, Math.round(ui.generationFlowScroll?.clientWidth || ui.generationFlowPanel?.clientWidth || 1100));
  const cssHeight = 280;
  const circleRadius = 8;
  const columnStep = circleRadius * 8;
  const leftPadding = 34;
  const rightPadding = 40;
  const desiredCssWidth = Math.max(containerWidth, leftPadding + rightPadding + Math.max(0, visibleCount - 1) * columnStep + circleRadius * 4);

  ui.generationFlowCanvas.style.width = `${desiredCssWidth}px`;
  ui.generationFlowCanvas.style.height = `${cssHeight}px`;

  const { width, height, ratio } = resizeCanvasToDisplaySize(ui.generationFlowCanvas);
  const renderKey = `${timeline.length}:${timeline[timeline.length - 1]?.generation || 0}:${state.selectedVisualizationGeneration || 0}:${state.selectedVisualizationIndividualId || 0}`;
  if (
    renderKey === state.generationFlowVersionRendered
    && width === state.generationFlowRenderWidth
    && height === state.generationFlowRenderHeight
  ) {
    return;
  }

  state.generationFlowVersionRendered = renderKey;
  state.generationFlowRenderWidth = width;
  state.generationFlowRenderHeight = height;

  const viz = generationFlowCtx;
  viz.clearRect(0, 0, width, height);

  const background = viz.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, "rgba(8, 20, 30, 0.98)");
  background.addColorStop(1, "rgba(14, 28, 42, 1)");
  viz.fillStyle = background;
  viz.fillRect(0, 0, width, height);

  if (!timeline.length) {
    state.generationFlowHitboxes = [];
    if (ui.generationFlowStatus) {
      ui.generationFlowStatus.textContent = "История поколений начнёт заполняться после завершения первого поколения.";
    }
    viz.fillStyle = "rgba(255, 255, 255, 0.86)";
    viz.font = `${Math.max(16, Math.round(18 * ratio))}px Inter, sans-serif`;
    viz.textAlign = "center";
    viz.textBaseline = "middle";
    viz.fillText("История поколений пока пуста", width / 2, height / 2 - 10 * ratio);
    viz.fillStyle = "rgba(155, 180, 200, 0.8)";
    viz.font = `${Math.max(12, Math.round(13 * ratio))}px Inter, sans-serif`;
    viz.fillText("После завершения поколений здесь появятся столбики особей и стрелки переходов", width / 2, height / 2 + 16 * ratio);
    return;
  }

  const selected = findGenerationTimelineIndividual(
    state.selectedVisualizationGeneration,
    state.selectedVisualizationIndividualId,
    timeline,
  ) || getDefaultGenerationTimelineIndividual(timeline);

  if (selected && ui.generationFlowStatus) {
    const parentText = selected.parentIds.length > 0
      ? `родители: ${selected.parentIds.map((id) => `#${id}`).join(", ")}`
      : selected.createdBy === "initial"
        ? "стартовая особь"
        : "без родителей";
    const originText = selected.createdBy === "elite"
      ? "прямой перенос"
      : selected.createdBy === "initial"
        ? "исходная особь"
        : "мутант";
    ui.generationFlowStatus.textContent = `Поколений сохранено: ${timeline.length} · клик по кружку выбирает особь · сейчас #${selected.id} из G${selected.generation} · ${originText} · ${parentText}`;
  }

  const maxRows = Math.max(1, ...timeline.map((entry) => entry.individuals.length));
  const topPadding = 26;
  const bottomPadding = 44;
  const rowStart = topPadding + circleRadius;
  const rowSpan = Math.max(10, cssHeight - topPadding - bottomPadding - circleRadius * 2);
  const rowStep = maxRows > 1 ? rowSpan / (maxRows - 1) : 0;
  const xStart = leftPadding + circleRadius;
  const positions = new Map();
  const hitboxes = [];

  timeline.forEach((entry, generationIndex) => {
    const x = xStart + generationIndex * columnStep;

    entry.individuals.forEach((individual, rankIndex) => {
      const y = maxRows > 1 ? rowStart + rankIndex * rowStep : rowStart + rowSpan / 2;
      const key = `${entry.generation}:${individual.id}`;
      positions.set(key, { x, y, individual, generation: entry.generation, rankIndex });
      hitboxes.push({ generation: entry.generation, id: individual.id, x, y, radius: circleRadius * 1.6 });
    });
  });

  state.generationFlowHitboxes = hitboxes;

  viz.lineCap = "round";
  viz.lineJoin = "round";
  viz.strokeStyle = "rgba(126, 182, 230, 0.4)";
  viz.fillStyle = "rgba(126, 182, 230, 0.4)";
  viz.lineWidth = Math.max(1, 1.15 * ratio);

  for (let generationIndex = 0; generationIndex < timeline.length - 1; generationIndex += 1) {
    const currentEntry = timeline[generationIndex];
    const nextEntry = timeline[generationIndex + 1];

    for (const individual of nextEntry.individuals) {
      for (const parentId of individual.parentIds) {
        const from = positions.get(`${currentEntry.generation}:${parentId}`);
        const to = positions.get(`${nextEntry.generation}:${individual.id}`);
        if (!from || !to) {
          continue;
        }

        const startX = from.x + circleRadius * 0.9;
        const startY = from.y;
        const endX = to.x - circleRadius * 0.9;
        const endY = to.y;
        viz.beginPath();
        viz.moveTo(startX * ratio, startY * ratio);
        viz.lineTo(endX * ratio, endY * ratio);
        viz.stroke();

        const arrowSize = 5 * ratio;
        const angle = Math.atan2(endY - startY, endX - startX);
        viz.beginPath();
        viz.moveTo(endX * ratio, endY * ratio);
        viz.lineTo(
          endX * ratio - Math.cos(angle - Math.PI / 6) * arrowSize,
          endY * ratio - Math.sin(angle - Math.PI / 6) * arrowSize,
        );
        viz.lineTo(
          endX * ratio - Math.cos(angle + Math.PI / 6) * arrowSize,
          endY * ratio - Math.sin(angle + Math.PI / 6) * arrowSize,
        );
        viz.closePath();
        viz.fill();
      }
    }
  }

  viz.textAlign = "center";
  viz.textBaseline = "top";
  viz.font = `${Math.max(11, Math.round(12 * ratio))}px Inter, sans-serif`;

  timeline.forEach((entry, generationIndex) => {
    const x = xStart + generationIndex * columnStep;
    viz.fillStyle = "rgba(168, 188, 205, 0.92)";
    viz.fillText(`G${entry.generation}`, x * ratio, (cssHeight - 24) * ratio);

    entry.individuals.forEach((individual, rankIndex) => {
      const y = maxRows > 1 ? rowStart + rankIndex * rowStep : rowStart + rowSpan / 2;
      const isSelected = individual.generation === state.selectedVisualizationGeneration
        && individual.id === state.selectedVisualizationIndividualId;
      const isLeader = rankIndex === 0;

      viz.beginPath();
      viz.arc(x * ratio, y * ratio, circleRadius * ratio, 0, Math.PI * 2);
      viz.fillStyle = isLeader ? "rgba(255, 219, 121, 0.96)" : "rgba(132, 203, 255, 0.94)";
      viz.fill();
      viz.lineWidth = Math.max(1.1, 1.2 * ratio);
      viz.strokeStyle = "rgba(20, 36, 50, 0.95)";
      viz.stroke();

      if (individual.createdBy !== "elite" && individual.createdBy !== "initial") {
        viz.beginPath();
        viz.arc(x * ratio, y * ratio, Math.max(1.7, circleRadius * 0.32) * ratio, 0, Math.PI * 2);
        viz.fillStyle = "rgba(20, 36, 50, 0.98)";
        viz.fill();
      }

      if (isSelected) {
        viz.beginPath();
        viz.arc(x * ratio, y * ratio, circleRadius * ratio + 4 * ratio, 0, Math.PI * 2);
        viz.lineWidth = Math.max(1.6, 2 * ratio);
        viz.strokeStyle = "rgba(255, 98, 98, 0.95)";
        viz.stroke();
      }
    });
  });
}

function createEmptyFitnessBreakdown() {
  return {
    goals: 0,
    conceded: 0,
    ownGoal: 0,
  };
}

function formatFitnessValue(value) {
  const normalized = Math.abs(value) < 0.0005 ? 0 : value;
  if (normalized === 0) return "0.00";
  return `${normalized > 0 ? "+" : ""}${normalized.toFixed(2)}`;
}

function formatGamesPerSecond(value) {
  const rate = Math.max(0, toFiniteNumber(value, 0));
  if (rate >= 100) return rate.toFixed(0);
  if (rate >= 10) return rate.toFixed(1);
  return rate.toFixed(2);
}

function updateMatchFitnessTables(match) {
  const breakdownA = match?.fitnessBreakdown?.A || createEmptyFitnessBreakdown();
  const breakdownB = match?.fitnessBreakdown?.B || createEmptyFitnessBreakdown();
  const totalA = match?.teamFitness?.A || 0;
  const totalB = match?.teamFitness?.B || 0;
  const individualAId = match?.individualAId ?? match?.individualA?.id ?? null;
  const individualBId = match?.individualBId ?? match?.individualB?.id ?? null;

  ui.fitnessHeaderA.textContent = individualAId ? `#${individualAId}` : "A";
  ui.fitnessHeaderB.textContent = individualBId ? `#${individualBId}` : "B";

  ui.fitnessTableCombined.innerHTML = FITNESS_BREAKDOWN_ROWS.map(({ key, label, total: isTotal }) => {
    const valueA = isTotal ? totalA : (breakdownA[key] || 0);
    const valueB = isTotal ? totalB : (breakdownB[key] || 0);
    const rowClass = isTotal ? ' class="total-row"' : "";
    return `<tr${rowClass}><th scope="row">${label}</th><td>${formatFitnessValue(valueA)}</td><td>${formatFitnessValue(valueB)}</td></tr>`;
  }).join("");
}

function setControlsFromConfig(config) {
  if (!config) return;

  ui.teamSize.value = String(clamp(Number(config.teamSize) || 4, 1, 8));
  ui.hiddenLayers.value = String(clamp(Number(config.hiddenLayers) || 1, 1, 4));
  ui.neuronsPerLayer.value = String(clamp(Number(config.neuronsPerLayer) || 40, 4, 500));
  ui.populationSize.value = String(clamp(Number(config.populationSize) || 11, 4, 40));
  ui.tournamentGames.value = String(normalizeTournamentGames(config.tournamentGames ?? 30, config.populationSize ?? 11));
  ui.matchMinutes.value = String(clamp(Math.round(Number(config.matchMinutes) || 2), 1, 10));
  ui.goalWidth.value = String(normalizeGoalWidth(config.goalWidth ?? FIELD.goalWidth));
  ui.showTimeToggle.checked = config.showTimeIndicator !== false;
  state.showTimeIndicator = ui.showTimeToggle.checked;
  ui.showFieldStripesToggle.checked = config.showFieldStripes !== false;
  state.showFieldStripes = ui.showFieldStripesToggle.checked;
  applySpeedState({
    preset: config.speedPreset || (config.useMaxSpeed ? "max" : "fast"),
    multiplier: config.speedMultiplier ?? 1,
    useMaxSpeed: config.useMaxSpeed === true,
    notifyWorker: Boolean(state.worker),
    persist: false,
  });

  const fitnessSettings = normalizeFitnessSettings(config.fitnessSettings);
  ui.fitnessGoal.value = String(fitnessSettings.goalReward);
  ui.fitnessConceded.value = String(fitnessSettings.concededPenalty);
  ui.fitnessOwnGoal.value = String(fitnessSettings.ownGoalPenalty);

  if (ui.crossoverRate) {
    ui.crossoverRate.value = normalizeCrossoverRate(config.crossoverRate).toFixed(2);
  }

  const mutationSettings = normalizeMutationSettings(config.mutationSettings);
  ui.mutationRate.value = mutationSettings.rate.toFixed(2);
  ui.mutationAmount.value = mutationSettings.amount.toFixed(2);

  const historyDepth = normalizeNetworkVizHistoryDepth(config.networkVizHistoryDepth);
  state.networkVizHistoryDepth = historyDepth;
  if (ui.networkVizHistoryDepth) {
    ui.networkVizHistoryDepth.value = String(historyDepth);
  }

  applyAutoSaveSettings(config.autoSaveHours, { persist: false, notifyWorker: false });
}

function serializeNetwork(network) {
  return {
    layerSizes: [...network.layerSizes],
    weights: network.weights.map((layer) => layer.map((row) => [...row])),
    biases: network.biases.map((layer) => [...layer]),
  };
}

function deserializeNetwork(data) {
  if (!data || !Array.isArray(data.layerSizes) || !Array.isArray(data.weights) || !Array.isArray(data.biases)) {
    throw new Error("Некорректные данные нейросети.");
  }

  const layerSizes = data.layerSizes.map((size) => Math.max(1, Math.floor(Number(size) || 0)));
  const weights = data.weights.map((layer) => layer.map((row) => [...row]));
  const biases = data.biases.map((layer) => [...layer]);
  const expectedLayerSizes = [...layerSizes];
  expectedLayerSizes[0] = INPUT_SIZE;
  expectedLayerSizes[expectedLayerSizes.length - 1] = OUTPUT_SIZE;

  if (expectedLayerSizes.some((size, index) => size !== layerSizes[index])) {
    const adapted = new NeuralNetwork(expectedLayerSizes);

    for (let layerIndex = 0; layerIndex < Math.min(adapted.weights.length, weights.length); layerIndex += 1) {
      const targetLayer = adapted.weights[layerIndex];
      const sourceLayer = weights[layerIndex] || [];
      for (let row = 0; row < Math.min(targetLayer.length, sourceLayer.length); row += 1) {
        const sourceRow = sourceLayer[row] || [];
        for (let col = 0; col < Math.min(targetLayer[row].length, sourceRow.length); col += 1) {
          targetLayer[row][col] = sourceRow[col];
        }
      }

      const targetBiases = adapted.biases[layerIndex];
      const sourceBiases = biases[layerIndex] || [];
      for (let index = 0; index < Math.min(targetBiases.length, sourceBiases.length); index += 1) {
        targetBiases[index] = sourceBiases[index];
      }
    }

    return adapted;
  }

  return new NeuralNetwork(expectedLayerSizes, weights, biases);
}

function serializeNetworkSnapshot(snapshot) {
  if (!snapshot?.network) {
    return null;
  }

  return {
    generation: Math.max(0, Math.floor(Number(snapshot.generation) || 0)),
    id: Number(snapshot.id) || 0,
    fitness: Number(snapshot.fitness) || 0,
    network: serializeNetwork(snapshot.network),
  };
}

function deserializeNetworkSnapshot(snapshot) {
  if (!snapshot?.network) {
    return null;
  }

  return {
    generation: Math.max(0, Math.floor(Number(snapshot.generation) || 0)),
    id: Number(snapshot.id) || 0,
    fitness: Number(snapshot.fitness) || 0,
    network: deserializeNetwork(snapshot.network),
  };
}

function normalizeParentIds(parentIds = []) {
  if (!Array.isArray(parentIds)) {
    return [];
  }

  return parentIds
    .map((id) => Math.max(0, Math.floor(Number(id) || 0)))
    .filter((id) => id > 0);
}

function normalizeVisualizationHistory(history = []) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((entry) => ({
      generation: Math.max(0, Math.floor(Number(entry?.generation) || 0)),
      changedConnections: Array.isArray(entry?.changedConnections)
        ? entry.changedConnections.filter((key) => typeof key === "string")
        : [],
      parentIds: normalizeParentIds(entry?.parentIds),
      createdBy: typeof entry?.createdBy === "string" ? entry.createdBy : "mutation",
      snapshot: deserializeNetworkSnapshot(entry?.snapshot),
    }))
    .slice(0, NETWORK_VIZ_HISTORY_LIMIT);
}

function serializeVisualizationHistory(history = []) {
  return normalizeVisualizationHistory(history).map((entry) => ({
    generation: entry.generation,
    changedConnections: [...entry.changedConnections],
    parentIds: [...entry.parentIds],
    createdBy: entry.createdBy,
    snapshot: serializeNetworkSnapshot(entry.snapshot),
  }));
}

function normalizeGenerationTimeline(timeline = []) {
  if (!Array.isArray(timeline)) {
    return [];
  }

  return timeline
    .map((entry) => {
      const generation = Math.max(0, Math.floor(Number(entry?.generation) || 0));
      const individuals = Array.isArray(entry?.individuals)
        ? entry.individuals
            .map((individual) => {
              const snapshot = deserializeNetworkSnapshot(
                individual?.snapshot || {
                  generation,
                  id: individual?.id,
                  fitness: individual?.fitness,
                  network: individual?.network,
                },
              );
              if (!snapshot?.network) {
                return null;
              }

              return {
                generation,
                id: snapshot.id,
                fitness: snapshot.fitness,
                parentIds: normalizeParentIds(individual?.parentIds),
                changedConnections: Array.isArray(individual?.changedConnections)
                  ? individual.changedConnections.filter((key) => typeof key === "string")
                  : [],
                createdBy: typeof individual?.createdBy === "string" ? individual.createdBy : generation <= 1 ? "initial" : "mutation",
                snapshot,
              };
            })
            .filter(Boolean)
            .sort((a, b) => b.fitness - a.fitness)
        : [];

      return { generation, individuals };
    })
    .filter((entry) => entry.generation > 0 && entry.individuals.length > 0)
    .sort((a, b) => a.generation - b.generation)
    .slice(-NETWORK_VIZ_HISTORY_LIMIT);
}

function serializeGenerationTimeline(timeline = []) {
  return normalizeGenerationTimeline(timeline).map((entry) => ({
    generation: entry.generation,
    individuals: entry.individuals.map((individual) => ({
      id: individual.id,
      fitness: individual.fitness,
      parentIds: [...individual.parentIds],
      changedConnections: [...individual.changedConnections],
      createdBy: individual.createdBy,
      snapshot: serializeNetworkSnapshot(individual.snapshot),
    })),
  }));
}

function createConnectionKey(layerIndex, rowIndex, columnIndex) {
  return `w:${layerIndex}:${rowIndex}:${columnIndex}`;
}

function getChangedConnectionKeys(previousNetwork, currentNetwork) {
  if (!previousNetwork?.weights || !currentNetwork?.weights) {
    return [];
  }

  const changed = [];
  const layerCount = Math.min(previousNetwork.weights.length, currentNetwork.weights.length);

  for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
    const currentLayer = currentNetwork.weights[layerIndex] || [];
    const previousLayer = previousNetwork.weights[layerIndex] || [];

    for (let rowIndex = 0; rowIndex < currentLayer.length; rowIndex += 1) {
      const currentRow = currentLayer[rowIndex] || [];
      const previousRow = previousLayer[rowIndex] || [];

      for (let columnIndex = 0; columnIndex < currentRow.length; columnIndex += 1) {
        const currentWeight = currentRow[columnIndex];
        const previousWeight = previousRow[columnIndex];
        if (!Number.isFinite(currentWeight)) {
          continue;
        }

        if (!Number.isFinite(previousWeight) || Math.abs(currentWeight - previousWeight) > NETWORK_VIZ_EPSILON) {
          changed.push(createConnectionKey(layerIndex, rowIndex, columnIndex));
        }
      }
    }
  }

  return changed;
}

function distributeVisibleCounts(actualCounts, maxTotal = NETWORK_VIZ_MAX_HIDDEN_NODES) {
  const normalizedCounts = actualCounts.map((count) => Math.max(0, Math.floor(Number(count) || 0)));
  const total = normalizedCounts.reduce((sum, count) => sum + count, 0);

  if (total <= maxTotal) {
    return normalizedCounts;
  }

  const visibleCounts = normalizedCounts.map((count) => {
    if (count <= 0) {
      return 0;
    }
    return Math.max(1, Math.floor((count / total) * maxTotal));
  });

  let allocated = visibleCounts.reduce((sum, count) => sum + count, 0);

  while (allocated > maxTotal) {
    let candidateIndex = -1;
    let candidateCount = 1;
    for (let index = 0; index < visibleCounts.length; index += 1) {
      if (visibleCounts[index] > candidateCount) {
        candidateCount = visibleCounts[index];
        candidateIndex = index;
      }
    }

    if (candidateIndex === -1) {
      break;
    }

    visibleCounts[candidateIndex] -= 1;
    allocated -= 1;
  }

  while (allocated < maxTotal) {
    let candidateIndex = -1;
    let mostRemaining = 0;
    for (let index = 0; index < visibleCounts.length; index += 1) {
      const remaining = normalizedCounts[index] - visibleCounts[index];
      if (remaining > mostRemaining) {
        mostRemaining = remaining;
        candidateIndex = index;
      }
    }

    if (candidateIndex === -1 || mostRemaining <= 0) {
      break;
    }

    visibleCounts[candidateIndex] += 1;
    allocated += 1;
  }

  return visibleCounts.map((count, index) => Math.min(count, normalizedCounts[index]));
}

function pickVisibleIndices(totalCount, visibleCount) {
  const total = Math.max(0, Math.floor(Number(totalCount) || 0));
  const limit = Math.max(0, Math.min(total, Math.floor(Number(visibleCount) || 0)));

  if (limit <= 0) {
    return [];
  }

  if (limit >= total) {
    return Array.from({ length: total }, (_, index) => index);
  }

  if (limit === 1) {
    return [Math.floor((total - 1) / 2)];
  }

  const indices = [];
  const used = new Set();

  for (let index = 0; index < limit; index += 1) {
    let candidate = clamp(Math.round((index * (total - 1)) / (limit - 1)), 0, total - 1);

    while (used.has(candidate) && candidate < total - 1) {
      candidate += 1;
    }
    while (used.has(candidate) && candidate > 0) {
      candidate -= 1;
    }

    used.add(candidate);
    indices.push(candidate);
  }

  return indices.sort((a, b) => a - b);
}

function createNetworkVisualizationData(snapshot, historyEntries = [], version = 0, selectedHistoryIndex = 0) {
  const history = normalizeVisualizationHistory(historyEntries).slice(0, NETWORK_VIZ_HISTORY_LIMIT);
  const activeHistoryIndex = normalizeNetworkVizHistoryOffset(selectedHistoryIndex, Math.max(0, history.length - 1));
  const activeHistoryEntry = history[activeHistoryIndex] || null;
  const activeSnapshot = activeHistoryEntry?.snapshot?.network ? activeHistoryEntry.snapshot : snapshot;
  const network = activeSnapshot?.network;
  if (!network?.layerSizes?.length) {
    return null;
  }

  const activeConnections = new Set(activeHistoryEntry?.changedConnections || []);
  const activeParentIds = normalizeParentIds(activeHistoryEntry?.parentIds ?? activeSnapshot?.parentIds);
  const activeCreatedBy = typeof activeHistoryEntry?.createdBy === "string"
    ? activeHistoryEntry.createdBy
    : typeof activeSnapshot?.createdBy === "string"
      ? activeSnapshot.createdBy
      : "mutation";

  const layerSizes = [...network.layerSizes];
  const hiddenLayerSizes = layerSizes.slice(1, -1);
  const hiddenVisibleCounts = distributeVisibleCounts(hiddenLayerSizes, NETWORK_VIZ_MAX_HIDDEN_NODES);
  const visibleIndicesByLayer = layerSizes.map((size, layerIndex) => {
    if (layerIndex === 0 || layerIndex === layerSizes.length - 1) {
      return pickVisibleIndices(size, size);
    }
    return pickVisibleIndices(size, hiddenVisibleCounts[layerIndex - 1]);
  });

  const layers = visibleIndicesByLayer.map((indices, layerIndex) => {
    if (layerIndex === 0) {
      let offset = 0;
      const groups = NETWORK_VIZ_INPUT_GROUPS.map((group) => {
        const groupStart = offset;
        const nodes = [];
        for (let localIndex = 0; localIndex < group.size; localIndex += 1) {
          const actualIndex = groupStart + localIndex;
          if (indices.includes(actualIndex)) {
            nodes.push({
              id: `${layerIndex}:${actualIndex}`,
              actualIndex,
              label: String(localIndex + 1),
              groupKey: group.key,
              groupLabel: group.label,
            });
          }
        }
        offset += group.size;
        return { ...group, nodes };
      }).filter((group) => group.nodes.length > 0);

      return {
        key: "input",
        label: "Входы",
        actualCount: layerSizes[layerIndex],
        shownCount: groups.reduce((sum, group) => sum + group.nodes.length, 0),
        nodes: groups.flatMap((group) => group.nodes),
        groups,
      };
    }

    const isOutputLayer = layerIndex === layerSizes.length - 1;
    const nodes = indices.map((actualIndex, localIndex) => ({
      id: `${layerIndex}:${actualIndex}`,
      actualIndex,
      label: isOutputLayer
        ? localIndex === 0
          ? "Ход"
          : localIndex === 1
            ? "Поворот"
            : `Выход ${localIndex + 1}`
        : String(actualIndex + 1),
    }));

    return {
      key: isOutputLayer ? "output" : `hidden-${layerIndex}`,
      label: isOutputLayer ? "Выходы" : `Скрытый слой ${layerIndex}`,
      actualCount: layerSizes[layerIndex],
      shownCount: nodes.length,
      nodes,
    };
  });

  const connections = [];
  for (let layerIndex = 0; layerIndex < network.weights.length; layerIndex += 1) {
    const sourceNodes = layers[layerIndex]?.nodes || [];
    const targetNodes = layers[layerIndex + 1]?.nodes || [];

    for (const targetNode of targetNodes) {
      const rowWeights = network.weights[layerIndex]?.[targetNode.actualIndex] || [];

      for (const sourceNode of sourceNodes) {
        const weight = rowWeights[sourceNode.actualIndex];
        if (!Number.isFinite(weight)) {
          continue;
        }

        const key = createConnectionKey(layerIndex, targetNode.actualIndex, sourceNode.actualIndex);
        connections.push({
          key,
          from: sourceNode.id,
          to: targetNode.id,
          weight,
          highlighted: activeConnections.has(key),
        });
      }
    }
  }

  return {
    version,
    rootSnapshot: serializeNetworkSnapshot(snapshot),
    generation: Math.max(0, Math.floor(Number(activeSnapshot?.generation) || 0)),
    bestId: activeSnapshot?.id ?? null,
    bestFitness: Number(activeSnapshot?.fitness) || 0,
    layerSizes,
    hiddenTotalCount: hiddenLayerSizes.reduce((sum, count) => sum + count, 0),
    hiddenShownCount: hiddenVisibleCounts.reduce((sum, count) => sum + count, 0),
    availableHistory: history.length,
    activeHistoryIndex,
    activeHistoryGeneration: activeHistoryEntry?.generation ?? activeSnapshot?.generation ?? null,
    activeChangedCount: activeHistoryEntry?.changedConnections?.length || 0,
    parentIds: activeParentIds,
    createdBy: activeCreatedBy,
    historyEntries: serializeVisualizationHistory(history),
    layers,
    connections,
  };
}

function serializeMatchState(match, currentA, currentB) {
  if (!match) {
    return null;
  }

  return {
    individualAId: currentA?.id || null,
    individualBId: currentB?.id || null,
    time: match.time,
    duration: match.duration,
    done: match.done,
    score: { ...match.score },
    teamFitness: { ...match.teamFitness },
    fitnessBreakdown: {
      A: { ...match.fitnessBreakdown.A },
      B: { ...match.fitnessBreakdown.B },
    },
    ball: {
      x: match.ball.x,
      y: match.ball.y,
      vx: match.ball.vx,
      vy: match.ball.vy,
      radius: match.ball.radius,
      lastTouchTeam: match.ball.lastTouchTeam ?? null,
    },
    ballTrail: match.ballTrail.map((point) => ({ ...point })),
    players: match.players.map((player) => ({
      team: player.team,
      x: player.x,
      y: player.y,
      vx: player.vx,
      vy: player.vy,
      dir: player.dir,
      radius: player.radius,
      isTouchingBall: Boolean(player.isTouchingBall),
    })),
  };
}

function updateSaveStatus(savedData = state.savedPopulationData, errorMessage = "") {
  if (ui.loadBtn) {
    ui.loadBtn.disabled = true;
  }
  if (ui.saveFileBtn) {
    ui.saveFileBtn.disabled = !savedData && !state.workerSaveData?.population?.length && !state.trainer?.population?.length;
  }
  if (!ui.saveStatus) {
    return;
  }

  ui.saveStatus.classList.remove("ready", "error");

  if (errorMessage) {
    ui.saveStatus.textContent = errorMessage;
    ui.saveStatus.classList.add("error");
    return;
  }

  if (state.autoSaveHours > 0) {
    const autoSaveText = `Автосохранение каждые ${formatAutoSaveHours(state.autoSaveHours)} ч`;
    const lastSavedText = state.lastAutoSaveAt
      ? ` · последнее ${new Date(state.lastAutoSaveAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
      : " · ожидание первого автосохранения";
    ui.saveStatus.textContent = `${autoSaveText}${lastSavedText}`;
    ui.saveStatus.classList.add("ready");
    return;
  }

  ui.saveStatus.textContent = savedData
    ? "Автосохранение выключено · состояние готово к сохранению в файл."
    : "Автосохранение выключено.";
  ui.saveStatus.classList.add("ready");
}

function buildSavePayloadFromTrainer(trainer) {
  if (!trainer?.population?.length) {
    return null;
  }

  return {
    version: 3,
    savedAt: Date.now(),
    generation: trainer.generation,
    bestFitness: trainer.bestFitness,
    generationBestFitness: trainer.bestFitness,
    bestEverFitness: trainer.bestEver?.fitness || 0,
    nextIndividualId,
    config: trainer.config
      ? {
          ...trainer.config,
          populationSize: trainer.population.length,
          fitnessSettings: normalizeFitnessSettings(trainer.config.fitnessSettings),
          crossoverRate: normalizeCrossoverRate(trainer.config.crossoverRate),
          mutationSettings: normalizeMutationSettings(trainer.config.mutationSettings),
          networkVizHistoryDepth: normalizeNetworkVizHistoryDepth(trainer.config.networkVizHistoryDepth),
          autoSaveHours: normalizeAutoSaveHours(trainer.config.autoSaveHours),
        }
      : null,
    population: trainer.population.map((individual) => ({
      id: individual.id,
      fitness: individual.fitness,
      network: serializeNetwork(individual.network),
      visualizationChangedConnections: Array.isArray(individual.visualizationChangedConnections)
        ? individual.visualizationChangedConnections.filter((key) => typeof key === "string")
        : [],
      visualizationParentIds: normalizeParentIds(individual.visualizationParentIds),
      visualizationOrigin: typeof individual.visualizationOrigin === "string" ? individual.visualizationOrigin : "mutation",
    })),
    bestEver: trainer.bestEver
      ? {
          id: trainer.bestEver.id,
          fitness: trainer.bestEver.fitness,
          network: serializeNetwork(trainer.bestEver.network),
        }
      : null,
    visualization: trainer.getVisualizationState(),
    progress: {
      running: trainer.running,
      matchCursor: trainer.matchCursor,
      schedule: trainer.schedule.map(([indexA, indexB]) => [indexA, indexB]),
      currentMatch: serializeMatchState(trainer.currentMatch, trainer.currentA, trainer.currentB),
    },
  };
}

function applyLoadedPopulationPayload(payload) {
  if (!payload || !Array.isArray(payload.population) || payload.population.length === 0) {
    throw new Error("Пустое сохранение.");
  }

  payload.pitchWidth = Number.isFinite(payload.pitchWidth) ? payload.pitchWidth : state.pitchWidth;

  state.savedPopulationData = payload;
  state.workerSaveData = payload;
  state.generationTimeline = [];
  state.networkVizData = null;
  state.networkVizVersionRendered = null;
  state.generationFlowVersionRendered = null;
  state.generationFlowHitboxes = [];
  state.networkVizHistoryOffset = 0;

  if (payload.visualization) {
    payload.visualization = trimVisualizationState(
      payload.visualization,
      payload.config?.networkVizHistoryDepth ?? state.networkVizHistoryDepth,
    );
  }

  applyVisualizationPayload(payload);

  if (payload.config) {
    setControlsFromConfig(payload.config);
    saveSettingsToLocalStorage(readConfig());
  }
  if (Number.isFinite(payload.pitchWidth)) {
    state.pitchWidth = payload.pitchWidth;
    applyPitchWidth();
  }
  updateSaveStatus(payload);
  return payload;
}

function savePopulation(source = state.workerSaveData || state.savedPopulationData || state.trainer) {
  let payload = null;

  if (source?.progress && Array.isArray(source.population)) {
    payload = source;
  } else if (source?.population?.length) {
    payload = buildSavePayloadFromTrainer(source);
  }

  if (!payload?.population?.length) {
    return false;
  }

  payload.savedAt = Date.now();
  payload.pitchWidth = state.pitchWidth;
  payload.config = payload.config
    ? {
        ...payload.config,
        populationSize: payload.population.length,
        tournamentGames: normalizeTournamentGames(payload.config.tournamentGames ?? ui.tournamentGames?.value, payload.population.length),
        goalWidth: normalizeGoalWidth(payload.config.goalWidth ?? ui.goalWidth?.value ?? FIELD.goalWidth),
        speedPreset: state.speedPreset,
        speedMultiplier: state.speedMultiplier,
        useMaxSpeed: state.useMaxSpeed,
        showTimeIndicator: state.showTimeIndicator,
        showFieldStripes: state.showFieldStripes,
        fitnessSettings: normalizeFitnessSettings(payload.config.fitnessSettings),
        crossoverRate: normalizeCrossoverRate(payload.config.crossoverRate),
        mutationSettings: normalizeMutationSettings(payload.config.mutationSettings),
        networkVizHistoryDepth: normalizeNetworkVizHistoryDepth(payload.config.networkVizHistoryDepth),
        autoSaveHours: normalizeAutoSaveHours(payload.config.autoSaveHours ?? ui.autoSaveHours?.value),
      }
    : null;

  state.savedPopulationData = payload;
  state.workerSaveData = payload;
  applyVisualizationPayload(payload);
  updateSaveStatus(payload);
  return true;
}

function startTrainingFromSavedData(savedData, sourceLabel = "браузера") {
  if (!savedData) {
    return false;
  }

  ensureWorker();
  state.trainer = null;
  state.workerStatus = null;
  state.previousWorkerStatus = null;
  state.workerStatusAt = 0;
  state.previousWorkerStatusAt = 0;
  state.workerSaveData = savedData;
  state.isPaused = false;
  state.generationTimeline = [];
  state.selectedVisualizationGeneration = null;
  state.selectedVisualizationIndividualId = null;
  state.networkVizHistoryOffset = 0;
  postToWorker("loadSaved", { config: readConfig(), savedData });
  addLog(`Состояние обучения загружено из ${sourceLabel}.`);
  return true;
}

function requestLatestSaveData(timeoutMs = 1500) {
  if (!state.worker || !state.workerStatus?.running) {
    savePopulation(state.workerSaveData || state.savedPopulationData || state.trainer);
    return Promise.resolve(state.savedPopulationData || state.workerSaveData || null);
  }

  if (state.pendingSaveRequest) {
    clearTimeout(state.pendingSaveRequest.timeoutId);
    state.pendingSaveRequest.resolve(state.workerSaveData || state.savedPopulationData || null);
    state.pendingSaveRequest = null;
  }

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      state.pendingSaveRequest = null;
      resolve(state.workerSaveData || state.savedPopulationData || null);
    }, timeoutMs);

    state.pendingSaveRequest = { resolve, timeoutId };
    postToWorker("requestSave");
  });
}

function exportPopulationToFile(payload) {
  if (!payload?.population?.length) {
    return null;
  }

  const generation = Math.max(0, Math.floor(Number(payload.generation) || 0));
  const hiddenLayers = clamp(Math.floor(Number(payload.config?.hiddenLayers) || Number(ui.hiddenLayers?.value) || 0), 0, 9);
  const neuronsPerLayer = clamp(Math.floor(Number(payload.config?.neuronsPerLayer) || Number(ui.neuronsPerLayer?.value) || 0), 0, 999);
  const teamSize = clamp(Math.floor(Number(payload.config?.teamSize) || Number(ui.teamSize?.value) || 0), 0, 99);
  const networkShape = `${hiddenLayers}x${neuronsPerLayer}`;
  const timestamp = new Date(payload.savedAt || Date.now()).toISOString().replace(/[:.]/g, "-");
  const fileName = `nnf-${networkShape}-P-${teamSize}-G-${generation}-${timestamp}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return fileName;
}

class NeuralNetwork {
  constructor(layerSizes, weights = null, biases = null) {
    this.layerSizes = [...layerSizes];
    this.weights = weights || NeuralNetwork.randomWeights(layerSizes);
    this.biases = biases || NeuralNetwork.randomBiases(layerSizes);
  }

  static random(layerSizes) {
    return new NeuralNetwork(layerSizes);
  }

  static randomWeights(layerSizes) {
    const weights = [];
    for (let i = 0; i < layerSizes.length - 1; i += 1) {
      const inputCount = layerSizes[i];
      const outputCount = layerSizes[i + 1];
      const layer = [];
      for (let row = 0; row < outputCount; row += 1) {
        const rowWeights = [];
        for (let col = 0; col < inputCount; col += 1) {
          rowWeights.push(randRange(-1, 1));
        }
        layer.push(rowWeights);
      }
      weights.push(layer);
    }
    return weights;
  }

  static randomBiases(layerSizes) {
    const biases = [];
    for (let i = 1; i < layerSizes.length; i += 1) {
      biases.push(Array.from({ length: layerSizes[i] }, () => randRange(-1, 1)));
    }
    return biases;
  }

  clone() {
    return new NeuralNetwork(
      this.layerSizes,
      this.weights.map((layer) => layer.map((row) => [...row])),
      this.biases.map((layer) => [...layer]),
    );
  }

  forward(inputs) {
    let activations = [...inputs];

    for (let layerIndex = 0; layerIndex < this.weights.length; layerIndex += 1) {
      const layerWeights = this.weights[layerIndex];
      const layerBiases = this.biases[layerIndex];
      const next = new Array(layerWeights.length);

      for (let row = 0; row < layerWeights.length; row += 1) {
        let sum = layerBiases[row];
        for (let col = 0; col < layerWeights[row].length; col += 1) {
          sum += layerWeights[row][col] * activations[col];
        }
        next[row] = Math.tanh(sum);
      }

      activations = next;
    }

    return activations;
  }

  crossover(other) {
    const weights = this.weights.map((layer, layerIndex) =>
      layer.map((row, rowIndex) =>
        row.map((value, colIndex) =>
          random() < 0.5 ? value : other.weights[layerIndex][rowIndex][colIndex],
        ),
      ),
    );

    const biases = this.biases.map((layer, layerIndex) =>
      layer.map((value, index) => (random() < 0.5 ? value : other.biases[layerIndex][index])),
    );

    return new NeuralNetwork(this.layerSizes, weights, biases);
  }

  mutate(rate = 0.08, amount = 0.35) {
    for (const layer of this.weights) {
      for (const row of layer) {
        for (let i = 0; i < row.length; i += 1) {
          if (random() < rate) {
            row[i] += randRange(-amount, amount);
          }
        }
      }
    }

    for (const layer of this.biases) {
      for (let i = 0; i < layer.length; i += 1) {
        if (random() < rate) {
          layer[i] += randRange(-amount, amount);
        }
      }
    }

    return this;
  }
}

class FootballMatch {
  constructor(individualA, individualB, config, onEvent) {
    this.individualA = individualA;
    this.individualB = individualB;
    this.config = config;
    this.onEvent = onEvent;
    this.time = 0;
    this.duration = 60;
    this.done = false;
    this.teamFitness = { A: 0, B: 0 };
    this.fitnessBreakdown = {
      A: createEmptyFitnessBreakdown(),
      B: createEmptyFitnessBreakdown(),
    };
    this.score = { A: 0, B: 0 };
    this.players = [];
    this.ballTrail = [];
    this.goalWidth = FIELD.goalWidth;
    this.setGoalWidth(config.goalWidth);

    this.ball = {
      x: FIELD.width / 2,
      y: FIELD.height / 2,
      vx: 0,
      vy: 0,
      radius: FIELD.ballRadius,
      lastTouchTeam: null,
    };

    this.ballTrail = [{ x: this.ball.x, y: this.ball.y }];
    this.setDurationMinutes(config.matchMinutes || 10);
    this.spawnPlayers();
  }

  setDurationMinutes(matchMinutes) {
    this.duration = Math.max(60, clamp(Math.round(matchMinutes || 10), 1, 10) * 60);

    if (this.time >= this.duration) {
      this.finish();
    }
  }

  setGoalWidth(goalWidth) {
    this.goalWidth = normalizeGoalWidth(goalWidth);
    if (this.config) {
      this.config.goalWidth = this.goalWidth;
    }
    this.goalTop = (FIELD.height - this.goalWidth) / 2;
    this.goalBottom = this.goalTop + this.goalWidth;
  }

  addFitness(team, component, amount) {
    this.teamFitness[team] += amount;
    this.fitnessBreakdown[team][component] += amount;
  }

  getFitnessSetting(key) {
    const value = this.config?.fitnessSettings?.[key];
    return Number.isFinite(value) ? value : FITNESS_SETTINGS_DEFAULTS[key];
  }

  spawnPlayers() {
    this.players = [];
    this.createTeam("A", this.individualA.network);
    this.createTeam("B", this.individualB.network);
  }

  createTeam(team, network) {
    const count = this.config.teamSize;
    const columns = [16, 26, 36];
    const rows = Math.ceil(count / columns.length);

    for (let i = 0; i < count; i += 1) {
      const row = i % rows;
      const col = Math.floor(i / rows);
      const xBase = columns[Math.min(col, columns.length - 1)];
      const x = team === "A" ? xBase : FIELD.width - xBase;
      const y = ((row + 1) * FIELD.height) / (rows + 1);

      this.players.push({
        team,
        network,
        x,
        y,
        vx: 0,
        vy: 0,
        dir: team === "A" ? 0 : Math.PI,
        radius: FIELD.playerRadius,
        isTouchingBall: false,
      });
    }
  }

  resetBallToCenter() {
    this.ball.x = FIELD.width / 2;
    this.ball.y = FIELD.height / 2;
    this.ball.vx = randRange(-0.6, 0.6);
    this.ball.vy = randRange(-0.6, 0.6);
    this.ball.lastTouchTeam = null;
    this.ballTrail = [{ x: this.ball.x, y: this.ball.y }];
  }

  resetAfterGoal() {
    this.resetBallToCenter();
    this.spawnPlayers();
  }

  step(dt) {
    if (this.done) return;

    this.time += dt;

    for (const player of this.players) {
      this.controlPlayer(player, dt);
    }

    for (const player of this.players) {
      player.x += player.vx * dt;
      player.y += player.vy * dt;
      player.vx *= 0.94;
      player.vy *= 0.94;
      this.keepPlayerInBounds(player);
    }

    this.handlePlayerCollisions();
    this.updateBall(dt);

    if (this.time >= this.duration) {
      this.finish();
    }
  }

  finish() {
    if (this.done) return;
    this.done = true;
  }

  controlPlayer(player, dt) {
    const inputs = this.collectVision(player);
    const [throttleSignal, turnSignal] = player.network.forward(inputs);
    const targetSpeed = clamp(throttleSignal, -1, 1) * MAX_PLAYER_SPEED;
    player.dir = normalizeAngle(player.dir + clamp(turnSignal, -1, 1) * 2.4 * dt);

    const desiredVx = Math.cos(player.dir) * targetSpeed;
    const desiredVy = Math.sin(player.dir) * targetSpeed;

    player.vx = lerp(player.vx, desiredVx, 0.22);
    player.vy = lerp(player.vy, desiredVy, 0.22);
  }

  collectVision(player) {
    const teammates = this.players.filter((p) => p !== player && p.team === player.team);
    const opponents = this.players.filter((p) => p.team !== player.team);
    const ownGoalX = player.team === "A" ? 0 : FIELD.width;
    const oppGoalX = player.team === "A" ? FIELD.width : 0;
    const normalizedMatchTime = clamp(this.time / Math.max(this.duration, STEP_DT), 0, 1);

    return [
      ...senseTargets(player, teammates),
      ...senseTargets(player, opponents),
      ...senseDirectionAndDistance(player, this.ball),
      ...senseBoundaries(player),
      ...senseDirectionAndDistance(player, { x: ownGoalX, y: FIELD.height / 2, radius: this.goalWidth / 2 }),
      ...senseDirectionAndDistance(player, { x: oppGoalX, y: FIELD.height / 2, radius: this.goalWidth / 2 }),
      normalizedMatchTime,
    ];
  }

  keepPlayerInBounds(player) {
    if (player.x < player.radius) {
      player.x = player.radius;
      player.vx = Math.abs(player.vx) * 0.45;
    }
    if (player.x > FIELD.width - player.radius) {
      player.x = FIELD.width - player.radius;
      player.vx = -Math.abs(player.vx) * 0.45;
    }
    if (player.y < player.radius) {
      player.y = player.radius;
      player.vy = Math.abs(player.vy) * 0.45;
    }
    if (player.y > FIELD.height - player.radius) {
      player.y = FIELD.height - player.radius;
      player.vy = -Math.abs(player.vy) * 0.45;
    }
  }

  handlePlayerCollisions() {
    for (let i = 0; i < this.players.length; i += 1) {
      for (let j = i + 1; j < this.players.length; j += 1) {
        const a = this.players[i];
        const b = this.players[j];
        resolveElasticCollision(a, b, 0.88);
      }
    }
  }

  updateBall(dt) {
    const touchingPlayers = new Set();

    for (const player of this.players) {
      const dx = this.ball.x - player.x;
      const dy = this.ball.y - player.y;
      const distance = Math.hypot(dx, dy) || 0.0001;
      const minDistance = this.ball.radius + player.radius;

      if (distance < minDistance) {
        touchingPlayers.add(player);
        resolveElasticCollision(player, this.ball, 0.9);

        const ballSpeed = Math.hypot(this.ball.vx, this.ball.vy);
        const nearVerticalEdge = this.ball.x - this.ball.radius <= 0.75 || this.ball.x + this.ball.radius >= FIELD.width - 0.75;
        const nearHorizontalEdge = this.ball.y - this.ball.radius <= 0.75 || this.ball.y + this.ball.radius >= FIELD.height - 0.75;
        const ballPinnedOnBoundary = (nearVerticalEdge || nearHorizontalEdge) && ballSpeed < 0.6;

        if (!player.isTouchingBall && !ballPinnedOnBoundary) {
          this.ball.lastTouchTeam = player.team;
        }

        player.isTouchingBall = true;
      }
    }

    for (const player of this.players) {
      if (!touchingPlayers.has(player)) {
        player.isTouchingBall = false;
      }
    }

    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;
    this.ball.vx *= 0.992;
    this.ball.vy *= 0.992;

    if (this.ball.y - this.ball.radius <= 0) {
      this.ball.y = this.ball.radius;
      this.ball.vy = Math.abs(this.ball.vy) * 0.9;
    }

    if (this.ball.y + this.ball.radius >= FIELD.height) {
      this.ball.y = FIELD.height - this.ball.radius;
      this.ball.vy = -Math.abs(this.ball.vy) * 0.9;
    }

    if (this.ball.x - this.ball.radius <= 0) {
      if (this.ball.y >= this.goalTop && this.ball.y <= this.goalBottom) {
        this.registerGoal("B");
        return;
      }

      this.ball.x = this.ball.radius;
      this.ball.vx = Math.abs(this.ball.vx) * 0.9;
    }

    if (this.ball.x + this.ball.radius >= FIELD.width) {
      if (this.ball.y >= this.goalTop && this.ball.y <= this.goalBottom) {
        this.registerGoal("A");
        return;
      }

      this.ball.x = FIELD.width - this.ball.radius;
      this.ball.vx = -Math.abs(this.ball.vx) * 0.9;
    }

    this.recordBallTrail();
  }

  recordBallTrail() {
    const speed = Math.hypot(this.ball.vx, this.ball.vy);

    if (speed < BALL_TRAIL_SPEED_THRESHOLD) {
      this.ballTrail = [{ x: this.ball.x, y: this.ball.y }];
      return;
    }

    const lastPoint = this.ballTrail[this.ballTrail.length - 1];
    if (!lastPoint || Math.hypot(this.ball.x - lastPoint.x, this.ball.y - lastPoint.y) > 0.45) {
      this.ballTrail.push({ x: this.ball.x, y: this.ball.y });
    }

    if (this.ballTrail.length > 28) {
      this.ballTrail.shift();
    }
  }

  registerGoal(scoringTeam) {
    const concedingTeam = scoringTeam === "A" ? "B" : "A";
    const isOwnGoal = this.ball.lastTouchTeam === concedingTeam;
    this.score[scoringTeam] += 1;
    this.addFitness(scoringTeam, "goals", this.getFitnessSetting("goalReward"));
    this.addFitness(concedingTeam, "conceded", this.getFitnessSetting("concededPenalty"));

    if (isOwnGoal) {
      this.addFitness(concedingTeam, "ownGoal", this.getFitnessSetting("ownGoalPenalty"));
    }

    this.onEvent?.(
      `Гол: ${scoringTeam} (${this.individualA.id} vs ${this.individualB.id}) — счёт ${this.score.A}:${this.score.B}`,
    );

    this.resetAfterGoal();
  }
}

class EvolutionTrainer {
  constructor(onLog) {
    this.onLog = onLog;
    this.running = false;
    this.generation = 0;
    this.matchCursor = 0;
    this.schedule = [];
    this.population = [];
    this.bestEver = null;
    this.bestFitness = 0;
    this.currentMatch = null;
    this.config = null;
    this.completedMatchTimes = [];
    this.lineageBest = null;
    this.generationLeader = null;
    this.lineageHistory = [];
    this.generationTimeline = [];
    this.networkVizVersion = 0;
    this.cachedNetworkViz = null;
    this.networkVizHistoryOffset = 0;
  }

  pruneCompletedMatchTimes(now = performance.now()) {
    const cutoff = now - MATCH_RATE_WINDOW_MS;
    while (this.completedMatchTimes.length && this.completedMatchTimes[0] < cutoff) {
      this.completedMatchTimes.shift();
    }
  }

  recordCompletedMatch(now = performance.now()) {
    this.completedMatchTimes.push(now);
    this.pruneCompletedMatchTimes(now);
  }

  getMatchesPerSecond(now = performance.now()) {
    if (!this.running) {
      return 0;
    }

    this.pruneCompletedMatchTimes(now);
    return this.completedMatchTimes.length / (MATCH_RATE_WINDOW_MS / 1000);
  }

  markNetworkVisualizationDirty() {
    this.networkVizVersion += 1;
    this.cachedNetworkViz = null;
  }

  updateGenerationLeader(individual) {
    if (!individual?.network) {
      return;
    }

    const hasNoLeader = !this.generationLeader?.network;
    const isSameLeader = !hasNoLeader && individual.id === this.generationLeader.id;
    const shouldPromote = hasNoLeader || individual.fitness > this.generationLeader.fitness + NETWORK_VIZ_EPSILON;
    const shouldRefresh = isSameLeader && Math.abs((individual.fitness || 0) - (this.generationLeader.fitness || 0)) > NETWORK_VIZ_EPSILON;

    if (shouldPromote || shouldRefresh) {
      this.generationLeader = {
        generation: this.generation,
        id: individual.id,
        fitness: individual.fitness,
        network: individual.network.clone(),
      };
    }
  }

  getDisplayedNetworkSnapshot() {
    if (this.lineageBest?.network) {
      return this.lineageBest;
    }
    if (this.generationLeader?.network) {
      return this.generationLeader;
    }
    if (this.bestEver?.network) {
      return {
        generation: this.generation,
        id: this.bestEver.id,
        fitness: this.bestEver.fitness,
        network: this.bestEver.network.clone(),
      };
    }
    const fallback = this.population?.[0];
    if (fallback?.network) {
      return {
        generation: this.generation,
        id: fallback.id,
        fitness: fallback.fitness,
        network: fallback.network.clone(),
      };
    }
    return null;
  }

  buildVisualizationHistoryForDisplay() {
    return trimVisualizationHistory(this.lineageHistory, this.config?.networkVizHistoryDepth);
  }

  restoreVisualizationState(visualization = {}) {
    this.lineageBest = deserializeNetworkSnapshot(visualization.lineageBest);
    this.generationLeader = deserializeNetworkSnapshot(visualization.generationLeader);
    this.lineageHistory = trimVisualizationHistory(visualization.history, this.config?.networkVizHistoryDepth);
    this.generationTimeline = trimGenerationTimeline(visualization.generationTimeline, this.config?.networkVizHistoryDepth);
    this.networkVizHistoryOffset = normalizeNetworkVizHistoryOffset(this.networkVizHistoryOffset, Math.max(0, this.lineageHistory.length - 1));
    this.networkVizVersion = 0;
    this.cachedNetworkViz = null;
    this.markNetworkVisualizationDirty();
  }

  getVisualizationState() {
    return {
      lineageBest: serializeNetworkSnapshot(this.lineageBest),
      generationLeader: serializeNetworkSnapshot(this.generationLeader),
      history: serializeVisualizationHistory(this.lineageHistory),
      generationTimeline: serializeGenerationTimeline(this.generationTimeline),
    };
  }

  getNetworkVisualizationData() {
    if (!this.cachedNetworkViz) {
      this.cachedNetworkViz = createNetworkVisualizationData(
        this.getDisplayedNetworkSnapshot(),
        this.buildVisualizationHistoryForDisplay(),
        this.networkVizVersion,
        this.networkVizHistoryOffset,
      );
    }

    return this.cachedNetworkViz;
  }

  start(config, savedData = null) {
    this.config = {
      ...config,
      goalWidth: normalizeGoalWidth(config.goalWidth ?? FIELD.goalWidth),
      tournamentGames: normalizeTournamentGames(config.tournamentGames, config.populationSize),
      fitnessSettings: normalizeFitnessSettings(config.fitnessSettings),
      crossoverRate: normalizeCrossoverRate(config.crossoverRate),
      mutationSettings: normalizeMutationSettings(config.mutationSettings),
      networkVizHistoryDepth: normalizeNetworkVizHistoryDepth(config.networkVizHistoryDepth),
    };
    this.bestEver = null;
    this.currentA = null;
    this.currentB = null;
    this.currentMatch = null;
    this.generationTimeline = [];

    if (savedData?.population?.length) {
      this.restorePopulation(savedData, this.config);
      this.running = true;

      if (savedData.progress?.currentMatch && this.restoreCurrentMatch(savedData.progress.currentMatch)) {
        savePopulation(this);
      } else if (this.schedule.length && this.matchCursor < this.schedule.length) {
        this.loadNextMatch();
        savePopulation(this);
      } else {
        this.prepareGeneration();
        savePopulation(this);
      }

      this.onLog(
        `Загружено сохранение: поколение ${this.generation}, лучший фитнес ${this.bestFitness.toFixed(2)}.`,
      );
      return;
    }

    this.population = this.createPopulation(this.config);
    this.generation = 1;
    this.bestFitness = 0;
    this.running = true;
    this.prepareGeneration();
    savePopulation(this);
    this.onLog(
      `Старт нового обучения: популяция ${this.config.populationSize}, игроков ${this.config.teamSize}, матч ${this.config.matchMinutes} мин.`,
    );
  }

  restorePopulation(savedData, fallbackConfig) {
    const mergedConfig = {
      ...fallbackConfig,
      ...(savedData.config || {}),
      populationSize: savedData.population.length,
      goalWidth: normalizeGoalWidth(savedData.config?.goalWidth ?? fallbackConfig.goalWidth ?? FIELD.goalWidth),
      tournamentGames: normalizeTournamentGames(savedData.config?.tournamentGames, savedData.population.length),
      fitnessSettings: normalizeFitnessSettings({
        ...(fallbackConfig.fitnessSettings || {}),
        ...((savedData.config && savedData.config.fitnessSettings) || {}),
      }),
      crossoverRate: normalizeCrossoverRate(savedData.config?.crossoverRate ?? fallbackConfig.crossoverRate),
      mutationSettings: normalizeMutationSettings({
        ...(fallbackConfig.mutationSettings || {}),
        ...((savedData.config && savedData.config.mutationSettings) || {}),
      }),
      networkVizHistoryDepth: normalizeNetworkVizHistoryDepth(
        savedData.config?.networkVizHistoryDepth ?? fallbackConfig.networkVizHistoryDepth,
      ),
    };

    this.config = mergedConfig;
    this.population = savedData.population.map((individual) => ({
      id: Number(individual.id) || (nextIndividualId += 1),
      network: deserializeNetwork(individual.network),
      fitness: Number(individual.fitness) || 0,
      visualizationChangedConnections: Array.isArray(individual.visualizationChangedConnections)
        ? individual.visualizationChangedConnections.filter((key) => typeof key === "string")
        : [],
      visualizationParentIds: normalizeParentIds(individual.visualizationParentIds),
      visualizationOrigin: typeof individual.visualizationOrigin === "string" ? individual.visualizationOrigin : "mutation",
    }));

    const maxLoadedId = this.population.reduce((max, individual) => Math.max(max, individual.id), 0);
    const loadedGenerationBest = this.population.reduce((max, individual) => Math.max(max, individual.fitness), 0);
    nextIndividualId = Math.max(nextIndividualId, Number(savedData.nextIndividualId) || 0, maxLoadedId);
    this.generation = Math.max(1, Math.floor(Number(savedData.generation) || 1));
    this.bestFitness = loadedGenerationBest;
    this.bestEver = savedData.bestEver?.network
      ? {
          id: Number(savedData.bestEver.id) || 0,
          fitness: Number(savedData.bestEver.fitness) || this.bestFitness,
          network: deserializeNetwork(savedData.bestEver.network),
        }
      : null;

    this.restoreVisualizationState(savedData.visualization || {});
    if (!this.lineageBest?.network && this.bestEver?.network) {
      this.lineageBest = {
        generation: this.generation,
        id: this.bestEver.id,
        fitness: this.bestEver.fitness,
        network: this.bestEver.network.clone(),
      };
    }
    if (!this.generationLeader?.network && this.lineageBest?.network) {
      this.generationLeader = {
        generation: this.generation,
        id: this.lineageBest.id,
        fitness: this.lineageBest.fitness,
        network: this.lineageBest.network.clone(),
      };
    }
    this.markNetworkVisualizationDirty();

    const savedSchedule = Array.isArray(savedData.progress?.schedule)
      ? savedData.progress.schedule
          .filter((pair) => Array.isArray(pair) && pair.length === 2)
          .map(([indexA, indexB]) => [
            clamp(Math.floor(Number(indexA) || 0), 0, this.population.length - 1),
            clamp(Math.floor(Number(indexB) || 0), 0, this.population.length - 1),
          ])
      : [];

    this.schedule = ensureTournamentSchedule(savedSchedule, this.population.length, this.config.tournamentGames);
    this.matchCursor = clamp(
      Math.floor(Number(savedData.progress?.matchCursor) || 0),
      0,
      Math.max(0, this.schedule.length),
    );
  }

  restoreCurrentMatch(savedMatch) {
    const pair = this.schedule[this.matchCursor];
    if (!pair) {
      return false;
    }

    const [indexA, indexB] = pair;
    this.currentA = this.population[indexA];
    this.currentB = this.population[indexB];

    if (!this.currentA || !this.currentB) {
      return false;
    }

    const match = new FootballMatch(this.currentA, this.currentB, this.config, this.onLog);
    match.setGoalWidth(savedMatch.goalWidth ?? this.config.goalWidth);
    match.time = Number(savedMatch.time) || 0;
    match.duration = Math.max(1, Number(savedMatch.duration) || match.duration);
    match.done = Boolean(savedMatch.done);
    match.score = {
      A: Number(savedMatch.score?.A) || 0,
      B: Number(savedMatch.score?.B) || 0,
    };
    match.teamFitness = {
      A: Number(savedMatch.teamFitness?.A) || 0,
      B: Number(savedMatch.teamFitness?.B) || 0,
    };
    match.fitnessBreakdown = {
      A: { ...createEmptyFitnessBreakdown(), ...(savedMatch.fitnessBreakdown?.A || {}) },
      B: { ...createEmptyFitnessBreakdown(), ...(savedMatch.fitnessBreakdown?.B || {}) },
    };
    match.ball = {
      x: toFiniteNumber(savedMatch.ball?.x, match.ball.x),
      y: toFiniteNumber(savedMatch.ball?.y, match.ball.y),
      vx: toFiniteNumber(savedMatch.ball?.vx, 0),
      vy: toFiniteNumber(savedMatch.ball?.vy, 0),
      radius: FIELD.ballRadius,
      lastTouchTeam: savedMatch.ball?.lastTouchTeam === "B"
        ? "B"
        : savedMatch.ball?.lastTouchTeam === "A"
          ? "A"
          : null,
    };
    match.ballTrail = Array.isArray(savedMatch.ballTrail) && savedMatch.ballTrail.length
      ? savedMatch.ballTrail.map((point) => ({ x: Number(point.x) || 0, y: Number(point.y) || 0 }))
      : [{ x: match.ball.x, y: match.ball.y }];

    if (Array.isArray(savedMatch.players) && savedMatch.players.length === match.players.length) {
      match.players = savedMatch.players.map((player) => ({
        team: player.team === "B" ? "B" : "A",
        network: (player.team === "B" ? this.currentB : this.currentA).network,
        x: Number(player.x) || 0,
        y: Number(player.y) || 0,
        vx: Number(player.vx) || 0,
        vy: Number(player.vy) || 0,
        dir: Number(player.dir) || 0,
        radius: Number(player.radius) || FIELD.playerRadius,
        isTouchingBall: Boolean(player.isTouchingBall),
      }));
    }

    this.currentMatch = match;
    return true;
  }

  createPopulation(config) {
    const layers = [INPUT_SIZE];
    for (let i = 0; i < config.hiddenLayers; i += 1) {
      layers.push(config.neuronsPerLayer);
    }
    layers.push(OUTPUT_SIZE);

    return Array.from({ length: config.populationSize }, () => ({
      id: nextIndividualId += 1,
      network: NeuralNetwork.random(layers),
      fitness: 0,
      visualizationChangedConnections: [],
      visualizationParentIds: [],
      visualizationOrigin: "initial",
    }));
  }

  prepareGeneration() {
    this.bestFitness = 0;
    for (const individual of this.population) {
      individual.fitness = 0;
    }

    this.generationLeader = null;
    this.config.tournamentGames = normalizeTournamentGames(this.config?.tournamentGames, this.population.length);
    this.schedule = buildTournamentSchedule(this.population.length, this.config.tournamentGames);
    this.matchCursor = 0;
    this.markNetworkVisualizationDirty();
    this.loadNextMatch();
  }

  loadNextMatch() {
    const [indexA, indexB] = this.schedule[this.matchCursor] || [];
    if (indexA === undefined || indexB === undefined) {
      this.finishGeneration();
      return;
    }

    this.currentA = this.population[indexA];
    this.currentB = this.population[indexB];
    this.currentMatch = new FootballMatch(this.currentA, this.currentB, this.config, this.onLog);
  }

  step(simulationSeconds) {
    if (!this.running || !this.currentMatch || simulationSeconds <= 0) return;

    let remaining = simulationSeconds;
    let safety = 0;

    while (remaining > 0 && this.running && this.currentMatch && safety < 5000) {
      const dt = Math.min(STEP_DT, remaining);
      this.currentMatch.step(dt);
      remaining -= dt;
      safety += 1;

      if (this.currentMatch.done) {
        this.completeCurrentMatch();
      }
    }
  }

  completeCurrentMatch() {
    this.currentA.fitness += this.currentMatch.teamFitness.A;
    this.currentB.fitness += this.currentMatch.teamFitness.B;

    this.updateGenerationLeader(this.currentA);
    this.updateGenerationLeader(this.currentB);
    this.recordCompletedMatch();
    this.bestFitness = Math.max(this.bestFitness, this.currentA.fitness, this.currentB.fitness);
    this.matchCursor += 1;

    if (this.matchCursor >= this.schedule.length) {
      this.finishGeneration();
    } else {
      this.loadNextMatch();
    }
  }

  updateTournamentGames(tournamentGames) {
    if (!this.config) {
      return 1;
    }

    const normalized = normalizeTournamentGames(tournamentGames, this.population.length || this.config.populationSize);
    this.config.tournamentGames = normalized;
    this.schedule = ensureTournamentSchedule(this.schedule, this.population.length, normalized);
    this.matchCursor = clamp(this.matchCursor, 0, Math.max(0, this.schedule.length));
    return normalized;
  }

  updateGoalWidth(goalWidth) {
    if (!this.config) {
      return FIELD.goalWidth;
    }

    const normalized = normalizeGoalWidth(goalWidth);
    this.config.goalWidth = normalized;
    if (this.currentMatch) {
      this.currentMatch.setGoalWidth(normalized);
    }
    return normalized;
  }

  updateNetworkVizHistoryDepth(historyDepth) {
    if (!this.config) {
      return DEFAULT_NETWORK_VIZ_HISTORY_DEPTH;
    }

    const normalized = normalizeNetworkVizHistoryDepth(historyDepth);
    this.config.networkVizHistoryDepth = normalized;
    this.lineageHistory = trimVisualizationHistory(this.lineageHistory, normalized);
    this.generationTimeline = trimGenerationTimeline(this.generationTimeline, normalized);
    this.networkVizHistoryOffset = normalizeNetworkVizHistoryOffset(this.networkVizHistoryOffset, Math.max(0, this.lineageHistory.length - 1));
    this.markNetworkVisualizationDirty();
    return normalized;
  }

  updateNetworkVizHistoryOffset(offset) {
    this.networkVizHistoryOffset = normalizeNetworkVizHistoryOffset(offset, Math.max(0, this.lineageHistory.length - 1));
    this.markNetworkVisualizationDirty();
    return this.networkVizHistoryOffset;
  }

  updateMatchDuration(matchMinutes) {
    if (!this.config) {
      return 10;
    }

    const minutes = clamp(Math.round(matchMinutes || 10), 1, 10);
    this.config.matchMinutes = minutes;

    if (this.currentMatch) {
      this.currentMatch.setDurationMinutes(minutes);

      if (this.currentMatch.done) {
        this.onLog(`Длительность снижена до ${minutes} мин. Текущий матч завершён досрочно.`);
        this.completeCurrentMatch();
        return minutes;
      }
    }

    this.onLog(`Длительность текущего и следующих матчей: ${minutes} мин.`);
    return minutes;
  }

  skipCurrentMatch() {
    if (!this.running || !this.currentMatch) {
      return false;
    }

    const skippedLabel = `${this.currentA.id} vs ${this.currentB.id}`;
    let safety = 0;

    while (this.currentMatch && !this.currentMatch.done && safety < 20000) {
      this.currentMatch.step(STEP_DT);
      safety += 1;
    }

    if (this.currentMatch?.done) {
      this.completeCurrentMatch();
      this.onLog(`Матч ${skippedLabel} пропущен. Открыт следующий матч.`);
      return true;
    }

    return false;
  }

  finishGeneration() {
    const ranked = [...this.population].sort((a, b) => b.fitness - a.fitness);
    const generationEntry = {
      generation: this.generation,
      individuals: ranked.map((individual) => ({
        generation: this.generation,
        id: individual.id,
        fitness: individual.fitness,
        parentIds: normalizeParentIds(individual.visualizationParentIds),
        changedConnections: Array.isArray(individual.visualizationChangedConnections)
          ? individual.visualizationChangedConnections.filter((key) => typeof key === "string")
          : [],
        createdBy: typeof individual.visualizationOrigin === "string" ? individual.visualizationOrigin : this.generation <= 1 ? "initial" : "mutation",
        snapshot: {
          generation: this.generation,
          id: individual.id,
          fitness: individual.fitness,
          network: individual.network.clone(),
        },
      })),
    };
    const leaderRecord = generationEntry.individuals[0];
    const leaderSnapshot = leaderRecord?.snapshot || null;
    const changedConnections = leaderRecord?.changedConnections || [];

    this.lineageBest = leaderSnapshot;
    this.generationLeader = leaderSnapshot
      ? { ...leaderSnapshot, network: leaderSnapshot.network.clone() }
      : null;
    const historyDepth = normalizeNetworkVizHistoryDepth(this.config?.networkVizHistoryDepth);
    this.lineageHistory = [
      {
        generation: this.generation,
        snapshot: leaderSnapshot,
        changedConnections,
        parentIds: [...(leaderRecord?.parentIds || [])],
        createdBy: leaderRecord?.createdBy || "mutation",
      },
      ...normalizeVisualizationHistory(this.lineageHistory),
    ].slice(0, historyDepth);
    this.generationTimeline = [...this.generationTimeline, generationEntry].slice(-historyDepth);
    this.markNetworkVisualizationDirty();

    if (leaderSnapshot && (!this.bestEver || leaderSnapshot.fitness > this.bestEver.fitness)) {
      this.bestEver = {
        id: leaderSnapshot.id,
        fitness: leaderSnapshot.fitness,
        network: leaderSnapshot.network.clone(),
      };
    }

    if (leaderSnapshot) {
      this.onLog(
        `Поколение ${this.generation}: лучший #${leaderSnapshot.id} с фитнесом ${leaderSnapshot.fitness.toFixed(2)}.`,
      );
    }

    const eliteCount = Math.max(2, Math.floor(this.population.length * 0.25));
    const nextGeneration = [];

    for (let i = 0; i < eliteCount; i += 1) {
      nextGeneration.push({
        id: nextIndividualId += 1,
        network: ranked[i].network.clone(),
        fitness: 0,
        visualizationChangedConnections: [],
        visualizationParentIds: [ranked[i].id],
        visualizationOrigin: "elite",
      });
    }

    const mutationSettings = normalizeMutationSettings(this.config?.mutationSettings);
    const crossoverRate = normalizeCrossoverRate(this.config?.crossoverRate);

    while (nextGeneration.length < this.population.length) {
      const parentA = this.pickParent(ranked, eliteCount);
      const useCrossover = crossoverRate > 0 && random() < crossoverRate;
      const parentB = useCrossover ? this.pickParent(ranked, eliteCount) : null;
      const baseNetwork = useCrossover && parentB
        ? parentA.network.crossover(parentB.network)
        : parentA.network.clone();
      const child = baseNetwork.mutate(mutationSettings.rate, mutationSettings.amount);
      const visualizationChangedConnections = useCrossover && parentB
        ? [...new Set([
            ...getChangedConnectionKeys(parentA.network, child),
            ...getChangedConnectionKeys(parentB.network, child),
          ])]
        : getChangedConnectionKeys(parentA.network, child);

      nextGeneration.push({
        id: nextIndividualId += 1,
        network: child,
        fitness: 0,
        visualizationChangedConnections,
        visualizationParentIds: useCrossover && parentB ? [parentA.id, parentB.id] : [parentA.id],
        visualizationOrigin: useCrossover ? "crossover" : "mutation",
      });
    }

    this.population = nextGeneration;
    this.generation += 1;
    this.prepareGeneration();
    savePopulation(this);
  }

  pickParent(ranked, eliteCount) {
    const poolSize = Math.max(2, eliteCount + 1);
    let best = ranked[Math.floor(random() * poolSize)];

    for (let i = 0; i < 2; i += 1) {
      const candidate = ranked[Math.floor(random() * poolSize)];
      if (candidate.fitness > best.fitness) {
        best = candidate;
      }
    }

    return best;
  }

  getStatus() {
    return {
      generation: this.generation,
      matchInfo: this.currentMatch
        ? `${this.matchCursor + 1}/${this.schedule.length} · ${this.currentA.id} vs ${this.currentB.id}`
        : "—",
      gamesPerSecond: this.getMatchesPerSecond(),
      bestFitness: this.bestFitness,
      bestEverFitness: this.bestEver?.fitness || 0,
      currentMatch: this.currentMatch,
      networkViz: this.getNetworkVisualizationData(),
    };
  }
}

function senseTargets(player, targets) {
  const sensors = Array(SENSOR_COUNT).fill(0);

  for (const target of targets) {
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const distance = Math.max(0, Math.hypot(dx, dy) - (target.radius || 0));

    if (distance > MAX_SIGHT) continue;

    const angle = normalizeAngle(Math.atan2(dy, dx) - player.dir);
    const normalized = (angle + Math.PI) / (Math.PI * 2);
    const sector = Math.min(SENSOR_COUNT - 1, Math.floor(normalized * SENSOR_COUNT));
    const intensity = 1 - clamp(distance / MAX_SIGHT, 0, 1);
    sensors[sector] = Math.max(sensors[sector], intensity);
  }

  return sensors;
}

function senseDirectionAndDistance(player, target) {
  if (!target) {
    return [0, 1];
  }

  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const distance = Math.max(0, Math.hypot(dx, dy) - (target.radius || 0));
  const angle = normalizeAngle(Math.atan2(dy, dx) - player.dir);

  return [
    clamp(angle / Math.PI, -1, 1),
    clamp(distance / MAX_SIGHT, 0, 1),
  ];
}

function senseBoundaries(player) {
  const sensors = Array(SENSOR_COUNT).fill(0);

  for (let i = 0; i < SENSOR_COUNT; i += 1) {
    const angle = player.dir - Math.PI + (i + 0.5) * ((Math.PI * 2) / SENSOR_COUNT);
    const distance = distanceToBoundary(player.x, player.y, angle);
    sensors[i] = 1 - clamp(distance / MAX_SIGHT, 0, 1);
  }

  return sensors;
}

function distanceToBoundary(x, y, angle) {
  const distances = [];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  if (Math.abs(cos) > 0.0001) {
    const left = (0 - x) / cos;
    const right = (FIELD.width - x) / cos;

    const yLeft = y + left * sin;
    const yRight = y + right * sin;

    if (left > 0 && yLeft >= 0 && yLeft <= FIELD.height) distances.push(left);
    if (right > 0 && yRight >= 0 && yRight <= FIELD.height) distances.push(right);
  }

  if (Math.abs(sin) > 0.0001) {
    const top = (0 - y) / sin;
    const bottom = (FIELD.height - y) / sin;

    const xTop = x + top * cos;
    const xBottom = x + bottom * cos;

    if (top > 0 && xTop >= 0 && xTop <= FIELD.width) distances.push(top);
    if (bottom > 0 && xBottom >= 0 && xBottom <= FIELD.width) distances.push(bottom);
  }

  if (!distances.length) return MAX_SIGHT;
  return Math.min(...distances);
}

function resolveElasticCollision(a, b, elasticity = 0.9) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy) || 0.0001;
  const minDistance = a.radius + b.radius;

  if (distance >= minDistance) {
    return { touching: false, impact: 0, initiator: null };
  }

  const nx = dx / distance;
  const ny = dy / distance;
  const overlap = minDistance - distance;

  const aTowardB = Math.max(0, a.vx * nx + a.vy * ny);
  const bTowardA = Math.max(0, -(b.vx * nx + b.vy * ny));
  let initiator = null;

  if (aTowardB > bTowardA + 0.05) {
    initiator = a;
  } else if (bTowardA > aTowardB + 0.05) {
    initiator = b;
  } else if (aTowardB > 0 || bTowardA > 0) {
    initiator = aTowardB >= bTowardA ? a : b;
  }

  a.x -= nx * overlap * 0.5;
  a.y -= ny * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.y += ny * overlap * 0.5;

  const relVel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (relVel >= 0) {
    return { touching: true, impact: 0, initiator };
  }

  const impulse = (-(1 + elasticity) * relVel) / 2;
  a.vx -= impulse * nx;
  a.vy -= impulse * ny;
  b.vx += impulse * nx;
  b.vy += impulse * ny;

  return { touching: true, impact: Math.abs(relVel), initiator };
}

function applySidebarState() {
  ui.appShell.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  ui.sidebarToggle.setAttribute("aria-expanded", String(!state.sidebarCollapsed));
  ui.sidebarToggle.title = state.sidebarCollapsed ? "Показать панель" : "Скрыть панель";
  ui.sidebarToggle.textContent = state.sidebarCollapsed ? "☰" : "✕";
}

function updatePlaybackControls() {
  const hasActiveTraining = Boolean(state.workerStatus?.running);
  ui.pauseBtn.disabled = !hasActiveTraining;
  ui.pauseBtn.textContent = state.isPaused ? "Возобновить" : "Пауза";
  ui.skipBtn.hidden = state.stepsPerFrame !== SLOW_STEPS;
  ui.skipBtn.disabled = !hasActiveTraining || state.isPaused;
}

function applyPitchWidth() {
  state.pitchWidth = Math.round(Math.min(1800, Math.max(1, state.pitchWidth)));
  ui.pitchStage.style.width = `${state.pitchWidth}px`;
  if (ui.networkVizPanel) {
    ui.networkVizPanel.style.width = `${state.pitchWidth}px`;
  }
  state.networkVizVersionRendered = null;
  drawNetworkVisualization();
}

function getPitchResizeMode(clientX, clientY) {
  const rect = ui.pitchStage.getBoundingClientRect();
  const edgeSize = 18;
  const onRightEdge = rect.right - clientX <= edgeSize;
  const onBottomEdge = rect.bottom - clientY <= edgeSize;

  if (onRightEdge && onBottomEdge) return "corner";
  if (onRightEdge) return "right";
  if (onBottomEdge) return "bottom";
  return null;
}

function getPitchResizeCursor(mode) {
  if (mode === "corner") return "nwse-resize";
  if (mode === "right") return "ew-resize";
  if (mode === "bottom") return "ns-resize";
  return "default";
}

function updatePitchResizeCursor(event) {
  if (state.pitchResize) return;
  const mode = getPitchResizeMode(event.clientX, event.clientY);
  ui.pitchStage.style.cursor = getPitchResizeCursor(mode);
}

function startPitchResize(event) {
  const mode = getPitchResizeMode(event.clientX, event.clientY);
  if (!mode) return;

  event.preventDefault();
  const rect = ui.pitchStage.getBoundingClientRect();
  state.pitchResize = {
    mode,
    startX: event.clientX,
    startY: event.clientY,
    startWidth: rect.width,
    startHeight: rect.height,
  };
  ui.pitchStage.classList.add("is-resizing");
  ui.pitchStage.style.cursor = getPitchResizeCursor(mode);
}

function handlePitchResize(event) {
  if (!state.pitchResize) return;

  const aspectRatio = FIELD.width / FIELD.height;
  const { mode, startX, startY, startWidth, startHeight } = state.pitchResize;
  const deltaX = event.clientX - startX;
  const deltaY = event.clientY - startY;

  let nextWidth = startWidth;

  if (mode === "right") {
    nextWidth = startWidth + deltaX;
  } else if (mode === "bottom") {
    nextWidth = (startHeight + deltaY) * aspectRatio;
  } else if (mode === "corner") {
    const widthFromRight = startWidth + deltaX;
    const widthFromBottom = (startHeight + deltaY) * aspectRatio;
    nextWidth = Math.max(widthFromRight, widthFromBottom);
  }

  state.pitchWidth = nextWidth;
  applyPitchWidth();
}

function stopPitchResize() {
  if (!state.pitchResize) return;
  state.pitchResize = null;
  ui.pitchStage.classList.remove("is-resizing");
  ui.pitchStage.style.cursor = "default";
}

function readConfig() {
  return {
    teamSize: clamp(Number(ui.teamSize.value) || 4, 1, 8),
    hiddenLayers: clamp(Number(ui.hiddenLayers.value) || 1, 1, 4),
    neuronsPerLayer: clamp(Number(ui.neuronsPerLayer.value) || 40, 4, 500),
    populationSize: clamp(Number(ui.populationSize.value) || 11, 4, 40),
    tournamentGames: normalizeTournamentGames(ui.tournamentGames.value || 30, ui.populationSize.value || 11),
    matchMinutes: clamp(Math.round(Number(ui.matchMinutes.value) || 2), 1, 10),
    goalWidth: normalizeGoalWidth(ui.goalWidth.value),
    speedPreset: state.speedPreset,
    speedMultiplier: state.speedMultiplier,
    useMaxSpeed: state.useMaxSpeed,
    showTimeIndicator: ui.showTimeToggle.checked,
    showFieldStripes: ui.showFieldStripesToggle.checked,
    fitnessSettings: readFitnessSettings(),
    crossoverRate: normalizeCrossoverRate(ui.crossoverRate?.value),
    mutationSettings: readMutationSettings(),
    networkVizHistoryDepth: normalizeNetworkVizHistoryDepth(ui.networkVizHistoryDepth?.value),
    autoSaveHours: normalizeAutoSaveHours(ui.autoSaveHours?.value),
  };
}

function drawField(match = null) {
  if (!ctx) return;
  ctx.clearRect(0, 0, ui.canvas.width, ui.canvas.height);

  if (state.showFieldStripes) {
    const stripeCount = 4;
    const stripeWidth = ui.canvas.width / stripeCount;
    for (let i = 0; i < stripeCount; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? "#2f9f49" : "#23833b";
      ctx.fillRect(i * stripeWidth, 0, stripeWidth + 1, ui.canvas.height);
    }
  } else {
    ctx.fillStyle = "#23833b";
    ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, ui.canvas.width - 2, ui.canvas.height - 2);

  ctx.beginPath();
  ctx.moveTo(ui.canvas.width / 2, 0);
  ctx.lineTo(ui.canvas.width / 2, ui.canvas.height);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(ui.canvas.width / 2, ui.canvas.height / 2, 90, 0, Math.PI * 2);
  ctx.stroke();

  const goalWidth = normalizeGoalWidth(match?.goalWidth ?? ui.goalWidth?.value ?? FIELD.goalWidth);
  const goalHeightPx = goalWidth * FIELD.pxPerMeter;
  const goalTopPx = (ui.canvas.height - goalHeightPx) / 2;

  ctx.strokeRect(0, goalTopPx, 70, goalHeightPx);
  ctx.strokeRect(ui.canvas.width - 70, goalTopPx, 70, goalHeightPx);

  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(0, goalTopPx, 12, goalHeightPx);
  ctx.fillRect(ui.canvas.width - 12, goalTopPx, 12, goalHeightPx);
}

function drawMatch(match) {
  if (!ctx) return;
  drawField(match);

  if (!match) {
    drawCenterText("Ожидание запуска обучения");
    return;
  }

  if (!state.showGames) {
    drawCenterText("Показ матчей отключён — обучение идёт в фоне");
    return;
  }

  const ballSpeed = Math.hypot(match.ball.vx, match.ball.vy);
  if (
    state.stepsPerFrame === FAST_STEPS &&
    ballSpeed >= BALL_TRAIL_SPEED_THRESHOLD &&
    match.ballTrail.length > 1
  ) {
    for (let i = 1; i < match.ballTrail.length; i += 1) {
      const prev = match.ballTrail[i - 1];
      const curr = match.ballTrail[i];
      const alpha = i / match.ballTrail.length;

      ctx.beginPath();
      ctx.moveTo(prev.x * FIELD.pxPerMeter, prev.y * FIELD.pxPerMeter);
      ctx.lineTo(curr.x * FIELD.pxPerMeter, curr.y * FIELD.pxPerMeter);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.08 + alpha * 0.45})`;
      ctx.lineWidth = 1.5 + alpha * 2.5;
      ctx.stroke();
    }
  }

  for (const player of match.players) {
    const x = player.x * FIELD.pxPerMeter;
    const y = player.y * FIELD.pxPerMeter;
    const radius = player.radius * FIELD.pxPerMeter;

    ctx.fillStyle = TEAM_COLORS[player.team];
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#082032";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(player.dir) * radius * 1.5, y + Math.sin(player.dir) * radius * 1.5);
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(match.ball.x * FIELD.pxPerMeter, match.ball.y * FIELD.pxPerMeter, match.ball.radius * FIELD.pxPerMeter, 0, Math.PI * 2);
  ctx.fill();

  const totalSeconds = Math.max(1, Number(match.duration) || 1);
  const progress = clamp(match.time / totalSeconds, 0, 1);

  const overlayX = 14;
  const overlayY = 14;
  const overlayGap = 4;
  const overlayTotalWidth = ui.canvas.width * 0.25;
  const scoreBoxHeight = 40;
  const timeBoxHeight = 40;
  const scoreBoxX = overlayX;
  const scoreBoxY = overlayY;
  const scoreCenterY = scoreBoxY + scoreBoxHeight / 2;
  const scoreText = `${match.score.A} : ${match.score.B}`;

  ctx.font = "bold 20px Inter, sans-serif";
  const scoreBoxWidth = Math.max(40, Math.ceil(ctx.measureText(scoreText).width + 18));
  const baseTimeBoxWidth = Math.max(28, overlayTotalWidth - scoreBoxWidth - overlayGap);
  const timeBoxWidth = Math.max(18, Math.round(baseTimeBoxWidth * 0.6));

  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.fillRect(scoreBoxX, scoreBoxY, scoreBoxWidth, scoreBoxHeight);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px Inter, sans-serif";
  ctx.fillText(scoreText, scoreBoxX + scoreBoxWidth / 2, scoreCenterY + 0.5);

  if (state.showTimeIndicator) {
    const timeBoxX = scoreBoxX + scoreBoxWidth + overlayGap;
    const timeBoxY = overlayY;
    const timeBarX = timeBoxX + 4;
    const timeBarY = timeBoxY + 8;
    const timeBarWidth = Math.max(18, timeBoxWidth - 8);
    const timeBarHeight = timeBoxHeight - 16;
    const fillWidth = timeBarWidth * progress;

    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect(timeBoxX, timeBoxY, timeBoxWidth, timeBoxHeight);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(timeBarX, timeBarY, timeBarWidth, timeBarHeight);
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(timeBarX, timeBarY, fillWidth, timeBarHeight);

    ctx.save();
    ctx.beginPath();
    ctx.rect(timeBarX, timeBarY, fillWidth, timeBarHeight);
    ctx.clip();
    ctx.strokeStyle = "rgba(255,255,255,0.26)";
    ctx.lineWidth = 4;
    for (let stripeX = timeBarX - timeBarHeight; stripeX < timeBarX + fillWidth + timeBarHeight; stripeX += 12) {
      ctx.beginPath();
      ctx.moveTo(stripeX, timeBarY + timeBarHeight);
      ctx.lineTo(stripeX + timeBarHeight, timeBarY);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1;
    ctx.strokeRect(timeBarX, timeBarY, timeBarWidth, timeBarHeight);
  }
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function drawCenterText(text) {
  if (!ctx) return;
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, ui.canvas.width / 2, ui.canvas.height / 2);
  ctx.textAlign = "start";
}

function resizeCanvasToDisplaySize(canvas) {
  if (!canvas) {
    return { width: 0, height: 0, ratio: 1 };
  }

  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  return { width, height, ratio };
}

function mixColor(base, highlight, t = 0) {
  const clamped = clamp(t, 0, 1);
  return {
    r: Math.round(lerp(base.r, highlight.r, clamped)),
    g: Math.round(lerp(base.g, highlight.g, clamped)),
    b: Math.round(lerp(base.b, highlight.b, clamped)),
    a: lerp(base.a, highlight.a, clamped),
  };
}

function colorToCss(color) {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
}

function getConnectionStyle() {
  const recentColor = { r: 255, g: 98, b: 98, a: 0.9 };

  return {
    strokeStyle: colorToCss(recentColor),
    lineWidth: 1,
  };
}

function drawNetworkVisualization(data = state.networkVizData) {
  if (!ui.networkVizCanvas || !networkVizCtx) {
    return;
  }

  const { width, height, ratio } = resizeCanvasToDisplaySize(ui.networkVizCanvas);
  const version = data?.version ?? null;
  if (
    version === state.networkVizVersionRendered
    && width === state.networkVizRenderWidth
    && height === state.networkVizRenderHeight
  ) {
    return;
  }

  state.networkVizVersionRendered = version;
  state.networkVizRenderWidth = width;
  state.networkVizRenderHeight = height;

  const viz = networkVizCtx;
  viz.clearRect(0, 0, width, height);

  const background = viz.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, "rgba(8, 20, 30, 0.98)");
  background.addColorStop(1, "rgba(14, 28, 42, 1)");
  viz.fillStyle = background;
  viz.fillRect(0, 0, width, height);

  if (!data?.layers?.length) {
    ui.networkVizStatus.textContent = "Запустите обучение, чтобы увидеть эволюцию связей лучшей особи.";
    updateNetworkVizNavigation(null);
    viz.fillStyle = "rgba(255, 255, 255, 0.86)";
    viz.font = `${Math.max(16, Math.round(18 * ratio))}px Inter, sans-serif`;
    viz.textAlign = "center";
    viz.textBaseline = "middle";
    viz.fillText("Ожидание данных нейросети", width / 2, height / 2 - 10 * ratio);
    viz.fillStyle = "rgba(155, 180, 200, 0.8)";
    viz.font = `${Math.max(12, Math.round(13 * ratio))}px Inter, sans-serif`;
    viz.fillText("Лучшие связи поколения появятся здесь автоматически", width / 2, height / 2 + 16 * ratio);
    return;
  }

  const availableHistory = Math.max(0, Math.floor(Number(data.availableHistory) || 0));
  const activeHistoryGeneration = Number.isFinite(data.activeHistoryGeneration) ? Number(data.activeHistoryGeneration) : null;
  const shownHidden = data.hiddenShownCount === data.hiddenTotalCount
    ? `${data.hiddenTotalCount}`
    : `${data.hiddenShownCount}/${data.hiddenTotalCount}`;
  const subjectGeneration = Number.isFinite(data.generation) ? Number(data.generation) : activeHistoryGeneration;
  const parentIds = normalizeParentIds(data.parentIds);
  const parentText = parentIds.length > 0
    ? parentIds.length === 1
      ? `родитель #${parentIds[0]}`
      : `родители ${parentIds.map((id) => `#${id}`).join(", ")}`
    : data.createdBy === "initial"
      ? "стартовая особь"
      : data.createdBy === "elite"
        ? "клон без мутации"
        : "родитель не сохранён";
  const changeNote = availableHistory > 0 && Number(data.activeChangedCount || 0) === 0
    ? " · новых отличий не найдено"
    : "";
  ui.networkVizStatus.textContent = `Выбрана особь: #${data.bestId ?? "—"} · G${subjectGeneration ?? "—"} · фитнес ${Number(data.bestFitness || 0).toFixed(2)} · скрытых нейронов показано ${shownHidden} · ${parentText}${changeNote}`;

  const left = 116 * ratio;
  const right = 92 * ratio;
  const top = 54 * ratio;
  const bottom = 26 * ratio;
  const layerCount = data.layers.length;
  const xStep = layerCount > 1 ? (width - left - right) / (layerCount - 1) : 0;
  const nodeRadius = Math.max(2.1 * ratio, Math.min(6 * ratio, 10 * ratio / Math.sqrt(Math.max(4, data.hiddenShownCount || 1))));
  const positions = new Map();

  data.layers.forEach((layer, layerIndex) => {
    const x = left + xStep * layerIndex;
    layer.x = x;

    if (layer.key === "input" && Array.isArray(layer.groups)) {
      const totalNodes = layer.groups.reduce((sum, group) => sum + group.nodes.length, 0);
      const groupGap = 16 * ratio;
      const usableHeight = Math.max(10, height - top - bottom - groupGap * Math.max(0, layer.groups.length - 1));
      const nodeStep = totalNodes > 1 ? usableHeight / (totalNodes - 1) : 0;
      let y = top;

      layer.groups = layer.groups.map((group) => {
        const groupStartY = y;
        for (const node of group.nodes) {
          positions.set(node.id, { x, y });
          y += nodeStep;
        }
        const groupEndY = group.nodes.length > 0 ? y - nodeStep : groupStartY;
        const centerY = (groupStartY + groupEndY) / 2;
        y += groupGap;
        return { ...group, centerY };
      });
      return;
    }

    const nodeCount = Math.max(1, layer.nodes.length);
    const spanHeight = Math.max(10, height - top - bottom);
    const nodeStep = nodeCount > 1 ? spanHeight / (nodeCount - 1) : 0;
    const startY = nodeCount > 1 ? top : top + spanHeight / 2;

    layer.nodes.forEach((node, nodeIndex) => {
      positions.set(node.id, { x, y: startY + nodeStep * nodeIndex });
    });
  });

  const visibleConnections = data.connections.filter((connection) => connection.highlighted);
  for (const connection of visibleConnections) {
    const source = positions.get(connection.from);
    const target = positions.get(connection.to);
    if (!source || !target) {
      continue;
    }

    const style = getConnectionStyle(connection);
    viz.beginPath();
    viz.moveTo(source.x, source.y);
    viz.lineTo(target.x, target.y);
    viz.strokeStyle = style.strokeStyle;
    viz.lineWidth = style.lineWidth;
    viz.stroke();
  }

  viz.textAlign = "center";
  viz.textBaseline = "bottom";
  viz.fillStyle = "rgba(232, 242, 252, 0.92)";
  viz.font = `${Math.max(12, Math.round(13 * ratio))}px Inter, sans-serif`;

  data.layers.forEach((layer) => {
    const countText = layer.actualCount === layer.shownCount
      ? `${layer.actualCount}`
      : `${layer.shownCount}/${layer.actualCount}`;
    viz.fillText(`${layer.label} · ${countText}`, layer.x, top - 14 * ratio);

    if (layer.key === "input" && Array.isArray(layer.groups)) {
      viz.textAlign = "right";
      viz.textBaseline = "middle";
      viz.fillStyle = "rgba(154, 177, 195, 0.94)";
      viz.font = `${Math.max(10, Math.round(11 * ratio))}px Inter, sans-serif`;
      layer.groups.forEach((group) => {
        viz.fillText(group.label, layer.x - 14 * ratio, group.centerY);
      });
      viz.textAlign = "center";
      viz.textBaseline = "bottom";
      viz.fillStyle = "rgba(232, 242, 252, 0.92)";
      viz.font = `${Math.max(12, Math.round(13 * ratio))}px Inter, sans-serif`;
    }
  });

  for (const layer of data.layers) {
    for (const node of layer.nodes) {
      const position = positions.get(node.id);
      if (!position) {
        continue;
      }

      const isOutput = layer.key === "output";
      const isInput = layer.key === "input";
      viz.beginPath();
      viz.arc(position.x, position.y, nodeRadius, 0, Math.PI * 2);
      viz.fillStyle = isOutput ? "rgba(116, 240, 184, 0.95)" : isInput ? "rgba(132, 203, 255, 0.96)" : "rgba(229, 241, 252, 0.88)";
      viz.fill();
      viz.lineWidth = Math.max(1, 1.1 * ratio);
      viz.strokeStyle = isOutput ? "rgba(24, 70, 53, 0.95)" : "rgba(20, 36, 50, 0.95)";
      viz.stroke();

      if (isOutput) {
        viz.fillStyle = "rgba(234, 244, 255, 0.95)";
        viz.font = `${Math.max(11, Math.round(12 * ratio))}px Inter, sans-serif`;
        viz.textAlign = "left";
        viz.textBaseline = "middle";
        viz.fillText(node.label, position.x + 10 * ratio, position.y);
      }
    }
  }

  viz.textAlign = "right";
  viz.textBaseline = "top";
  viz.fillStyle = "rgba(154, 177, 195, 0.9)";
  viz.font = `${Math.max(10, Math.round(11 * ratio))}px Inter, sans-serif`;
  const historyLabel = subjectGeneration
    ? `G${subjectGeneration} · #${data.bestId ?? "—"}`
    : "Выбор особи";
  viz.fillText(historyLabel, width - 12 * ratio, 10 * ratio);
}

function updateStats(frameTime = performance.now()) {
  const status = state.workerStatus || state.trainer?.getStatus?.() || {
    generation: 0,
    matchInfo: "—",
    gamesPerSecond: 0,
    bestFitness: 0,
    currentMatch: null,
  };
  const renderedMatch = getRenderedMatch(frameTime);
  const displayMatch = renderedMatch || status.currentMatch;

  ui.generation.textContent = String(status.generation);
  ui.matchInfo.textContent = status.matchInfo;
  ui.gamesPerSecond.textContent = formatGamesPerSecond(status.gamesPerSecond);
  ui.bestFitness.textContent = Number(status.bestFitness || 0).toFixed(2);
  ui.modeInfo.textContent = state.isPaused ? `${state.mode} · пауза` : state.mode;
  ui.renderInfo.textContent = state.showGames ? "Вкл." : "Выкл.";

  if (!state.generationTimeline.length && status.networkViz) {
    state.networkVizData = selectNetworkVizHistoryEntry(status.networkViz, state.networkVizHistoryOffset);
    updateNetworkVizNavigation(state.networkVizData);
  }

  updatePlaybackControls();
  updateMatchFitnessTables(status.currentMatch);
  if (!state.useWorkerRenderer) {
    drawMatch(displayMatch);
  }
  drawGenerationFlow();
  drawNetworkVisualization(state.networkVizData);
}

function tick(timestamp) {
  updateStats(timestamp);
  requestAnimationFrame(tick);
}

ui.startBtn.addEventListener("click", () => {
  ensureWorker();
  clearLogs();
  nextIndividualId = 0;
  state.trainer = null;
  state.workerStatus = null;
  state.previousWorkerStatus = null;
  state.workerStatusAt = 0;
  state.previousWorkerStatusAt = 0;
  state.workerSaveData = null;
  state.generationTimeline = [];
  state.generationFlowHitboxes = [];
  state.selectedVisualizationGeneration = null;
  state.selectedVisualizationIndividualId = null;
  state.networkVizData = null;
  state.networkVizVersionRendered = null;
  state.generationFlowVersionRendered = null;
  state.networkVizHistoryOffset = 0;
  state.isPaused = false;
  const config = readConfig();
  saveSettingsToLocalStorage(config);
  postToWorker("startNew", { config, resetIds: true });
});

ui.saveFileBtn.addEventListener("click", async () => {
  const savedData = await requestLatestSaveData();
  if (!savedData?.population?.length) {
    addLog("Нет данных обучения для сохранения в файл.");
    return;
  }

  savePopulation(savedData);
  const fileName = exportPopulationToFile(state.savedPopulationData || savedData);
  if (fileName) {
    addLog(`Состояние обучения сохранено в файл: ${fileName}.`);
  }
});

ui.loadFileBtn.addEventListener("click", () => {
  ui.loadFileInput.value = "";
  ui.loadFileInput.click();
});

ui.loadFileInput.addEventListener("change", async () => {
  const [file] = ui.loadFileInput.files || [];
  if (!file) {
    return;
  }

  try {
    const raw = await file.text();
    const payload = JSON.parse(raw);
    const savedData = applyLoadedPopulationPayload(payload);
    startTrainingFromSavedData(savedData, `файла ${file.name}`);
  } catch (error) {
    console.error("Не удалось загрузить файл сохранения:", error);
    updateSaveStatus(state.savedPopulationData, "Не удалось загрузить файл сохранения.");
    addLog(`Ошибка загрузки файла: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    ui.loadFileInput.value = "";
  }
});

ui.slowBtn.addEventListener("click", () => {
  applySpeedState({ preset: "slow", useMaxSpeed: false, persist: true });
});

ui.fastBtn.addEventListener("click", () => {
  applySpeedState({ preset: "fast", useMaxSpeed: false, persist: true });
});

ui.ultraBtn.addEventListener("click", () => {
  applySpeedState({ preset: "ultra", useMaxSpeed: false, persist: true });
});

ui.maxBtn.addEventListener("click", () => {
  applySpeedState({ preset: state.speedPreset === "max" ? "ultra" : state.speedPreset, useMaxSpeed: true, persist: true });
});

ui.speedMultiplier.addEventListener("change", () => {
  applySpeedState({ multiplier: ui.speedMultiplier.value, useMaxSpeed: state.useMaxSpeed, persist: true });
});

ui.showBtn.addEventListener("click", () => {
  state.showGames = true;
  postToWorker("updateConfig", { showGames: true });
  addLog("Показ матчей включён.");
});

ui.pauseBtn.addEventListener("click", () => {
  if (!state.workerStatus?.running) {
    addLog("Сейчас нет активного обучения для паузы.");
    return;
  }

  state.isPaused = !state.isPaused;
  postToWorker("setPaused", { isPaused: state.isPaused });
  updatePlaybackControls();
  addLog(state.isPaused ? "Обучение поставлено на паузу." : "Обучение возобновлено.");
});

ui.showTimeToggle.addEventListener("change", () => {
  state.showTimeIndicator = ui.showTimeToggle.checked;
  postToWorker("updateConfig", { showTimeIndicator: state.showTimeIndicator });
  saveSettingsToLocalStorage();
  savePopulation();
  addLog(state.showTimeIndicator ? "Индикатор времени матча включён." : "Индикатор времени матча скрыт.");
});

ui.showFieldStripesToggle.addEventListener("change", () => {
  state.showFieldStripes = ui.showFieldStripesToggle.checked;
  postToWorker("updateConfig", { showFieldStripes: state.showFieldStripes });
  saveSettingsToLocalStorage();
  savePopulation();
  addLog(state.showFieldStripes ? "Полосы на поле включены." : "Полосы на поле скрыты.");
});

ui.sidebarToggle.addEventListener("click", () => {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  applySidebarState();
});

[
  ui.fitnessGoal,
  ui.fitnessConceded,
  ui.fitnessOwnGoal,
].forEach((input) => {
  input.addEventListener("input", () => {
    applyLiveFitnessSettings();
  });
});

ui.crossoverRate?.addEventListener("change", () => {
  const crossoverRate = applyLiveCrossoverSettings();
  addLog(
    crossoverRate <= 0
      ? "Кроссовер отключён: новые особи будут появляться только через мутацию выбранного родителя."
      : `Вероятность кроссовера обновлена: ${crossoverRate.toFixed(2)}.`,
  );
});

[
  ui.mutationRate,
  ui.mutationAmount,
].forEach((input) => {
  input.addEventListener("change", () => {
    const mutationSettings = applyLiveMutationSettings();
    addLog(`Параметры мутации обновлены: вероятность ${mutationSettings.rate.toFixed(2)}, диапазон шума ${mutationSettings.amount.toFixed(2)}.`);
  });
});

ui.generationFlowCanvas?.addEventListener("mousemove", (event) => {
  const rect = ui.generationFlowCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const hit = state.generationFlowHitboxes.find((entry) => Math.hypot(x - entry.x, y - entry.y) <= entry.radius);
  ui.generationFlowCanvas.style.cursor = hit ? "pointer" : "default";
});

ui.generationFlowCanvas?.addEventListener("click", (event) => {
  const rect = ui.generationFlowCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const hit = state.generationFlowHitboxes.find((entry) => Math.hypot(x - entry.x, y - entry.y) <= entry.radius);
  if (!hit) {
    return;
  }

  selectGenerationTimelineIndividual(hit.generation, hit.id, { log: true });
});

ui.pitchStage.addEventListener("pointerdown", startPitchResize);
ui.pitchStage.addEventListener("pointermove", updatePitchResizeCursor);
ui.pitchStage.addEventListener("pointerleave", () => {
  if (!state.pitchResize) {
    ui.pitchStage.style.cursor = "default";
  }
});
window.addEventListener("pointermove", handlePitchResize);
window.addEventListener("pointerup", stopPitchResize);
window.addEventListener("pointercancel", stopPitchResize);
window.addEventListener("resize", applyPitchWidth);
window.addEventListener("beforeunload", () => {
  postToWorker("requestSave");
  savePopulation();
});
window.addEventListener("pagehide", () => {
  postToWorker("requestSave");
  savePopulation();
});

ui.hideBtn.addEventListener("click", () => {
  state.showGames = false;
  postToWorker("updateConfig", { showGames: false });
  addLog("Показ матчей отключён.");
});

ui.matchMinutes.addEventListener("change", () => {
  const minutes = clamp(Math.round(Number(ui.matchMinutes.value) || 10), 1, 10);
  ui.matchMinutes.value = String(minutes);

  if (state.workerStatus?.running) {
    postToWorker("updateMatchDuration", { matchMinutes: minutes });
  } else {
    addLog(`Длительность новых матчей установлена: ${minutes} мин.`);
  }

  saveSettingsToLocalStorage();
});

ui.goalWidth.addEventListener("change", () => {
  const goalWidth = normalizeGoalWidth(ui.goalWidth.value);
  ui.goalWidth.value = String(goalWidth);

  if (state.workerStatus?.running) {
    postToWorker("updateConfig", { goalWidth });
  } else if (state.trainer?.running) {
    state.trainer.updateGoalWidth(goalWidth);
  }

  saveSettingsToLocalStorage();
  savePopulation();
  addLog(`Размер ворот установлен: ${goalWidth} м.`);
});

ui.tournamentGames.addEventListener("change", () => {
  const tournamentGames = normalizeTournamentGames(ui.tournamentGames.value, ui.populationSize.value);
  ui.tournamentGames.value = String(tournamentGames);

  if (state.workerStatus?.running) {
    postToWorker("updateConfig", { tournamentGames });
    addLog(`Минимум игр на особь в турнире: ${tournamentGames}. Расписание текущего поколения будет расширено при необходимости.`);
  } else {
    if (state.trainer?.running) {
      state.trainer.updateTournamentGames(tournamentGames);
    }
    addLog(`Минимум игр на особь в турнире: ${tournamentGames}.`);
  }

  saveSettingsToLocalStorage();
  savePopulation();
});

ui.networkVizHistoryDepth?.addEventListener("change", () => {
  const historyDepth = normalizeNetworkVizHistoryDepth(ui.networkVizHistoryDepth.value);
  ui.networkVizHistoryDepth.value = String(historyDepth);
  state.networkVizHistoryDepth = historyDepth;
  state.networkVizHistoryOffset = 0;

  [state.savedPopulationData, state.workerSaveData].forEach((payload) => {
    if (!payload || typeof payload !== "object") {
      return;
    }

    payload.config = {
      ...(payload.config || {}),
      networkVizHistoryDepth: historyDepth,
    };

    if (payload.visualization) {
      payload.visualization = trimVisualizationState(payload.visualization, historyDepth);
    }
  });

  if (state.workerStatus?.running) {
    postToWorker("updateConfig", { networkVizHistoryDepth: historyDepth, networkVizHistoryOffset: 0 });
  } else if (state.trainer?.running) {
    state.trainer.updateNetworkVizHistoryDepth(historyDepth);
    state.networkVizData = state.trainer.getNetworkVisualizationData();
  }

  const visualizationPayload = state.workerSaveData || state.savedPopulationData;
  if (visualizationPayload?.visualization) {
    applyVisualizationPayload(visualizationPayload);
  } else {
    state.generationTimeline = trimGenerationTimeline(state.generationTimeline, historyDepth);
    syncSelectedVisualizationFromTimeline();
  }

  saveSettingsToLocalStorage();
  savePopulation();
  addLog(`История визуализации ограничена последними ${historyDepth} поколениями.`);
});

ui.autoSaveHours?.addEventListener("change", () => {
  const autoSaveHours = applyAutoSaveSettings(ui.autoSaveHours.value, { persist: true, notifyWorker: true });
  addLog(
    autoSaveHours > 0
      ? `Автосохранение включено: каждые ${formatAutoSaveHours(autoSaveHours)} ч.`
      : "Автосохранение выключено.",
  );
});

[
  ui.teamSize,
  ui.hiddenLayers,
  ui.neuronsPerLayer,
  ui.populationSize,
].forEach((input) => {
  input?.addEventListener("change", () => {
    saveSettingsToLocalStorage();
  });
});

ui.skipBtn.addEventListener("click", () => {
  if (!state.workerStatus?.running) {
    addLog("Сейчас нет активного матча для пропуска.");
    return;
  }

  postToWorker("skipMatch");
});

applySpeedState({ notifyWorker: false, persist: false });
const storedSettings = loadSettingsFromLocalStorage();
if (storedSettings) {
  setControlsFromConfig(storedSettings);
}
updateSaveStatus(null);

applySidebarState();
applyPitchWidth();
updateStats();
requestAnimationFrame(tick);
