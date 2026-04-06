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
const BALL_TRAIL_SPEED_THRESHOLD = 1.1;
const MAX_ADDED_TIME_SECONDS = 60;
const MATCH_RATE_WINDOW_MS = 10000;
const MAX_TOURNAMENT_GAMES = 500;
const STATUS_INTERVAL_FULL_MS = 33;
const STATUS_INTERVAL_SUMMARY_MS = 120;
const SAVE_DATA_INTERVAL_MS = 2500;
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
const TEAM_COLORS = {
  A: "#61a8ff",
  B: "#ff8d6b",
};

const runtime = {
  trainer: null,
  stepsPerFrame: FAST_STEPS,
  isPaused: false,
  loopId: null,
  lastTickAt: null,
  lastStatusAt: 0,
  canvas: null,
  ctx: null,
  showGames: true,
  showTimeIndicator: true,
  showFieldStripes: true,
  useMaxSpeed: false,
  accumulator: 0,
  previousRenderMatch: null,
  currentRenderMatch: null,
  lastNetworkVizVersionSent: null,
  lastSaveDataAt: 0,
};

const requestWorkerFrame = typeof self.requestAnimationFrame === "function"
  ? self.requestAnimationFrame.bind(self)
  : (callback) => setTimeout(() => callback(performance.now()), 16);

let nextIndividualId = 0;
let rngSeed = 1;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

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

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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

function normalizeChangeGenerationHistory(history = [], fallbackGeneration = 1) {
  const fallback = Math.max(1, Math.floor(Number(fallbackGeneration) || 1));
  const sourceHistory = Array.isArray(history)
    ? history
    : Number.isFinite(Number(history)) && Number(history) > 0
      ? Array.from({ length: Math.min(20, Math.floor(Number(history) || 0)) }, () => fallback)
      : [];

  return [...new Set(
    sourceHistory
      .map((generation) => Math.max(1, Math.floor(Number(generation) || 0)))
      .filter((generation) => generation > 0),
  )]
    .sort((left, right) => left - right)
    .slice(-20);
}

function normalizeConnectionChangeCounts(counts = {}, fallbackGeneration = 1) {
  if (!counts || typeof counts !== "object") {
    return {};
  }

  const normalized = {};
  for (const [key, value] of Object.entries(counts)) {
    if (typeof key !== "string" || !key) {
      continue;
    }

    const history = normalizeChangeGenerationHistory(value, fallbackGeneration);
    if (history.length > 0) {
      normalized[key] = history;
    }
  }

  return normalized;
}

function cloneConnectionChangeCounts(counts = {}, fallbackGeneration = 1) {
  const normalized = normalizeConnectionChangeCounts(counts, fallbackGeneration);
  return Object.fromEntries(
    Object.entries(normalized).map(([key, history]) => [key, [...history]]),
  );
}

function mergeConnectionChangeHistory(...histories) {
  return normalizeChangeGenerationHistory(histories.flatMap((history) => normalizeChangeGenerationHistory(history)));
}

function countChangesFromGeneration(history = [], sinceGeneration = 1) {
  const normalizedSinceGeneration = Math.max(1, Math.floor(Number(sinceGeneration) || 1));
  return normalizeChangeGenerationHistory(history).filter((generation) => generation >= normalizedSinceGeneration).length;
}

