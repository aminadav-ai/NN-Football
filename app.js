const FIELD = {
  width: 110,
  height: 68,
  goalWidth: 20,
  playerRadius: 2,
  ballRadius: 1,
  pxPerMeter: 10,
};

const INPUT_SIZE = 48;
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
const FITNESS_SETTINGS_DEFAULTS = {
  goalReward: 35,
  concededPenalty: -10,
  ownGoalPenalty: -25,
};
const HARD_COLLISION_THRESHOLD = 1.5;
const MAX_LOG_ENTRIES = 1000;
const POPULATION_STORAGE_KEY = "flower-3.population.v1";
const FITNESS_BREAKDOWN_ROWS = [
  { key: "goals", label: "Гол сопернику" },
  { key: "conceded", label: "Пропущенный гол" },
  { key: "ownGoal", label: "Автогол" },
  { key: "total", label: "Итого", total: true },
];

const TEAM_COLORS = {
  A: "#61a8ff",
  B: "#ff8d6b",
};

const ui = {
  appShell: document.getElementById("appShell"),
  sidebarToggle: document.getElementById("sidebarToggle"),
  canvas: document.getElementById("pitch"),
  pitchStage: document.getElementById("pitchStage"),
  teamSize: document.getElementById("teamSize"),
  hiddenLayers: document.getElementById("hiddenLayers"),
  neuronsPerLayer: document.getElementById("neuronsPerLayer"),
  populationSize: document.getElementById("populationSize"),
  matchMinutes: document.getElementById("matchMinutes"),
  speedMultiplier: document.getElementById("speedMultiplier"),
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

const supportsOffscreenCanvas = typeof ui.canvas.transferControlToOffscreen === "function";
let ctx = supportsOffscreenCanvas ? null : ui.canvas.getContext("2d");

const state = {
  showGames: true,
  stepsPerFrame: FAST_STEPS,
  speedPreset: "fast",
  speedMultiplier: 1,
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

const logs = [
  "Flower-3 готов к обучению.",
  `Генератор случайных чисел инициализирован по времени: ${initialRandomSeed}.`,
  "Нажмите «Новое обучение» или загрузите последнее сохранение.",
];

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

function addLog(message) {
  logs.unshift(message);
  if (logs.length > MAX_LOG_ENTRIES) {
    logs.length = MAX_LOG_ENTRIES;
  }
  ui.log.textContent = logs.join("\n");
}

function clearLogs() {
  logs.length = 0;
  ui.log.textContent = "";
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
    if (typeof payload?.isPaused === "boolean") {
      state.isPaused = payload.isPaused;
    }
    return;
  }

  if (type === "saveData") {
    state.workerSaveData = payload || null;
    savePopulation(payload);

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

  const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
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

function readFitnessSettings() {
  return normalizeFitnessSettings({
    goalReward: readNumberInput(ui.fitnessGoal, FITNESS_SETTINGS_DEFAULTS.goalReward),
    concededPenalty: readNumberInput(ui.fitnessConceded, FITNESS_SETTINGS_DEFAULTS.concededPenalty),
    ownGoalPenalty: readNumberInput(ui.fitnessOwnGoal, FITNESS_SETTINGS_DEFAULTS.ownGoalPenalty),
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

  return fitnessSettings;
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
  ui.hiddenLayers.value = String(clamp(Number(config.hiddenLayers) || 2, 1, 4));
  ui.neuronsPerLayer.value = String(clamp(Number(config.neuronsPerLayer) || 16, 4, 64));
  ui.populationSize.value = String(clamp(Number(config.populationSize) || 12, 4, 40));
  ui.matchMinutes.value = String(clamp(Math.round(Number(config.matchMinutes) || 1), 1, 10));
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

  return new NeuralNetwork(
    data.layerSizes,
    data.weights.map((layer) => layer.map((row) => [...row])),
    data.biases.map((layer) => [...layer]),
  );
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
  ui.loadBtn.disabled = !savedData;
  ui.saveFileBtn.disabled = !savedData && !state.workerSaveData?.population?.length && !state.trainer?.population?.length;
  ui.saveStatus.classList.remove("ready", "error");

  if (savedData) {
    const savedAtText = Number.isFinite(savedData.savedAt)
      ? new Date(savedData.savedAt).toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "время неизвестно";
    ui.saveStatus.textContent = `Найдено сохранение: Поколение ${savedData.generation} · ${savedAtText}`;
    ui.saveStatus.classList.add("ready");
    return;
  }

  if (errorMessage) {
    ui.saveStatus.textContent = errorMessage;
    ui.saveStatus.classList.add("error");
    return;
  }

  ui.saveStatus.textContent = "Сохранение не найдено.";
}

function buildSavePayloadFromTrainer(trainer) {
  if (!trainer?.population?.length) {
    return null;
  }

  return {
    version: 2,
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
        }
      : null,
    population: trainer.population.map((individual) => ({
      id: individual.id,
      fitness: individual.fitness,
      network: serializeNetwork(individual.network),
    })),
    bestEver: trainer.bestEver
      ? {
          id: trainer.bestEver.id,
          fitness: trainer.bestEver.fitness,
          network: serializeNetwork(trainer.bestEver.network),
        }
      : null,
    progress: {
      running: trainer.running,
      matchCursor: trainer.matchCursor,
      schedule: trainer.schedule.map(([indexA, indexB]) => [indexA, indexB]),
      currentMatch: serializeMatchState(trainer.currentMatch, trainer.currentA, trainer.currentB),
    },
  };
}

function applyLoadedPopulationPayload(payload, options = {}) {
  if (!payload || !Array.isArray(payload.population) || payload.population.length === 0) {
    throw new Error("Пустое сохранение.");
  }

  const persistToLocalStorage = options.persistToLocalStorage !== false;

  payload.pitchWidth = Number.isFinite(payload.pitchWidth) ? payload.pitchWidth : state.pitchWidth;
  payload.logs = Array.isArray(payload.logs) ? payload.logs.slice(0, MAX_LOG_ENTRIES) : [...logs];

  if (persistToLocalStorage) {
    localStorage.setItem(POPULATION_STORAGE_KEY, JSON.stringify(payload));
  }

  state.savedPopulationData = payload;
  state.workerSaveData = payload;

  if (payload.config) {
    setControlsFromConfig(payload.config);
  }
  if (Number.isFinite(payload.pitchWidth)) {
    state.pitchWidth = payload.pitchWidth;
    applyPitchWidth();
  }
  logs.length = 0;
  logs.push(...payload.logs);
  ui.log.textContent = logs.join("\n");
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
  payload.logs = [...logs];
  payload.config = payload.config
    ? {
        ...payload.config,
        populationSize: payload.population.length,
        speedPreset: state.speedPreset,
        speedMultiplier: state.speedMultiplier,
        useMaxSpeed: state.useMaxSpeed,
        showTimeIndicator: state.showTimeIndicator,
        showFieldStripes: state.showFieldStripes,
        fitnessSettings: normalizeFitnessSettings(payload.config.fitnessSettings),
      }
    : null;

  try {
    localStorage.setItem(POPULATION_STORAGE_KEY, JSON.stringify(payload));
    state.savedPopulationData = payload;
    state.workerSaveData = payload;
    updateSaveStatus(payload);
    return true;
  } catch (error) {
    console.error("Не удалось сохранить популяцию:", error);
    updateSaveStatus(state.savedPopulationData, "Не удалось сохранить популяцию в браузере.");
    return false;
  }
}

function loadPopulation() {
  const raw = localStorage.getItem(POPULATION_STORAGE_KEY);
  if (!raw) {
    state.savedPopulationData = null;
    updateSaveStatus(null);
    return null;
  }

  try {
    const payload = JSON.parse(raw);
    return applyLoadedPopulationPayload(payload, { persistToLocalStorage: false });
  } catch (error) {
    console.error("Не удалось загрузить сохранение:", error);
    localStorage.removeItem(POPULATION_STORAGE_KEY);
    state.savedPopulationData = null;
    updateSaveStatus(null, "Сохранение повреждено и было сброшено.");
    return null;
  }
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
  const timestamp = new Date(payload.savedAt || Date.now()).toISOString().replace(/[:.]/g, "-");
  const fileName = `flower-3-generation-${generation}-${timestamp}.json`;
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
    this.goalTop = (FIELD.height - FIELD.goalWidth) / 2;
    this.goalBottom = this.goalTop + FIELD.goalWidth;

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
    const [speedSignal, directionSignal] = player.network.forward(inputs);
    const targetSpeed = ((speedSignal + 1) / 2) * MAX_PLAYER_SPEED;
    player.dir = normalizeAngle(player.dir + directionSignal * 2.4 * dt);

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

    return [
      ...senseTargets(player, teammates),
      ...senseTargets(player, opponents),
      ...senseTargets(player, [this.ball]),
      ...senseBoundaries(player),
      ...senseTargets(player, [{ x: ownGoalX, y: FIELD.height / 2, radius: FIELD.goalWidth / 2 }]),
      ...senseTargets(player, [{ x: oppGoalX, y: FIELD.height / 2, radius: FIELD.goalWidth / 2 }]),
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
        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = minDistance - distance;

        this.ball.x += nx * overlap;
        this.ball.y += ny * overlap;

        const push = Math.max(2, Math.hypot(player.vx, player.vy) * 0.9 + 2.5);
        this.ball.vx += nx * push + player.vx * 0.35;
        this.ball.vy += ny * push + player.vy * 0.35;

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
    this.score[scoringTeam] += 1;
    this.addFitness(scoringTeam, "goals", this.getFitnessSetting("goalReward"));
    this.addFitness(concedingTeam, "conceded", this.getFitnessSetting("concededPenalty"));

    if (this.ball.lastTouchTeam === concedingTeam) {
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

  start(config, savedData = null) {
    this.config = {
      ...config,
      fitnessSettings: normalizeFitnessSettings(config.fitnessSettings),
    };
    this.bestEver = null;
    this.currentA = null;
    this.currentB = null;
    this.currentMatch = null;

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
      fitnessSettings: normalizeFitnessSettings({
        ...(fallbackConfig.fitnessSettings || {}),
        ...((savedData.config && savedData.config.fitnessSettings) || {}),
      }),
    };

    this.config = mergedConfig;
    this.population = savedData.population.map((individual) => ({
      id: Number(individual.id) || (nextIndividualId += 1),
      network: deserializeNetwork(individual.network),
      fitness: Number(individual.fitness) || 0,
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

    const savedSchedule = Array.isArray(savedData.progress?.schedule)
      ? savedData.progress.schedule
          .filter((pair) => Array.isArray(pair) && pair.length === 2)
          .map(([indexA, indexB]) => [
            clamp(Math.floor(Number(indexA) || 0), 0, this.population.length - 1),
            clamp(Math.floor(Number(indexB) || 0), 0, this.population.length - 1),
          ])
      : [];

    this.schedule = savedSchedule;
    this.matchCursor = clamp(
      Math.floor(Number(savedData.progress?.matchCursor) || 0),
      0,
      Math.max(0, savedSchedule.length),
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
    }));
  }

  prepareGeneration() {
    this.bestFitness = 0;
    for (const individual of this.population) {
      individual.fitness = 0;
    }

    this.schedule = [];
    const rounds = Math.max(2, Math.ceil(Math.log2(this.population.length)));

    for (let round = 0; round < rounds; round += 1) {
      const order = shuffle(this.population.map((_, index) => index));
      for (let i = 0; i < order.length - 1; i += 2) {
        this.schedule.push([order[i], order[i + 1]]);
      }
      if (order.length % 2 === 1) {
        this.schedule.push([order[order.length - 1], order[0]]);
      }
    }

    this.matchCursor = 0;
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

    this.recordCompletedMatch();
    this.bestFitness = Math.max(this.bestFitness, this.currentA.fitness, this.currentB.fitness);
    this.matchCursor += 1;

    if (this.matchCursor >= this.schedule.length) {
      this.finishGeneration();
    } else {
      this.loadNextMatch();
    }
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
    const leader = ranked[0];

    if (!this.bestEver || leader.fitness > this.bestEver.fitness) {
      this.bestEver = {
        id: leader.id,
        fitness: leader.fitness,
        network: leader.network.clone(),
      };
    }

    this.onLog(
      `Поколение ${this.generation}: лучший #${leader.id} с фитнесом ${leader.fitness.toFixed(2)}.`,
    );

    const eliteCount = Math.max(2, Math.floor(this.population.length * 0.25));
    const nextGeneration = [];

    for (let i = 0; i < eliteCount; i += 1) {
      nextGeneration.push({
        id: nextIndividualId += 1,
        network: ranked[i].network.clone(),
        fitness: 0,
      });
    }

    while (nextGeneration.length < this.population.length) {
      const parentA = this.pickParent(ranked, eliteCount);
      const parentB = this.pickParent(ranked, eliteCount);
      const child = parentA.network.crossover(parentB.network).mutate(0.1, 0.28);

      nextGeneration.push({
        id: nextIndividualId += 1,
        network: child,
        fitness: 0,
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
    hiddenLayers: clamp(Number(ui.hiddenLayers.value) || 2, 1, 4),
    neuronsPerLayer: clamp(Number(ui.neuronsPerLayer.value) || 16, 4, 64),
    populationSize: clamp(Number(ui.populationSize.value) || 12, 4, 40),
    matchMinutes: clamp(Math.round(Number(ui.matchMinutes.value) || 10), 1, 10),
    speedPreset: state.speedPreset,
    speedMultiplier: state.speedMultiplier,
    useMaxSpeed: state.useMaxSpeed,
    showTimeIndicator: ui.showTimeToggle.checked,
    showFieldStripes: ui.showFieldStripesToggle.checked,
    fitnessSettings: readFitnessSettings(),
  };
}

function drawField() {
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

  const goalHeightPx = FIELD.goalWidth * FIELD.pxPerMeter;
  const goalTopPx = (ui.canvas.height - goalHeightPx) / 2;

  ctx.strokeRect(0, goalTopPx, 70, goalHeightPx);
  ctx.strokeRect(ui.canvas.width - 70, goalTopPx, 70, goalHeightPx);

  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(0, goalTopPx, 12, goalHeightPx);
  ctx.fillRect(ui.canvas.width - 12, goalTopPx, 12, goalHeightPx);
}

function drawMatch(match) {
  if (!ctx) return;
  drawField();

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

  updatePlaybackControls();
  updateMatchFitnessTables(status.currentMatch);
  if (!state.useWorkerRenderer) {
    drawMatch(displayMatch);
  }
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
  state.isPaused = false;
  postToWorker("startNew", { config: readConfig(), resetIds: true });
});

ui.loadBtn.addEventListener("click", () => {
  const savedData = loadPopulation();
  if (!savedData) {
    addLog("Сохранение не найдено.");
    return;
  }

  startTrainingFromSavedData(savedData, "localStorage");
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
    const savedData = applyLoadedPopulationPayload(payload, { persistToLocalStorage: true });
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
  savePopulation();
  addLog(state.showTimeIndicator ? "Индикатор времени матча включён." : "Индикатор времени матча скрыт.");
});

ui.showFieldStripesToggle.addEventListener("change", () => {
  state.showFieldStripes = ui.showFieldStripesToggle.checked;
  postToWorker("updateConfig", { showFieldStripes: state.showFieldStripes });
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
});

ui.skipBtn.addEventListener("click", () => {
  if (!state.workerStatus?.running) {
    addLog("Сейчас нет активного матча для пропуска.");
    return;
  }

  postToWorker("skipMatch");
});

ensureWorker();
applySpeedState({ notifyWorker: false, persist: false });
const initialSavedData = loadPopulation();
if (initialSavedData) {
  if (initialSavedData.config) {
    setControlsFromConfig(initialSavedData.config);
  }

  state.trainer = null;
  state.workerSaveData = initialSavedData;
  state.isPaused = false;
  postToWorker("loadSaved", { config: readConfig(), savedData: initialSavedData });
  addLog("Последнее сохранение загружено автоматически.");
}

applySidebarState();
applyPitchWidth();
updateStats();
ui.log.textContent = logs.join("\n");
requestAnimationFrame(tick);