function buildInheritedConnectionChangeCounts(childNetwork, parentANetwork, parentACounts = {}, parentBNetwork = null, parentBCounts = {}) {
  if (!childNetwork?.weights?.length) {
    return {};
  }

  const countsA = normalizeConnectionChangeCounts(parentACounts);
  const countsB = normalizeConnectionChangeCounts(parentBCounts);
  const inherited = {};

  for (let layerIndex = 0; layerIndex < childNetwork.weights.length; layerIndex += 1) {
    const layer = childNetwork.weights[layerIndex] || [];
    for (let rowIndex = 0; rowIndex < layer.length; rowIndex += 1) {
      const row = layer[rowIndex] || [];
      for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
        const key = createConnectionKey(layerIndex, rowIndex, columnIndex);
        const childValue = row[columnIndex];
        const parentAValue = parentANetwork?.weights?.[layerIndex]?.[rowIndex]?.[columnIndex];
        const parentBValue = parentBNetwork?.weights?.[layerIndex]?.[rowIndex]?.[columnIndex];
        const historyA = countsA[key] || [];
        const historyB = countsB[key] || [];
        const matchesA = Number.isFinite(parentAValue) && Math.abs(childValue - parentAValue) <= NETWORK_VIZ_EPSILON;
        const matchesB = Number.isFinite(parentBValue) && Math.abs(childValue - parentBValue) <= NETWORK_VIZ_EPSILON;

        const inheritedHistory = matchesA && matchesB
          ? mergeConnectionChangeHistory(historyA, historyB)
          : matchesA
            ? [...historyA]
            : matchesB
              ? [...historyB]
              : mergeConnectionChangeHistory(historyA, historyB);

        if (inheritedHistory.length > 0) {
          inherited[key] = inheritedHistory;
        }
      }
    }
  }

  for (let layerIndex = 0; layerIndex < (childNetwork.biases?.length || 0); layerIndex += 1) {
    const layer = childNetwork.biases[layerIndex] || [];
    for (let neuronIndex = 0; neuronIndex < layer.length; neuronIndex += 1) {
      const key = createBiasKey(layerIndex, neuronIndex);
      const childValue = layer[neuronIndex];
      const parentAValue = parentANetwork?.biases?.[layerIndex]?.[neuronIndex];
      const parentBValue = parentBNetwork?.biases?.[layerIndex]?.[neuronIndex];
      const historyA = countsA[key] || [];
      const historyB = countsB[key] || [];
      const matchesA = Number.isFinite(parentAValue) && Math.abs(childValue - parentAValue) <= NETWORK_VIZ_EPSILON;
      const matchesB = Number.isFinite(parentBValue) && Math.abs(childValue - parentBValue) <= NETWORK_VIZ_EPSILON;

      const inheritedHistory = matchesA && matchesB
        ? mergeConnectionChangeHistory(historyA, historyB)
        : matchesA
          ? [...historyA]
          : matchesB
            ? [...historyB]
            : mergeConnectionChangeHistory(historyA, historyB);

      if (inheritedHistory.length > 0) {
        inherited[key] = inheritedHistory;
      }
    }
  }

  return inherited;
}

function incrementConnectionChangeCounts(baseCounts = {}, changedConnections = [], generation = 1) {
  const nextCounts = cloneConnectionChangeCounts(baseCounts, generation);
  const normalizedGeneration = Math.max(1, Math.floor(Number(generation) || 1));

  for (const key of changedConnections) {
    if (typeof key !== "string" || !key) {
      continue;
    }
    nextCounts[key] = mergeConnectionChangeHistory(nextCounts[key] || [], [normalizedGeneration]);
  }
  return nextCounts;
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

function createEmptyFitnessBreakdown() {
  return {
    goals: 0,
    conceded: 0,
    ownGoal: 0,
  };
}

function emitLog(message) {
  postMessage({ type: "log", message });
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
    parentIds: normalizeParentIds(snapshot.parentIds),
    createdBy: typeof snapshot.createdBy === "string" ? snapshot.createdBy : "mutation",
    connectionChangeCounts: normalizeConnectionChangeCounts(snapshot.connectionChangeCounts),
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
    parentIds: normalizeParentIds(snapshot.parentIds),
    createdBy: typeof snapshot.createdBy === "string" ? snapshot.createdBy : "mutation",
    connectionChangeCounts: normalizeConnectionChangeCounts(snapshot.connectionChangeCounts),
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

function createBiasKey(layerIndex, neuronIndex) {
  return `b:${layerIndex}:${neuronIndex}`;
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

function getChangedBiasKeys(previousNetwork, currentNetwork) {
  if (!previousNetwork?.biases || !currentNetwork?.biases) {
    return [];
  }

  const changed = [];
  const layerCount = Math.min(previousNetwork.biases.length, currentNetwork.biases.length);

  for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
    const currentLayer = currentNetwork.biases[layerIndex] || [];
    const previousLayer = previousNetwork.biases[layerIndex] || [];

    for (let neuronIndex = 0; neuronIndex < currentLayer.length; neuronIndex += 1) {
      const currentBias = currentLayer[neuronIndex];
      const previousBias = previousLayer[neuronIndex];
      if (!Number.isFinite(currentBias)) {
        continue;
      }

      if (!Number.isFinite(previousBias) || Math.abs(currentBias - previousBias) > NETWORK_VIZ_EPSILON) {
        changed.push(createBiasKey(layerIndex, neuronIndex));
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
  const activeConnectionChangeCounts = normalizeConnectionChangeCounts(
    activeSnapshot?.connectionChangeCounts
      || activeHistoryEntry?.snapshot?.connectionChangeCounts
      || snapshot?.connectionChangeCounts,
    activeSnapshot?.generation || snapshot?.generation || 1,
  );
  const maxHeatCount = Object.values(activeConnectionChangeCounts).reduce((max, history) => Math.max(max, history.length), 0);
  const nonZeroHeatCount = Object.keys(activeConnectionChangeCounts).length;

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
              biasKey: null,
              highlighted: false,
              changeCount: 0,
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
    const nodes = indices.map((actualIndex, localIndex) => {
      const biasKey = createBiasKey(layerIndex - 1, actualIndex);
      return {
        id: `${layerIndex}:${actualIndex}`,
        actualIndex,
        label: isOutputLayer
          ? localIndex === 0
            ? "Ход"
            : localIndex === 1
              ? "Поворот"
              : `Выход ${localIndex + 1}`
          : String(actualIndex + 1),
        biasKey,
        highlighted: activeConnections.has(biasKey),
        changeCount: (activeConnectionChangeCounts[biasKey] || []).length,
      };
    });

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
          changeCount: (activeConnectionChangeCounts[key] || []).length,
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
    maxHeatCount,
    nonZeroHeatCount,
    parentIds: activeParentIds,
    createdBy: activeCreatedBy,
    historyEntries: history.map((entry) => ({
      generation: entry.generation,
      changedConnections: [...entry.changedConnections],
      parentIds: [...entry.parentIds],
      createdBy: entry.createdBy,
    })),
    layers,
    connections,
  };
}

function serializeMatchState(match, currentA, currentB, detail = "full") {
  if (!match) {
    return null;
  }

  const baseState = {
    individualAId: currentA?.id || null,
    individualBId: currentB?.id || null,
    time: match.time,
    duration: match.duration,
    addedTimeMax: Math.max(0, Number(match.addedTimeMax) || MAX_ADDED_TIME_SECONDS),
    inAddedTime: Boolean(match.inAddedTime),
    done: match.done,
    score: { ...match.score },
    teamFitness: { ...match.teamFitness },
    fitnessBreakdown: {
      A: { ...match.fitnessBreakdown.A },
      B: { ...match.fitnessBreakdown.B },
    },
  };

  if (detail !== "full") {
    return baseState;
  }

  return {
    ...baseState,
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

function createSavePayload() {
  const trainer = runtime.trainer;
  if (!trainer?.population?.length) {
    return null;
  }

  return {
    version: 5,
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
        }
      : null,
    population: trainer.population.map((individual) => ({
      id: individual.id,
      fitness: individual.fitness,
      network: serializeNetwork(individual.network),
      visualizationChangedConnections: Array.isArray(individual.visualizationChangedConnections)
        ? individual.visualizationChangedConnections.filter((key) => typeof key === "string")
        : [],
      visualizationConnectionCounts: normalizeConnectionChangeCounts(individual.visualizationConnectionCounts),
      visualizationParentIds: normalizeParentIds(individual.visualizationParentIds),
      visualizationOrigin: typeof individual.visualizationOrigin === "string" ? individual.visualizationOrigin : "mutation",
    })),
    bestEver: trainer.bestEver
      ? {
          id: trainer.bestEver.id,
          fitness: trainer.bestEver.fitness,
          connectionChangeCounts: normalizeConnectionChangeCounts(trainer.bestEver.connectionChangeCounts),
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

function emitSaveData(force = false) {
  const now = performance.now();
  if (!force && now - runtime.lastSaveDataAt < SAVE_DATA_INTERVAL_MS) {
    return;
  }

  const payload = createSavePayload();
  if (!payload) {
    return;
  }

  runtime.lastSaveDataAt = now;
  postMessage({ type: "saveData", payload });
}

function shouldSendFullMatchState() {
  return !runtime.canvas && runtime.showGames;
}

function emitStatus(force = false) {
  const trainer = runtime.trainer;
  if (!trainer && !force) {
    return;
  }

  const now = performance.now();
  const sendFullMatchState = shouldSendFullMatchState();
  const minInterval = sendFullMatchState ? STATUS_INTERVAL_FULL_MS : STATUS_INTERVAL_SUMMARY_MS;
  if (!force && now - runtime.lastStatusAt < minInterval) {
    return;
  }

  const payload = {
    snapshotAt: now,
    generation: trainer?.generation || 0,
    matchInfo: trainer?.currentMatch
      ? `${trainer.matchCursor + 1}/${trainer.schedule.length} · ${trainer.currentA.id} vs ${trainer.currentB.id}`
      : "—",
    gamesPerSecond: runtime.isPaused ? 0 : (trainer?.getMatchesPerSecond(now) || 0),
    bestFitness: trainer?.bestFitness || 0,
    bestEverFitness: trainer?.bestEver?.fitness || 0,
    running: Boolean(trainer?.running),
    isPaused: runtime.isPaused,
    currentMatch: trainer?.currentMatch
      ? serializeMatchState(trainer.currentMatch, trainer.currentA, trainer.currentB, sendFullMatchState ? "full" : "summary")
      : null,
  };

  const networkViz = trainer?.getNetworkVisualizationData?.() || null;
  if (networkViz && (force || networkViz.version !== runtime.lastNetworkVizVersionSent)) {
    payload.networkViz = networkViz;
    runtime.lastNetworkVizVersionSent = networkViz.version;
  }

  runtime.lastStatusAt = now;
  postMessage({ type: "status", payload });
}

function canInterpolateMatchStates(previousMatch, currentMatch) {
  if (!previousMatch || !currentMatch) {
    return false;
  }

  const previousA = previousMatch.individualAId ?? previousMatch.individualA?.id ?? null;
  const previousB = previousMatch.individualBId ?? previousMatch.individualB?.id ?? null;
  const currentA = currentMatch.individualAId ?? currentMatch.individualA?.id ?? null;
  const currentB = currentMatch.individualBId ?? currentMatch.individualB?.id ?? null;

  return previousA === currentA
    && previousB === currentB
    && (previousMatch.players?.length || 0) === (currentMatch.players?.length || 0)
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

function captureCurrentMatchState() {
  const trainer = runtime.trainer;
  return trainer?.currentMatch ? serializeMatchState(trainer.currentMatch, trainer.currentA, trainer.currentB) : null;
}

function drawCenterText(text) {
  const ctx = runtime.ctx;
  const canvas = runtime.canvas;
  if (!ctx || !canvas) return;

  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  ctx.textAlign = "start";
}

function drawField(match = null) {
  const ctx = runtime.ctx;
  const canvas = runtime.canvas;
  if (!ctx || !canvas) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (runtime.showFieldStripes) {
    const stripeCount = 4;
    const stripeWidth = canvas.width / stripeCount;
    for (let i = 0; i < stripeCount; i += 1) {
      ctx.fillStyle = i % 2 === 0 ? "#2f9f49" : "#23833b";
      ctx.fillRect(i * stripeWidth, 0, stripeWidth + 1, canvas.height);
    }
  } else {
    ctx.fillStyle = "#23833b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, 90, 0, Math.PI * 2);
  ctx.stroke();

  const goalWidth = normalizeGoalWidth(match?.goalWidth ?? runtime.trainer?.config?.goalWidth ?? FIELD.goalWidth);
  const goalHeightPx = goalWidth * FIELD.pxPerMeter;
  const goalTopPx = (canvas.height - goalHeightPx) / 2;

  ctx.strokeRect(0, goalTopPx, 70, goalHeightPx);
  ctx.strokeRect(canvas.width - 70, goalTopPx, 70, goalHeightPx);

  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(0, goalTopPx, 12, goalHeightPx);
  ctx.fillRect(canvas.width - 12, goalTopPx, 12, goalHeightPx);
}

function drawPlayers(players) {
  const ctx = runtime.ctx;
  if (!ctx) return;

  for (const player of players || []) {
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
}

function drawBall(ball) {
  const ctx = runtime.ctx;
  if (!ctx || !ball) return;

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(ball.x * FIELD.pxPerMeter, ball.y * FIELD.pxPerMeter, ball.radius * FIELD.pxPerMeter, 0, Math.PI * 2);
  ctx.fill();
}

function drawMatch(match) {
  const ctx = runtime.ctx;
  const canvas = runtime.canvas;
  if (!ctx || !canvas) return;

  drawField();

  if (!match) {
    drawCenterText("Ожидание запуска обучения");
    return;
  }

  if (!runtime.showGames) {
    drawCenterText("Показ матчей отключён — обучение идёт в фоне");
    return;
  }

  const ballSpeed = Math.hypot(match.ball?.vx || 0, match.ball?.vy || 0);
  if ((runtime.useMaxSpeed || runtime.stepsPerFrame >= FAST_STEPS) && ballSpeed >= BALL_TRAIL_SPEED_THRESHOLD && match.ballTrail?.length > 1) {
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

  drawPlayers(match.players);
  drawBall(match.ball);

  const regularSeconds = Math.max(1, Number(match.duration) || 1);
  const addedTimeMax = Math.max(0, Number(match.addedTimeMax) || MAX_ADDED_TIME_SECONDS);
  const addedTimeActive = Boolean(match.inAddedTime) || (Number(match.time) || 0) > regularSeconds;
  const regularProgress = clamp((Number(match.time) || 0) / regularSeconds, 0, 1);
  const addedProgress = addedTimeMax > 0
    ? clamp(((Number(match.time) || 0) - regularSeconds) / addedTimeMax, 0, 1)
    : 0;
  const overlayX = 14;
  const overlayY = 14;
  const overlayGap = 4;
  const overlayTotalWidth = canvas.width * 0.25;
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

  if (runtime.showTimeIndicator) {
    const timeBoxX = scoreBoxX + scoreBoxWidth + overlayGap;
    const timeBoxY = overlayY;
    const timeBarX = timeBoxX + 4;
    const timeBarY = timeBoxY + 8;
    const baseTimeBarWidth = Math.max(18, timeBoxWidth - 8);
    const extraTimeWidth = addedTimeActive && addedTimeMax > 0
      ? Math.round(baseTimeBarWidth * (addedTimeMax / regularSeconds))
      : 0;
    const timeBarWidth = baseTimeBarWidth + extraTimeWidth;
    const extendedTimeBoxWidth = timeBoxWidth + extraTimeWidth;
    const timeBarHeight = timeBoxHeight - 16;
    const fillWidth = baseTimeBarWidth * regularProgress + extraTimeWidth * addedProgress;

    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect(timeBoxX, timeBoxY, extendedTimeBoxWidth, timeBoxHeight);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(timeBarX, timeBarY, timeBarWidth, timeBarHeight);
    ctx.fillStyle = addedTimeActive ? "rgba(255, 212, 92, 0.26)" : "rgba(255,255,255,0.18)";
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

    if (extraTimeWidth > 0) {
      const dividerX = timeBarX + baseTimeBarWidth;
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(dividerX, timeBarY - 1);
      ctx.lineTo(dividerX, timeBarY + timeBarHeight + 1);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1;
    ctx.strokeRect(timeBarX, timeBarY, timeBarWidth, timeBarHeight);
  }

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function renderFrame(now) {
  try {
    if (runtime.lastTickAt === null) {
      runtime.lastTickAt = now;
    }

    const elapsedSeconds = clamp((now - runtime.lastTickAt) / 1000, 0, 0.1);
    runtime.lastTickAt = now;

    if (!runtime.currentRenderMatch) {
      runtime.currentRenderMatch = captureCurrentMatchState();
    }

    if (runtime.trainer?.running && !runtime.isPaused) {
      if (runtime.useMaxSpeed) {
        const frameBudgetMs = 12;
        const startedAt = performance.now();
        let safety = 0;

        while (runtime.trainer?.running && safety < 50000 && performance.now() - startedAt < frameBudgetMs) {
          runtime.previousRenderMatch = runtime.currentRenderMatch || captureCurrentMatchState();
          runtime.trainer.step(STEP_DT);
          runtime.currentRenderMatch = captureCurrentMatchState();
          safety += 1;
        }

        runtime.accumulator = 0;
      } else {
        runtime.accumulator += elapsedSeconds * runtime.stepsPerFrame;
        let safety = 0;

        while (runtime.accumulator >= STEP_DT && runtime.trainer?.running && safety < 5000) {
          runtime.previousRenderMatch = runtime.currentRenderMatch || captureCurrentMatchState();
          runtime.trainer.step(STEP_DT);
          runtime.currentRenderMatch = captureCurrentMatchState();
          runtime.accumulator -= STEP_DT;
          safety += 1;
        }
      }
    }

    const alpha = clamp(runtime.accumulator / STEP_DT, 0, 1);
    const matchForRender = interpolateMatchState(runtime.previousRenderMatch, runtime.currentRenderMatch, alpha);
    drawMatch(matchForRender || runtime.currentRenderMatch);
    emitStatus(false);
  } catch (error) {
    postMessage({ type: "error", message: `Ошибка worker-кадра: ${error instanceof Error ? error.message : String(error)}` });
  } finally {
    runtime.loopId = requestWorkerFrame(renderFrame);
  }
}

function ensureLoop() {
  if (runtime.loopId !== null) {
    return;
  }

  runtime.lastTickAt = null;
  runtime.loopId = requestWorkerFrame(renderFrame);
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
    this.addedTimeMax = MAX_ADDED_TIME_SECONDS;
    this.inAddedTime = false;
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
    this.addedTimeMax = MAX_ADDED_TIME_SECONDS;

    if (this.time >= this.duration + this.addedTimeMax) {
      this.finish();
    } else if (this.time >= this.duration) {
      this.startAddedTime();
    } else {
      this.inAddedTime = false;
    }
  }

  startAddedTime() {
    if (this.done || this.inAddedTime) return;
    this.inAddedTime = true;
    this.onEvent?.(
      `Основное время истекло: матч ${this.individualA.id} vs ${this.individualB.id} переходит в дополнительную минуту до первого гола.`,
    );
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
    if (!this.inAddedTime && this.time >= this.duration) {
      this.startAddedTime();
    }

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

    if (this.inAddedTime && this.time >= this.duration + this.addedTimeMax) {
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
    const endedInAddedTime = this.inAddedTime;
    this.score[scoringTeam] += 1;
    this.addFitness(scoringTeam, "goals", this.getFitnessSetting("goalReward"));
    this.addFitness(concedingTeam, "conceded", this.getFitnessSetting("concededPenalty"));

    if (isOwnGoal) {
      this.addFitness(concedingTeam, "ownGoal", this.getFitnessSetting("ownGoalPenalty"));
    }

    this.onEvent?.(
      `Гол: ${scoringTeam} (${this.individualA.id} vs ${this.individualB.id}) — счёт ${this.score.A}:${this.score.B}${endedInAddedTime ? " · матч завершён в дополнительное время" : ""}`,
    );

    if (endedInAddedTime) {
      this.finish();
      return;
    }

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
    this.currentA = null;
    this.currentB = null;
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

  isEvolutionVisualizationEnabled() {
    return this.config?.showEvolutionVisuals !== false;
  }

  updateEvolutionVisualizationEnabled(enabled) {
    if (!this.config) {
      return enabled !== false;
    }

    this.config.showEvolutionVisuals = enabled !== false;
    if (!this.config.showEvolutionVisuals) {
      this.lineageBest = null;
      this.generationLeader = null;
      this.lineageHistory = [];
      this.generationTimeline = [];
      this.networkVizHistoryOffset = 0;
    }
    this.markNetworkVisualizationDirty();
    return this.config.showEvolutionVisuals;
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
        parentIds: normalizeParentIds(individual.visualizationParentIds),
        createdBy: typeof individual.visualizationOrigin === "string" ? individual.visualizationOrigin : this.generation <= 1 ? "initial" : "mutation",
        connectionChangeCounts: normalizeConnectionChangeCounts(individual.visualizationConnectionCounts),
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
        connectionChangeCounts: normalizeConnectionChangeCounts(this.bestEver.connectionChangeCounts),
        network: this.bestEver.network.clone(),
      };
    }
    const fallback = this.population?.[0];
    if (fallback?.network) {
      return {
        generation: this.generation,
        id: fallback.id,
        fitness: fallback.fitness,
        parentIds: normalizeParentIds(fallback.visualizationParentIds),
        createdBy: typeof fallback.visualizationOrigin === "string" ? fallback.visualizationOrigin : this.generation <= 1 ? "initial" : "mutation",
        connectionChangeCounts: normalizeConnectionChangeCounts(fallback.visualizationConnectionCounts),
        network: fallback.network.clone(),
      };
    }
    return null;
  }

  buildVisualizationHistoryForDisplay() {
    if (!this.isEvolutionVisualizationEnabled()) {
      return [];
    }
    return trimVisualizationHistory(this.lineageHistory, this.config?.networkVizHistoryDepth);
  }

  restoreVisualizationState(visualization = {}) {
    if (!this.isEvolutionVisualizationEnabled()) {
      this.lineageBest = null;
      this.generationLeader = null;
      this.lineageHistory = [];
      this.generationTimeline = [];
      this.networkVizHistoryOffset = 0;
      this.networkVizVersion = 0;
      this.cachedNetworkViz = null;
      this.markNetworkVisualizationDirty();
      return;
    }
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
    if (!this.isEvolutionVisualizationEnabled()) {
      return null;
    }

    return {
      lineageBest: serializeNetworkSnapshot(this.lineageBest),
      generationLeader: serializeNetworkSnapshot(this.generationLeader),
      history: serializeVisualizationHistory(this.lineageHistory),
      generationTimeline: serializeGenerationTimeline(this.generationTimeline),
    };
  }

  getNetworkVisualizationData() {
    if (!this.isEvolutionVisualizationEnabled()) {
      return null;
    }
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
      showEvolutionVisuals: config.showEvolutionVisuals !== false,
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
        emitSaveData(true);
      } else if (this.schedule.length && this.matchCursor < this.schedule.length) {
        this.loadNextMatch();
        emitSaveData(true);
      } else {
        this.prepareGeneration();
        emitSaveData(true);
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
    emitSaveData(true);
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
      visualizationConnectionCounts: normalizeConnectionChangeCounts(individual.visualizationConnectionCounts),
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
          connectionChangeCounts: normalizeConnectionChangeCounts(savedData.bestEver.connectionChangeCounts),
          network: deserializeNetwork(savedData.bestEver.network),
        }
      : null;

    this.restoreVisualizationState(savedData.visualization || {});
    if (!this.lineageBest?.network && this.bestEver?.network) {
      this.lineageBest = {
        generation: this.generation,
        id: this.bestEver.id,
        fitness: this.bestEver.fitness,
        connectionChangeCounts: normalizeConnectionChangeCounts(this.bestEver.connectionChangeCounts),
        network: this.bestEver.network.clone(),
      };
    }
    if (!this.generationLeader?.network && this.lineageBest?.network) {
      this.generationLeader = {
        generation: this.generation,
        id: this.lineageBest.id,
        fitness: this.lineageBest.fitness,
        connectionChangeCounts: normalizeConnectionChangeCounts(this.lineageBest.connectionChangeCounts),
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
    match.addedTimeMax = Math.max(0, Number(savedMatch.addedTimeMax) || match.addedTimeMax || MAX_ADDED_TIME_SECONDS);
    match.inAddedTime = Boolean(savedMatch.inAddedTime) || match.time > match.duration;
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
      visualizationConnectionCounts: {},
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
    const historyEnabled = this.isEvolutionVisualizationEnabled();
    const historyDepth = normalizeNetworkVizHistoryDepth(this.config?.networkVizHistoryDepth);
    const leader = ranked[0] || null;

    if (historyEnabled) {
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
          connectionChangeCounts: normalizeConnectionChangeCounts(individual.visualizationConnectionCounts),
          snapshot: {
            generation: this.generation,
            id: individual.id,
            fitness: individual.fitness,
            parentIds: normalizeParentIds(individual.visualizationParentIds),
            createdBy: typeof individual.visualizationOrigin === "string" ? individual.visualizationOrigin : this.generation <= 1 ? "initial" : "mutation",
            connectionChangeCounts: normalizeConnectionChangeCounts(individual.visualizationConnectionCounts),
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
    } else {
      this.lineageBest = null;
      this.generationLeader = null;
      this.lineageHistory = [];
      this.generationTimeline = [];
      this.networkVizHistoryOffset = 0;
    }
    this.markNetworkVisualizationDirty();

    if (leader && (!this.bestEver || leader.fitness > this.bestEver.fitness)) {
      this.bestEver = {
        id: leader.id,
        fitness: leader.fitness,
        connectionChangeCounts: normalizeConnectionChangeCounts(leader.visualizationConnectionCounts),
        network: leader.network.clone(),
      };
    }

    const eliteCount = Math.max(2, Math.floor(this.population.length * 0.25));
    const nextGeneration = [];

    for (let i = 0; i < eliteCount; i += 1) {
      nextGeneration.push({
        id: nextIndividualId += 1,
        network: ranked[i].network.clone(),
        fitness: 0,
        visualizationChangedConnections: [],
        visualizationConnectionCounts: cloneConnectionChangeCounts(ranked[i].visualizationConnectionCounts),
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
      const changedConnectionKeys = useCrossover && parentB
        ? [...new Set([
            ...getChangedConnectionKeys(parentA.network, child),
            ...getChangedConnectionKeys(parentB.network, child),
            ...getChangedBiasKeys(parentA.network, child),
            ...getChangedBiasKeys(parentB.network, child),
          ])]
        : [...new Set([
            ...getChangedConnectionKeys(parentA.network, child),
            ...getChangedBiasKeys(parentA.network, child),
          ])];
      const inheritedConnectionCounts = buildInheritedConnectionChangeCounts(
        child,
        parentA.network,
        parentA.visualizationConnectionCounts,
        parentB?.network || null,
        parentB?.visualizationConnectionCounts || {},
      );
      const visualizationChangedConnections = historyEnabled ? changedConnectionKeys : [];
      const visualizationConnectionCounts = incrementConnectionChangeCounts(
        inheritedConnectionCounts,
        changedConnectionKeys,
        this.generation + 1,
      );

      nextGeneration.push({
        id: nextIndividualId += 1,
        network: child,
        fitness: 0,
        visualizationChangedConnections,
        visualizationConnectionCounts,
        visualizationParentIds: historyEnabled ? (useCrossover && parentB ? [parentA.id, parentB.id] : [parentA.id]) : [],
        visualizationOrigin: useCrossover ? "crossover" : "mutation",
      });
    }

    this.population = nextGeneration;
    this.generation += 1;
    this.prepareGeneration();
    emitSaveData(false);
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

self.onmessage = (event) => {
  const { type, payload = {}, canvas } = event.data || {};

  try {
    switch (type) {
      case "initCanvas": {
        runtime.canvas = canvas || runtime.canvas;
        if (runtime.canvas && payload?.width && payload?.height) {
          runtime.canvas.width = payload.width;
          runtime.canvas.height = payload.height;
          runtime.ctx = runtime.canvas.getContext("2d", { alpha: false, desynchronized: true });
          drawMatch(runtime.currentRenderMatch);
        }
        break;
      }
      case "startNew": {
        nextIndividualId = payload.resetIds ? 0 : nextIndividualId;
        runtime.trainer = new EvolutionTrainer(emitLog);
        runtime.isPaused = false;
        runtime.accumulator = 0;
        runtime.previousRenderMatch = null;
        runtime.currentRenderMatch = null;
        runtime.lastNetworkVizVersionSent = null;
        runtime.trainer.start(payload.config || {});
        runtime.currentRenderMatch = captureCurrentMatchState();
        runtime.lastTickAt = performance.now();
        emitStatus(true);
        emitSaveData(true);
        break;
      }
      case "loadSaved": {
        runtime.trainer = new EvolutionTrainer(emitLog);
        runtime.isPaused = false;
        runtime.accumulator = 0;
        runtime.previousRenderMatch = null;
        runtime.currentRenderMatch = null;
        runtime.lastNetworkVizVersionSent = null;
        runtime.trainer.start(payload.config || {}, payload.savedData || null);
        runtime.currentRenderMatch = captureCurrentMatchState();
        runtime.lastTickAt = performance.now();
        emitStatus(true);
        emitSaveData(true);
        break;
      }
      case "setStepsPerFrame": {
        runtime.stepsPerFrame = Math.max(1, Number(payload.stepsPerFrame) || FAST_STEPS);
        runtime.useMaxSpeed = Boolean(payload.useMaxSpeed);
        runtime.lastTickAt = performance.now();
        emitStatus(true);
        break;
      }
      case "setPaused": {
        runtime.isPaused = Boolean(payload.isPaused);
        runtime.lastTickAt = performance.now();
        emitStatus(true);
        emitSaveData(true);
        break;
      }
      case "updateFitnessSettings": {
        if (runtime.trainer?.config) {
          const fitnessSettings = normalizeFitnessSettings(payload.fitnessSettings);
          runtime.trainer.config.fitnessSettings = fitnessSettings;
          if (runtime.trainer.currentMatch?.config) {
            runtime.trainer.currentMatch.config.fitnessSettings = fitnessSettings;
          }
          emitSaveData(true);
        }
        break;
      }
      case "updateMatchDuration": {
        if (runtime.trainer?.running) {
          runtime.trainer.updateMatchDuration(payload.matchMinutes);
          runtime.currentRenderMatch = captureCurrentMatchState();
          emitStatus(true);
          emitSaveData(true);
        }
        break;
      }
      case "skipMatch": {
        if (runtime.trainer?.running) {
          runtime.trainer.skipCurrentMatch();
          runtime.currentRenderMatch = captureCurrentMatchState();
          emitStatus(true);
          emitSaveData(true);
        }
        break;
      }
      case "updateConfig": {
        if (payload && typeof payload === "object") {
          if (Object.hasOwn(payload, "showGames")) {
            runtime.showGames = Boolean(payload.showGames);
            runtime.currentRenderMatch = captureCurrentMatchState();
            emitStatus(true);
          }
          if (Object.hasOwn(payload, "showTimeIndicator")) {
            runtime.showTimeIndicator = payload.showTimeIndicator !== false;
            emitStatus(true);
          }
          if (Object.hasOwn(payload, "showFieldStripes")) {
            runtime.showFieldStripes = payload.showFieldStripes !== false;
            emitStatus(true);
          }
          if (Object.hasOwn(payload, "showEvolutionVisuals")) {
            payload.showEvolutionVisuals = payload.showEvolutionVisuals !== false;
          }
          if (Object.hasOwn(payload, "useMaxSpeed")) {
            runtime.useMaxSpeed = Boolean(payload.useMaxSpeed);
          }
          if (Object.hasOwn(payload, "goalWidth")) {
            payload.goalWidth = normalizeGoalWidth(payload.goalWidth);
          }
          if (Object.hasOwn(payload, "tournamentGames")) {
            payload.tournamentGames = normalizeTournamentGames(payload.tournamentGames, runtime.trainer?.population?.length || runtime.trainer?.config?.populationSize || 12);
          }
          if (Object.hasOwn(payload, "crossoverRate")) {
            payload.crossoverRate = normalizeCrossoverRate(payload.crossoverRate);
          }
          if (Object.hasOwn(payload, "mutationSettings")) {
            payload.mutationSettings = normalizeMutationSettings(payload.mutationSettings);
          }
          if (Object.hasOwn(payload, "networkVizHistoryDepth")) {
            payload.networkVizHistoryDepth = normalizeNetworkVizHistoryDepth(payload.networkVizHistoryDepth);
          }
          if (Object.hasOwn(payload, "networkVizHistoryOffset")) {
            payload.networkVizHistoryOffset = normalizeNetworkVizHistoryOffset(payload.networkVizHistoryOffset, Math.max(0, (runtime.trainer?.lineageHistory?.length || 1) - 1));
          }
          if (runtime.trainer?.config) {
            Object.assign(runtime.trainer.config, payload);
            if (Object.hasOwn(payload, "goalWidth")) {
              runtime.trainer.updateGoalWidth(payload.goalWidth);
              runtime.currentRenderMatch = captureCurrentMatchState();
              emitStatus(true);
            }
            if (Object.hasOwn(payload, "tournamentGames")) {
              runtime.trainer.updateTournamentGames(payload.tournamentGames);
              runtime.currentRenderMatch = captureCurrentMatchState();
              emitStatus(true);
            }
            if (Object.hasOwn(payload, "showEvolutionVisuals")) {
              runtime.trainer.updateEvolutionVisualizationEnabled(payload.showEvolutionVisuals);
              emitStatus(true);
            }
            if (Object.hasOwn(payload, "networkVizHistoryDepth")) {
              runtime.trainer.updateNetworkVizHistoryDepth(payload.networkVizHistoryDepth);
              emitStatus(true);
            }
            if (Object.hasOwn(payload, "networkVizHistoryOffset")) {
              runtime.trainer.updateNetworkVizHistoryOffset(payload.networkVizHistoryOffset);
              emitStatus(true);
            }
            emitSaveData(true);
          }
        }
        break;
      }
      case "requestSave": {
        emitSaveData(true);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

setRandomSeed(Date.now());
ensureLoop();
postMessage({ type: "ready" });
