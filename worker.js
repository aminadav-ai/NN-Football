const FIELD = {
  width: 110,
  height: 68,
  goalWidth: 22,
  playerRadius: 2,
  ballRadius: 1,
  pxPerMeter: 10,
};

const INPUT_SIZE = 24;
const OUTPUT_SIZE = 4;
const SENSOR_COUNT = 8;
const MAX_SIGHT = 130;
const MAX_PLAYER_SPEED = 17.5;
const MAX_KICK_SPEED = 29.0;
const STEP_DT = 0.05;
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
  { key: "teammates", label: "Teammates", size: 8 },
  { key: "opponents", label: "Opponents", size: 8 },
  { key: "ball", label: "Ball", size: 2 },
  { key: "boundary", label: "Boundary", size: 8 },
  { key: "ownGoal", label: "Own Goal", size: 2 },
  { key: "oppGoal", label: "Opp. Goal", size: 2 },
  { key: "time", label: "Time", size: 1 },
];
const HARD_COLLISION_THRESHOLD = 1.5;
const TEAM_COLORS = {
  A: "#61a8ff",
  B: "#ff8d6b",
};

const runtime = {
  trainer: null,
  stepsPerFrame: 1,
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

function normalizeNetworkVizChangeHistoryCollection(value) {
  return value !== false;
}

function normalizeChangeGenerationHistory(history = [], fallbackGeneration = 1) {
  const fallback = Math.max(1, Math.floor(Number(fallbackGeneration) || 1));
  const sourceHistory = Array.isArray(history)
    ? history
    : Number.isFinite(Number(history)) && Number(history) > 0
      ? Array.from({ length: Math.min(20, Math.floor(Number(history) || 0)) }, () => fallback)
      : [];

  return sourceHistory
    .map((generation) => Math.max(1, Math.floor(Number(generation) || 0)))
    .filter((generation) => generation > 0)
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
    throw new Error("Invalid neural network data.");
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

function clearConnectionChangeHistoryFromPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  if (Array.isArray(payload.population)) {
    payload.population.forEach((individual) => {
      if (individual && typeof individual === "object") {
        individual.visualizationConnectionCounts = {};
      }
    });
  }

  if (payload.bestEver && typeof payload.bestEver === "object") {
    payload.bestEver.connectionChangeCounts = {};
  }

  const clearSnapshotCounts = (snapshot) => {
    if (snapshot && typeof snapshot === "object") {
      snapshot.connectionChangeCounts = {};
    }
  };

  if (payload.visualization && typeof payload.visualization === "object") {
    clearSnapshotCounts(payload.visualization.lineageBest);
    clearSnapshotCounts(payload.visualization.generationLeader);

    if (Array.isArray(payload.visualization.history)) {
      payload.visualization.history.forEach((entry) => clearSnapshotCounts(entry?.snapshot));
    }

    if (Array.isArray(payload.visualization.generationTimeline)) {
      payload.visualization.generationTimeline.forEach((entry) => {
        if (!Array.isArray(entry?.individuals)) {
          return;
        }
        entry.individuals.forEach((individual) => clearSnapshotCounts(individual?.snapshot));
      });
    }
  }

  return payload;
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
        label: "Inputs",
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
            ? "Move"
            : localIndex === 1
              ? "Turn"
              : `Output ${localIndex + 1}`
          : String(actualIndex + 1),
        biasKey,
        highlighted: activeConnections.has(biasKey),
        changeCount: (activeConnectionChangeCounts[biasKey] || []).length,
      };
    });

    return {
      key: isOutputLayer ? "output" : `hidden-${layerIndex}`,
      label: isOutputLayer ? "Outputs" : `Hidden layer ${layerIndex}`,
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

  const payload = {
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
          collectNetworkVizChangeHistory: normalizeNetworkVizChangeHistoryCollection(trainer.config.collectNetworkVizChangeHistory),
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

  if (!normalizeNetworkVizChangeHistoryCollection(payload.config?.collectNetworkVizChangeHistory)) {
    clearConnectionChangeHistoryFromPayload(payload);
  }

  return payload;
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

const workerPlayerAnimMap = new Map();

const WORKER_PLAYER_PROFILES = [
  { skin: "#f1c29b", skinShade: "#d59b70", hair: "#231711", hairStyle: "short", numberA: "1", numberB: "1" },
  { skin: "#e2ab82", skinShade: "#c08459", hair: "#4a2c18", hairStyle: "curly", numberA: "7", numberB: "8" },
  { skin: "#f5cba7", skinShade: "#d9a279", hair: "#caa449", hairStyle: "band", numberA: "10", numberB: "9" },
  { skin: "#b87a52", skinShade: "#945b36", hair: "#161210", hairStyle: "fade", numberA: "11", numberB: "11" },
  { skin: "#ecc09b", skinShade: "#cc966d", hair: "#6e3219", hairStyle: "spiky", numberA: "4", numberB: "5" },
  { skin: "#d99e73", skinShade: "#b5794e", hair: "#2b211c", hairStyle: "short", numberA: "6", numberB: "6" },
];

const WORKER_KIT_PALETTES = {
  A: {
    ring: "rgba(97, 168, 255, 0.36)",
    ringActive: "rgba(147, 205, 255, 0.82)",
    arrow: "#bae6fd",
    jerseyTop: "#3b82f6",
    jerseyBottom: "#1d4ed8",
    jerseyStripe: "#93c5fd",
    collar: "#ffffff",
    shorts: "#0f172a",
    shortsTrim: "#60a5fa",
    socks: "#2563eb",
    sockHoops: "#ffffff",
    boots: "#0f172a",
    bootAccent: "#38bdf8",
    numberColor: "#ffffff",
  },
  B: {
    ring: "rgba(255, 141, 107, 0.36)",
    ringActive: "rgba(255, 190, 150, 0.85)",
    arrow: "#fed7aa",
    jerseyTop: "#f43f5e",
    jerseyBottom: "#be123c",
    jerseyStripe: "#fda4af",
    collar: "#fff1f2",
    shorts: "#1e1b4b",
    shortsTrim: "#fb7185",
    socks: "#e11d48",
    sockHoops: "#ffffff",
    boots: "#18181b",
    bootAccent: "#fbbf24",
    numberColor: "#ffffff",
  },
};

function updateWorkerPlayerAnim(player, index, matchTime) {
  let anim = workerPlayerAnimMap.get(index);
  if (!anim) {
    anim = {
      lastX: player.x,
      lastY: player.y,
      stridePhase: index * 1.7,
      swingAmp: 0.35,
      facingX: Math.cos(player.dir || 0) >= 0 ? 1 : -1,
      kickBoost: 0,
      lastTime: matchTime,
    };
    workerPlayerAnimMap.set(index, anim);
  }

  const dx = player.x - anim.lastX;
  const dy = player.y - anim.lastY;
  const dist = Math.hypot(dx, dy);
  const vx = Number(player.vx) || 0;
  const vy = Number(player.vy) || 0;
  const velSpeed = Math.hypot(vx, vy);
  const frameMoveSpeed = dist < 4.5 ? dist * 36 : 0;
  const speed = Math.max(velSpeed, frameMoveSpeed);

  if (dist > 0.0005 && dist < 4.5) {
    anim.stridePhase = (anim.stridePhase + dist * 3.4) % (Math.PI * 2);
  } else if (speed > 0.3) {
    anim.stridePhase = (anim.stridePhase + speed * 0.055) % (Math.PI * 2);
  }

  const targetAmp = clamp(speed / 5.2, 0.18, 1);
  anim.swingAmp = lerp(anim.swingAmp, targetAmp, 0.32);

  const dirCos = Math.cos(player.dir || 0);
  if (dirCos > 0.14) {
    anim.facingX = 1;
  } else if (dirCos < -0.14) {
    anim.facingX = -1;
  } else if (dx > 0.02) {
    anim.facingX = 1;
  } else if (dx < -0.02) {
    anim.facingX = -1;
  }

  if (player.isTouchingBall) {
    anim.kickBoost = 1;
  } else {
    anim.kickBoost = Math.max(0, anim.kickBoost - 0.14);
  }

  anim.lastX = player.x;
  anim.lastY = player.y;
  anim.lastTime = matchTime;
  return anim;
}

function drawFootballerSprite(ctx, player, index, matchTime = 0) {
  const x = player.x * FIELD.pxPerMeter;
  const y = player.y * FIELD.pxPerMeter;
  const radius = player.radius * FIELD.pxPerMeter;
  const kit = WORKER_KIT_PALETTES[player.team] || WORKER_KIT_PALETTES.A;
  const profile = WORKER_PLAYER_PROFILES[index % WORKER_PLAYER_PROFILES.length];
  const anim = updateWorkerPlayerAnim(player, index, matchTime);
  const dir = Number(player.dir) || 0;
  const cosD = Math.cos(dir);
  const sinD = Math.sin(dir);
  const s = (radius / 20) * 1.48;

  ctx.save();
  ctx.translate(x, y);

  const footGroundY = 9.2 * s;
  ctx.beginPath();
  ctx.ellipse(0, footGroundY, 8.8 * s, 3.6 * s, 0, 0, Math.PI * 2);
  ctx.fillStyle = player.isTouchingBall ? "rgba(255, 255, 255, 0.28)" : "rgba(0, 0, 0, 0.32)";
  ctx.fill();

  const arrowDist = 11.5 * s;
  const arrowBase = 8.2 * s;
  const arrowSpread = 0.28;
  ctx.beginPath();
  ctx.moveTo(cosD * arrowDist, footGroundY * 0.55 + sinD * arrowDist * 0.65);
  ctx.lineTo(
    Math.cos(dir - arrowSpread) * arrowBase,
    footGroundY * 0.55 + Math.sin(dir - arrowSpread) * arrowBase * 0.65,
  );
  ctx.lineTo(
    Math.cos(dir + arrowSpread) * arrowBase,
    footGroundY * 0.55 + Math.sin(dir + arrowSpread) * arrowBase * 0.65,
  );
  ctx.closePath();
  ctx.fillStyle = kit.arrow;
  ctx.fill();
  ctx.lineWidth = 0.9 * s;
  ctx.strokeStyle = "rgba(8, 32, 50, 0.75)";
  ctx.stroke();

  const facing = anim.facingX;
  const stride = Math.sin(anim.stridePhase) * anim.swingAmp;
  const liftA = Math.max(0, -Math.cos(anim.stridePhase)) * anim.swingAmp;
  const liftB = Math.max(0, Math.cos(anim.stridePhase)) * anim.swingAmp;
  const kickSwing = anim.kickBoost * 0.85;
  const sprintLean = anim.swingAmp * 0.10;

  ctx.save();
  ctx.translate(0, -2.2 * s);
  ctx.scale(facing, 1);
  ctx.rotate(sprintLean);

  const drawLeg = (hipX, strideVal, liftVal, isFrontLeg) => {
    const kickOffset = isFrontLeg ? kickSwing * 6.2 * s : 0;
    const kickLift = isFrontLeg ? kickSwing * 3.4 * s : 0;
    const footX = hipX + strideVal * 6.8 * s + kickOffset;
    const footY = 9.8 * s - liftVal * 3.6 * s - kickLift;
    const kneeX = (hipX + footX) * 0.5 + 1.3 * s;
    const kneeY = (2.0 * s + footY) * 0.5 - liftVal * 1.4 * s;

    ctx.strokeStyle = isFrontLeg ? profile.skin : profile.skinShade;
    ctx.lineWidth = 3.4 * s;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(hipX, 1.8 * s);
    ctx.lineTo(kneeX, kneeY);
    ctx.stroke();

    ctx.strokeStyle = kit.socks;
    ctx.lineWidth = 3.1 * s;
    ctx.beginPath();
    ctx.moveTo(kneeX, kneeY);
    ctx.lineTo(footX, footY);
    ctx.stroke();

    ctx.strokeStyle = kit.sockHoops;
    ctx.lineWidth = 3.2 * s;
    ctx.beginPath();
    ctx.moveTo(kneeX, kneeY);
    ctx.lineTo(lerp(kneeX, footX, 0.28), lerp(kneeY, footY, 0.28));
    ctx.stroke();

    ctx.save();
    ctx.translate(footX, footY);
    ctx.rotate(strideVal * 0.22 - (isFrontLeg ? kickSwing * 0.42 : 0));
    ctx.fillStyle = kit.boots;
    ctx.beginPath();
    ctx.ellipse(1.3 * s, 0.5 * s, 3.4 * s, 1.8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = kit.bootAccent;
    ctx.lineWidth = 1.0 * s;
    ctx.beginPath();
    ctx.moveTo(-0.5 * s, -0.3 * s);
    ctx.lineTo(2.0 * s, 0.7 * s);
    ctx.stroke();
    ctx.restore();
  };

  drawLeg(-2.1 * s, -stride, liftA, false);

  const drawArm = (shoulderX, shoulderY, armSwing, isFrontArm) => {
    const elbowX = shoulderX + armSwing * 4.2 * s;
    const elbowY = shoulderY + 4.0 * s - Math.abs(armSwing) * 1.1 * s;
    const handX = elbowX + (armSwing * 2.2 + 1.7) * s;
    const handY = elbowY + 1.0 * s;

    ctx.strokeStyle = isFrontArm ? profile.skin : profile.skinShade;
    ctx.lineWidth = 2.6 * s;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY + 1.4 * s);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(handX, handY);
    ctx.stroke();

    ctx.strokeStyle = isFrontArm ? kit.jerseyTop : kit.jerseyBottom;
    ctx.lineWidth = 3.5 * s;
    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(lerp(shoulderX, elbowX, 0.55), lerp(shoulderY, elbowY, 0.55));
    ctx.stroke();
  };

  drawArm(-4.6 * s, -5.8 * s, stride, false);

  ctx.fillStyle = kit.shorts;
  ctx.strokeStyle = "#082032";
  ctx.lineWidth = 1.05 * s;
  ctx.beginPath();
  ctx.roundRect(-5.0 * s, 0.0, 10.0 * s, 4.5 * s, 1.8 * s);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = kit.shortsTrim;
  ctx.lineWidth = 1.2 * s;
  ctx.beginPath();
  ctx.moveTo(3.4 * s, 0.4 * s);
  ctx.lineTo(3.4 * s, 4.2 * s);
  ctx.stroke();

  drawLeg(2.1 * s, stride, liftB, true);

  const torsoGrad = ctx.createLinearGradient(0, -8.0 * s, 0, 1.2 * s);
  torsoGrad.addColorStop(0, kit.jerseyTop);
  torsoGrad.addColorStop(1, kit.jerseyBottom);
  ctx.fillStyle = torsoGrad;
  ctx.strokeStyle = "#082032";
  ctx.lineWidth = 1.15 * s;
  ctx.beginPath();
  ctx.roundRect(-5.4 * s, -7.8 * s, 10.8 * s, 9.0 * s, [3.4 * s, 3.4 * s, 1.6 * s, 1.6 * s]);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = kit.jerseyStripe;
  ctx.fillRect(1.8 * s, -7.2 * s, 1.7 * s, 7.8 * s);

  ctx.strokeStyle = kit.collar;
  ctx.lineWidth = 1.3 * s;
  ctx.beginPath();
  ctx.moveTo(-1.4 * s, -7.6 * s);
  ctx.lineTo(1.2 * s, -5.5 * s);
  ctx.lineTo(3.0 * s, -7.6 * s);
  ctx.stroke();

  const squadNum = player.team === "A" ? profile.numberA : profile.numberB;
  ctx.save();
  ctx.translate(-1.2 * s, -2.9 * s);
  ctx.scale(facing, 1);
  ctx.fillStyle = kit.numberColor;
  ctx.font = `bold ${Math.round(5.8 * s)}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(squadNum, 0, 0);
  ctx.restore();

  drawArm(4.4 * s, -5.6 * s, -stride, true);

  ctx.fillStyle = profile.skinShade;
  ctx.fillRect(-1.6 * s, -9.6 * s, 3.2 * s, 2.3 * s);

  const headX = 0.7 * s;
  const headY = -12.8 * s;
  const headR = 5.0 * s;

  ctx.fillStyle = profile.skin;
  ctx.strokeStyle = "#082032";
  ctx.lineWidth = 1.15 * s;
  ctx.beginPath();
  ctx.arc(headX, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const lookForward = clamp(cosD * facing * 1.2, -0.4, 1.4);
  const lookVert = clamp(sinD * 1.1, -1.2, 1.4);
  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.arc(headX + (1.2 + lookForward * 0.5) * s, headY + (-0.4 + lookVert * 0.5) * s, 0.72 * s, 0, Math.PI * 2);
  ctx.arc(headX + (2.9 + lookForward * 0.5) * s, headY + (-0.4 + lookVert * 0.5) * s, 0.72 * s, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = profile.hair;
  ctx.beginPath();
  if (profile.hairStyle === "curly") {
    ctx.arc(headX - 1.1 * s, headY - 2.1 * s, 4.1 * s, Math.PI * 0.75, Math.PI * 1.95);
    ctx.arc(headX - 3.1 * s, headY - 0.4 * s, 2.4 * s, 0, Math.PI * 2);
    ctx.arc(headX + 1.0 * s, headY - 3.8 * s, 2.3 * s, 0, Math.PI * 2);
    ctx.fill();
  } else if (profile.hairStyle === "spiky") {
    ctx.arc(headX - 0.8 * s, headY - 1.3 * s, 4.8 * s, Math.PI * 0.78, Math.PI * 1.92);
    ctx.lineTo(headX + 4.1 * s, headY - 4.8 * s);
    ctx.lineTo(headX + 1.1 * s, headY - 4.3 * s);
    ctx.lineTo(headX + 2.0 * s, headY - 6.3 * s);
    ctx.closePath();
    ctx.fill();
  } else if (profile.hairStyle === "band") {
    ctx.arc(headX - 0.6 * s, headY - 1.1 * s, 4.9 * s, Math.PI * 0.78, Math.PI * 1.95);
    ctx.fill();
    ctx.strokeStyle = kit.collar;
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath();
    ctx.moveTo(headX - 4.5 * s, headY - 2.0 * s);
    ctx.quadraticCurveTo(headX, headY - 1.1 * s, headX + 4.4 * s, headY - 2.0 * s);
    ctx.stroke();
  } else {
    ctx.arc(headX - 0.7 * s, headY - 0.9 * s, 4.9 * s, Math.PI * 0.76, Math.PI * 1.94);
    ctx.fill();
  }

  ctx.restore();
  ctx.restore();
}

function drawPlayers(players, matchTime = 0) {
  const ctx = runtime.ctx;
  if (!ctx) return;

  for (let i = 0; i < (players || []).length; i += 1) {
    drawFootballerSprite(ctx, players[i], i, matchTime);
  }
}

function drawBall(ball) {
  const ctx = runtime.ctx;
  if (!ctx || !ball) return;

  const x = ball.x * FIELD.pxPerMeter;
  const y = ball.y * FIELD.pxPerMeter;
  const r = Math.max(8, ball.radius * FIELD.pxPerMeter * 1.05);

  ctx.save();
  ctx.translate(x, y);

  ctx.beginPath();
  ctx.ellipse(1.5, r * 0.75, r * 0.95, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.fill();

  const ballGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.32, r * 0.1, 0, 0, r);
  ballGrad.addColorStop(0, "#ffffff");
  ballGrad.addColorStop(0.72, "#f1f5f9");
  ballGrad.addColorStop(1, "#cbd5e1");

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = ballGrad;
  ctx.fill();
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = "#0f172a";
  ctx.stroke();

  const spinPhase = (ball.x * 0.85 + ball.y * 0.65);
  const patchX = Math.sin(spinPhase) * r * 0.28;
  const patchY = Math.cos(spinPhase * 0.9) * r * 0.24;

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r - 0.8, 0, Math.PI * 2);
  ctx.clip();

  ctx.strokeStyle = "rgba(30, 41, 59, 0.45)";
  ctx.lineWidth = 1.0;
  for (let i = 0; i < 5; i += 1) {
    const a = spinPhase * 0.4 + (i * Math.PI * 2) / 5;
    const vx = patchX + Math.cos(a) * r * 0.36;
    const vy = patchY + Math.sin(a) * r * 0.36;
    const ox = patchX + Math.cos(a) * r * 0.95;
    const oy = patchY + Math.sin(a) * r * 0.95;
    ctx.beginPath();
    ctx.moveTo(vx, vy);
    ctx.lineTo(ox, oy);
    ctx.stroke();

    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(ox, oy, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const a = spinPhase * 0.4 + (i * Math.PI * 2) / 5;
    const px = patchX + Math.cos(a) * r * 0.38;
    const py = patchY + Math.sin(a) * r * 0.38;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  ctx.restore();
  ctx.restore();
}

function drawMatch(match) {
  const ctx = runtime.ctx;
  const canvas = runtime.canvas;
  if (!ctx || !canvas) return;

  drawField();

  if (!match) {
    drawCenterText("Waiting to start training");
    return;
  }

  if (!runtime.showGames) {
    drawCenterText("Match rendering off — training in background");
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
    postMessage({ type: "error", message: `Worker frame error: ${error instanceof Error ? error.message : String(error)}` });
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
    let activations = inputs;
    const lastLayerIndex = this.weights.length - 1;

    for (let layerIndex = 0; layerIndex <= lastLayerIndex; layerIndex += 1) {
      const layerWeights = this.weights[layerIndex];
      const layerBiases = this.biases[layerIndex];
      const next = new Array(layerWeights.length);
      const isOutput = layerIndex === lastLayerIndex;

      for (let row = 0; row < layerWeights.length; row += 1) {
        let sum = layerBiases[row];
        const rowW = layerWeights[row];
        for (let col = 0; col < rowW.length; col += 1) {
          sum += rowW[col] * activations[col];
        }
        next[row] = isOutput ? Math.tanh(sum) : (sum > 0 ? sum : 0.1 * sum);
      }

      activations = next;
    }

    return activations;
  }

  trainStep(inputs, target, lr = 0.002) {
    const layerActs = [inputs];
    const layerSums = [];
    const lastLayerIndex = this.weights.length - 1;

    for (let l = 0; l <= lastLayerIndex; l += 1) {
      const w = this.weights[l];
      const b = this.biases[l];
      const prev = layerActs[l];
      const sums = new Array(w.length);
      const acts = new Array(w.length);
      const isOut = l === lastLayerIndex;
      for (let r = 0; r < w.length; r += 1) {
        let s = b[r];
        const row = w[r];
        for (let c = 0; c < row.length; c += 1) s += row[c] * prev[c];
        sums[r] = s;
        acts[r] = isOut ? Math.tanh(s) : (s > 0 ? s : 0.1 * s);
      }
      layerSums.push(sums);
      layerActs.push(acts);
    }

    const out = layerActs[lastLayerIndex + 1];
    let deltas = new Array(out.length);
    for (let i = 0; i < out.length; i += 1) {
      const err = out[i] - target[i];
      deltas[i] = 2 * err * (1 - out[i] * out[i]);
    }

    for (let l = lastLayerIndex; l >= 0; l -= 1) {
      const w = this.weights[l];
      const b = this.biases[l];
      const prev = layerActs[l];
      let prevDeltas = l > 0 ? new Array(prev.length).fill(0) : null;

      for (let r = 0; r < w.length; r += 1) {
        const d = clamp(deltas[r], -2, 2);
        b[r] -= lr * d;
        const row = w[r];
        for (let c = 0; c < row.length; c += 1) {
          if (prevDeltas) prevDeltas[c] += row[c] * d;
          row[c] -= lr * d * prev[c];
        }
      }

      if (prevDeltas) {
        const sums = layerSums[l - 1];
        for (let c = 0; c < prevDeltas.length; c += 1) {
          prevDeltas[c] *= sums[c] > 0 ? 1 : 0.1;
        }
        deltas = prevDeltas;
      }
    }
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
    this.teamPlayers = { A: [], B: [] };
    this.goalSensorTargets = {
      A: {
        own: { x: 0, y: FIELD.height / 2, radius: FIELD.goalWidth / 2 },
        opp: { x: FIELD.width, y: FIELD.height / 2, radius: FIELD.goalWidth / 2 },
      },
      B: {
        own: { x: FIELD.width, y: FIELD.height / 2, radius: FIELD.goalWidth / 2 },
        opp: { x: 0, y: FIELD.height / 2, radius: FIELD.goalWidth / 2 },
      },
    };
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
      `Regular time expired: match ${this.individualA.id} vs ${this.individualB.id} goes into golden-goal extra minute.`,
    );
  }

  setGoalWidth(goalWidth) {
    this.goalWidth = normalizeGoalWidth(goalWidth);
    if (this.config) {
      this.config.goalWidth = this.goalWidth;
    }
    this.goalTop = (FIELD.height - this.goalWidth) / 2;
    this.goalBottom = this.goalTop + this.goalWidth;

    const goalRadius = this.goalWidth / 2;
    this.goalSensorTargets.A.own.radius = goalRadius;
    this.goalSensorTargets.A.opp.radius = goalRadius;
    this.goalSensorTargets.B.own.radius = goalRadius;
    this.goalSensorTargets.B.opp.radius = goalRadius;
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
    this.teamPlayers.A = [];
    this.teamPlayers.B = [];
    this.createTeam("A", this.individualA.network);
    this.createTeam("B", this.individualB.network);
  }

  createTeam(team, network) {
    const count = clamp(Number(this.config.teamSize) || 3, 1, 8);
    const midX = FIELD.width / 2;
    const midY = FIELD.height / 2;
    const s = team === "A" ? 1 : -1;
    const baseOffsets = [
      { x: -12, y: 0 },
      { x: -20, y: -15 },
      { x: -34, y: 12 },
      { x: -22, y: 15 },
      { x: -36, y: -12 },
      { x: -42, y: 0 },
      { x: -16, y: -8 },
      { x: -16, y: 8 },
    ];

    for (let i = 0; i < count; i += 1) {
      const off = baseOffsets[i % baseOffsets.length];
      const x = clamp(midX + off.x * s + randRange(-1.5, 1.5), FIELD.playerRadius + 1, FIELD.width - FIELD.playerRadius - 1);
      const y = clamp(midY + off.y * s + randRange(-1.5, 1.5), FIELD.playerRadius + 1, FIELD.height - FIELD.playerRadius - 1);

      const player = {
        id: i,
        team,
        network,
        x,
        y,
        vx: 0,
        vy: 0,
        dir: team === "A" ? 0 : Math.PI,
        radius: FIELD.playerRadius,
        kickCooldown: 0,
        isTouchingBall: false,
        visionInputs: new Float32Array(INPUT_SIZE),
      };

      this.players.push(player);
      this.teamPlayers[team].push(player);
    }
  }

  resetBallToCenter(kickoffTeam = null) {
    const dir = kickoffTeam === "A" ? 1 : kickoffTeam === "B" ? -1 : (random() < 0.5 ? 1 : -1);
    this.ball.x = FIELD.width / 2;
    this.ball.y = FIELD.height / 2;
    this.ball.vx = dir * randRange(4, 8);
    this.ball.vy = randRange(-6, 6);
    this.ball.lastTouchTeam = null;
    this.ballTrail = [{ x: this.ball.x, y: this.ball.y }];
  }

  resetAfterGoal(concedingTeam = null) {
    this.resetBallToCenter(concedingTeam);
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
    if (player.kickCooldown > 0) {
      player.kickCooldown = Math.max(0, player.kickCooldown - dt);
    }

    const { inputs, target } = this.collectTacticalInputsAndExpert(player);
    if (runtime.trainer && runtime.trainer.generation < 50 && random() < 0.35) {
      player.network.trainStep(inputs, target, 0.0025);
    }
    const out = player.network.forward(inputs);
    const s = player.team === "A" ? 1 : -1;

    const targetVx = clamp(out[0] || 0, -1, 1) * s * MAX_PLAYER_SPEED;
    const targetVy = clamp(out[1] || 0, -1, 1) * s * MAX_PLAYER_SPEED;
    player.vx += (targetVx - player.vx) * Math.min(1, dt * 11);
    player.vy += (targetVy - player.vy) * Math.min(1, dt * 11);
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    if (Math.hypot(player.vx, player.vy) > 0.4) {
      player.dir = Math.atan2(player.vy, player.vx);
    }
    this.keepPlayerInBounds(player);

    const dxB = this.ball.x - player.x;
    const dyB = this.ball.y - player.y;
    const distB = Math.hypot(dxB, dyB);
    const kickReach = player.radius + this.ball.radius + 1.25;
    if (distB < kickReach && player.kickCooldown <= 0) {
      const kx = clamp(out[2] || 0, -1, 1) * s;
      const ky = clamp(out[3] || 0, -1, 1) * s;
      const kMag = Math.hypot(kx, ky);
      if (kMag > 0.14) {
        const kSpeed = clamp(kMag, 0.28, 1.0) * MAX_KICK_SPEED;
        const ang = Math.atan2(ky, kx) + randRange(-0.04, 0.04);
        this.ball.vx = Math.cos(ang) * kSpeed + player.vx * 0.15;
        this.ball.vy = Math.sin(ang) * kSpeed + player.vy * 0.15;
        player.kickCooldown = kMag > 0.6 ? 0.22 : 0.12;
        this.ball.lastTouchTeam = player.team;
        player.isTouchingBall = true;
      }
    }
  }

  collectTacticalInputsAndExpert(player) {
    const inputs = player.visionInputs || (player.visionInputs = new Float32Array(INPUT_SIZE));
    const teammates = player.team === "A" ? this.teamPlayers.A : this.teamPlayers.B;
    const opponents = player.team === "A" ? this.teamPlayers.B : this.teamPlayers.A;
    const s = player.team === "A" ? 1 : -1;
    const cx = FIELD.width / 2;
    const cy = FIELD.height / 2;

    const px = (player.x - cx) * s;
    const py = (player.y - cy) * s;
    const pvx = player.vx * s;
    const pvy = player.vy * s;
    const bx = (this.ball.x - cx) * s;
    const by = (this.ball.y - cy) * s;
    const bvx = this.ball.vx * s;
    const bvy = this.ball.vy * s;

    const dxB = bx - px;
    const dyB = by - py;
    const distB = Math.hypot(dxB, dyB) || 0.001;
    const canKick = distB < (player.radius + this.ball.radius + 1.35) ? 1 : 0;

    const sortedByBall = [...teammates].sort(
      (a, b) => Math.hypot(a.x - this.ball.x, a.y - this.ball.y) - Math.hypot(b.x - this.ball.x, b.y - this.ball.y),
    );
    let role = 1;
    if (sortedByBall[0] === player) {
      role = 0;
    } else if (teammates.length >= 2) {
      const others = sortedByBall.slice(1).sort((a, b) => ((a.x - cx) * s) - ((b.x - cx) * s));
      if (others[0] === player) role = 2;
    }

    let bestMate = null;
    let bestMateScore = -1e9;
    for (const m of teammates) {
      if (m === player) continue;
      const mx = (m.x - cx) * s;
      const my = (m.y - cy) * s;
      const score = mx * 1.6 - Math.abs(my) * 0.15;
      if (score > bestMateScore) {
        bestMateScore = score;
        bestMate = m;
      }
    }
    const tx = bestMate ? (bestMate.x - cx) * s : px + 16;
    const ty = bestMate ? (bestMate.y - cy) * s : -py;

    let nearOpp = null;
    let nearOppDist = 1e9;
    let oppKeeperY = 0;
    let maxOppX = -1e9;
    for (const op of opponents) {
      const ox = (op.x - cx) * s;
      const oy = (op.y - cy) * s;
      const d = Math.hypot(ox - px, oy - py);
      if (d < nearOppDist) {
        nearOppDist = d;
        nearOpp = op;
      }
      if (ox > maxOppX) {
        maxOppX = ox;
        oppKeeperY = oy;
      }
    }
    const ox = nearOpp ? (nearOpp.x - cx) * s : 55;
    const oy = nearOpp ? (nearOpp.y - cy) * s : 0;
    const openCornerSign = oppKeeperY >= 0 ? -1 : 1;

    inputs[0] = clamp(px / 55, -1, 1);
    inputs[1] = clamp(py / 34, -1, 1);
    inputs[2] = clamp(pvx / MAX_PLAYER_SPEED, -1, 1);
    inputs[3] = clamp(pvy / MAX_PLAYER_SPEED, -1, 1);
    inputs[4] = clamp(dxB / 55, -1, 1);
    inputs[5] = clamp(dyB / 34, -1, 1);
    inputs[6] = dxB / distB;
    inputs[7] = dyB / distB;
    inputs[8] = clamp(1 - distB / 65, 0, 1);
    inputs[9] = canKick;
    inputs[10] = clamp(bvx / MAX_KICK_SPEED, -1, 1);
    inputs[11] = clamp(bvy / MAX_KICK_SPEED, -1, 1);
    inputs[12] = clamp((55 - bx) / 55, -1, 1);
    inputs[13] = clamp((0 - by) / 34, -1, 1);
    inputs[14] = clamp((-55 - px) / 55, -1, 1);
    inputs[15] = clamp((0 - py) / 34, -1, 1);
    inputs[16] = role === 0 ? 1 : 0;
    inputs[17] = role === 1 ? 1 : 0;
    inputs[18] = role === 2 ? 1 : 0;
    inputs[19] = clamp((tx - px) / 55, -1, 1);
    inputs[20] = clamp((ty - py) / 34, -1, 1);
    inputs[21] = clamp((ox - px) / 55, -1, 1);
    inputs[22] = clamp((oy - py) / 34, -1, 1);
    inputs[23] = openCornerSign;

    let desVx = 0, desVy = 0, kickX = 0, kickY = 0;
    const goalAimY = openCornerSign * 8.2;
    const gdx = 55 - bx, gdy = goalAimY - by;
    const gDist = Math.hypot(gdx, gdy) || 1;
    const uxGoal = gdx / gDist, uyGoal = gdy / gDist;

    if (role === 0) {
      const predBx = clamp(bx + bvx * 0.14, -51, 51);
      const predBy = clamp(by + bvy * 0.14, -30, 30);
      let targetX = predBx - uxGoal * 1.6;
      let targetY = predBy - uyGoal * 1.6;
      if (px > predBx + 0.4 && Math.abs(py - predBy) < 4.5) {
        targetX = predBx - 3.5;
        targetY = predBy + (py >= predBy ? 4.8 : -4.8);
      }
      const mdx = targetX - px, mdy = targetY - py;
      const mDist = Math.hypot(mdx, mdy) || 1;
      desVx = (mdx / mDist) * 0.98;
      desVy = (mdy / mDist) * 0.98;
      if (canKick) {
        const oppPressing = ox > px - 1.5 && ox < px + 11 && Math.abs(oy - py) < 5.5;
        const mateOpen = bestMate && tx > px + 4 && Math.hypot(tx - ox, ty - oy) > 5.5;
        if (bx > 14) {
          kickX = uxGoal;
          kickY = uyGoal;
        } else if (oppPressing && mateOpen) {
          const pdx = clamp(tx + 6, -35, 46) - bx;
          const pdy = clamp(ty, -26, 26) - by;
          const pDist = Math.hypot(pdx, pdy) || 1;
          kickX = (pdx / pDist) * 0.72;
          kickY = (pdy / pDist) * 0.72;
        } else {
          const dodgeY = (py >= oy ? 1 : -1) * 0.35;
          const ddx = uxGoal * 0.9, ddy = clamp(uyGoal + dodgeY, -0.8, 0.8);
          const dLen = Math.hypot(ddx, ddy) || 1;
          kickX = (ddx / dLen) * 0.42;
          kickY = (ddy / dLen) * 0.42;
        }
      }
    } else if (role === 1) {
      const wingY = by >= 0 ? -15 : 15;
      const targetX = clamp(bx + 16, -12, 40);
      const targetY = clamp(wingY, -24, 24);
      const mdx = targetX - px, mdy = targetY - py;
      const mDist = Math.hypot(mdx, mdy) || 1;
      const speedScale = clamp(mDist / 6, 0.3, 0.96);
      desVx = (mdx / mDist) * speedScale;
      desVy = (mdy / mDist) * speedScale;
      if (canKick) {
        kickX = uxGoal * 0.98;
        kickY = uyGoal * 0.98;
      }
    } else {
      const defX = bx < 0 ? clamp(bx * 0.4 - 24, -45, -16) : -28;
      const defY = clamp(by * 0.38, -6.5, 6.5);
      const mdx = defX - px, mdy = defY - py;
      const mDist = Math.hypot(mdx, mdy) || 1;
      const speedScale = clamp(mDist / 7, 0.2, 0.76);
      desVx = (mdx / mDist) * speedScale;
      desVy = (mdy / mDist) * speedScale;
      if (canKick) {
        const pdx = tx - bx, pdy = ty - by;
        const pDist = Math.hypot(pdx, pdy) || 1;
        kickX = (pdx / pDist) * 0.78;
        kickY = (pdy / pDist) * 0.78;
      }
    }

    return {
      inputs,
      target: [clamp(desVx, -1, 1), clamp(desVy, -1, 1), clamp(kickX, -1, 1), clamp(kickY, -1, 1)],
    };
  }

  keepPlayerInBounds(player) {
    player.x = clamp(player.x, player.radius, FIELD.width - player.radius);
    player.y = clamp(player.y, player.radius, FIELD.height - player.radius);
  }

  handlePlayerCollisions() {
    for (let i = 0; i < this.players.length; i += 1) {
      for (let j = i + 1; j < this.players.length; j += 1) {
        const a = this.players[i];
        const b = this.players[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const minD = a.radius + b.radius + 0.35;
        if (d < minD) {
          const overlap = (minD - d) * 0.5;
          const ux = dx / d;
          const uy = dy / d;
          a.x = clamp(a.x - ux * overlap, a.radius, FIELD.width - a.radius);
          a.y = clamp(a.y - uy * overlap, a.radius, FIELD.height - a.radius);
          b.x = clamp(b.x + ux * overlap, b.radius, FIELD.width - b.radius);
          b.y = clamp(b.y + uy * overlap, b.radius, FIELD.height - b.radius);
        }
      }
    }
  }

  updateBall(dt) {
    for (const player of this.players) {
      const dx = this.ball.x - player.x;
      const dy = this.ball.y - player.y;
      const distance = Math.hypot(dx, dy) || 0.0001;
      const minDistance = this.ball.radius + player.radius;

      if (distance < minDistance) {
        const ux = dx / distance;
        const uy = dy / distance;
        this.ball.x = player.x + ux * minDistance;
        this.ball.y = player.y + uy * minDistance;
        const relV = (this.ball.vx - player.vx) * ux + (this.ball.vy - player.vy) * uy;
        if (relV < 0) {
          this.ball.vx -= 1.3 * relV * ux;
          this.ball.vy -= 1.3 * relV * uy;
        }
        this.ball.lastTouchTeam = player.team;
        player.isTouchingBall = true;
      } else {
        player.isTouchingBall = false;
      }
    }

    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;
    const drag = Math.pow(0.54, dt);
    this.ball.vx *= drag;
    this.ball.vy *= drag;

    if (this.ball.y - this.ball.radius <= 0) {
      this.ball.y = this.ball.radius;
      this.ball.vy = Math.abs(this.ball.vy) * 0.82;
    }

    if (this.ball.y + this.ball.radius >= FIELD.height) {
      this.ball.y = FIELD.height - this.ball.radius;
      this.ball.vy = -Math.abs(this.ball.vy) * 0.82;
    }

    const cornerBevel = 5.0;
    const corners = [
      { cx: 0, cy: 0, nx: 0.707, ny: 0.707 },
      { cx: FIELD.width, cy: 0, nx: -0.707, ny: 0.707 },
      { cx: 0, cy: FIELD.height, nx: 0.707, ny: -0.707 },
      { cx: FIELD.width, cy: FIELD.height, nx: -0.707, ny: -0.707 },
    ];
    for (const c of corners) {
      const distC = Math.hypot(this.ball.x - c.cx, this.ball.y - c.cy);
      if (distC < cornerBevel) {
        this.ball.x = c.cx + c.nx * cornerBevel;
        this.ball.y = c.cy + c.ny * cornerBevel;
        const dot = this.ball.vx * c.nx + this.ball.vy * c.ny;
        if (dot < 4) {
          this.ball.vx += (6 - dot) * c.nx;
          this.ball.vy += (6 - dot) * c.ny;
        }
      }
    }

    if (this.ball.x - this.ball.radius <= 0) {
      if (this.ball.y >= this.goalTop && this.ball.y <= this.goalBottom) {
        this.registerGoal("B");
        return;
      }

      this.ball.x = this.ball.radius;
      this.ball.vx = Math.abs(this.ball.vx) * 0.82;
    }

    if (this.ball.x + this.ball.radius >= FIELD.width) {
      if (this.ball.y >= this.goalTop && this.ball.y <= this.goalBottom) {
        this.registerGoal("A");
        return;
      }

      this.ball.x = FIELD.width - this.ball.radius;
      this.ball.vx = -Math.abs(this.ball.vx) * 0.82;
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
      `Goal: ${scoringTeam} (${this.individualA.id} vs ${this.individualB.id}) — score ${this.score.A}:${this.score.B}${endedInAddedTime ? " · match ended in extra time" : ""}`,
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

  isConnectionChangeTrackingEnabled() {
    return normalizeNetworkVizChangeHistoryCollection(this.config?.collectNetworkVizChangeHistory);
  }

  updateConnectionChangeTrackingEnabled(enabled) {
    const normalized = normalizeNetworkVizChangeHistoryCollection(enabled);
    if (!this.config) {
      return normalized;
    }

    this.config.collectNetworkVizChangeHistory = normalized;
    if (!normalized) {
      for (const individual of this.population || []) {
        individual.visualizationConnectionCounts = {};
      }
      if (this.bestEver) {
        this.bestEver.connectionChangeCounts = {};
      }
      if (this.lineageBest) {
        this.lineageBest.connectionChangeCounts = {};
      }
      if (this.generationLeader) {
        this.generationLeader.connectionChangeCounts = {};
      }
      this.lineageHistory = normalizeVisualizationHistory(this.lineageHistory).map((entry) => ({
        ...entry,
        snapshot: entry.snapshot ? { ...entry.snapshot, connectionChangeCounts: {} } : entry.snapshot,
      }));
      this.generationTimeline = normalizeGenerationTimeline(this.generationTimeline).map((entry) => ({
        ...entry,
        individuals: entry.individuals.map((individual) => ({
          ...individual,
          snapshot: individual.snapshot ? { ...individual.snapshot, connectionChangeCounts: {} } : individual.snapshot,
        })),
      }));
    }

    this.markNetworkVisualizationDirty();
    return this.config.collectNetworkVizChangeHistory;
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
      const changeTrackingEnabled = this.isConnectionChangeTrackingEnabled();
      this.generationLeader = {
        generation: this.generation,
        id: individual.id,
        fitness: individual.fitness,
        parentIds: normalizeParentIds(individual.visualizationParentIds),
        createdBy: typeof individual.visualizationOrigin === "string" ? individual.visualizationOrigin : this.generation <= 1 ? "initial" : "mutation",
        connectionChangeCounts: changeTrackingEnabled ? normalizeConnectionChangeCounts(individual.visualizationConnectionCounts) : {},
        network: individual.network.clone(),
      };
    }
  }

  getDisplayedNetworkSnapshot() {
    const changeTrackingEnabled = this.isConnectionChangeTrackingEnabled();
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
        connectionChangeCounts: changeTrackingEnabled ? normalizeConnectionChangeCounts(this.bestEver.connectionChangeCounts) : {},
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
        connectionChangeCounts: changeTrackingEnabled ? normalizeConnectionChangeCounts(fallback.visualizationConnectionCounts) : {},
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
      collectNetworkVizChangeHistory: normalizeNetworkVizChangeHistoryCollection(config.collectNetworkVizChangeHistory),
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
        `Save loaded: generation ${this.generation}, best fitness ${this.bestFitness.toFixed(2)}.`,
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
      `New training started: population ${this.config.populationSize}, players ${this.config.teamSize}, match ${this.config.matchMinutes} min.`,
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
      collectNetworkVizChangeHistory: normalizeNetworkVizChangeHistoryCollection(
        savedData.config?.collectNetworkVizChangeHistory ?? fallbackConfig.collectNetworkVizChangeHistory,
      ),
    };

    const changeTrackingEnabled = normalizeNetworkVizChangeHistoryCollection(mergedConfig.collectNetworkVizChangeHistory);
    this.config = mergedConfig;
    this.population = savedData.population.map((individual) => ({
      id: Number(individual.id) || (nextIndividualId += 1),
      network: deserializeNetwork(individual.network),
      fitness: Number(individual.fitness) || 0,
      visualizationChangedConnections: Array.isArray(individual.visualizationChangedConnections)
        ? individual.visualizationChangedConnections.filter((key) => typeof key === "string")
        : [],
      visualizationConnectionCounts: changeTrackingEnabled ? normalizeConnectionChangeCounts(individual.visualizationConnectionCounts) : {},
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
          connectionChangeCounts: changeTrackingEnabled ? normalizeConnectionChangeCounts(savedData.bestEver.connectionChangeCounts) : {},
          network: deserializeNetwork(savedData.bestEver.network),
        }
      : null;

    this.restoreVisualizationState(savedData.visualization || {});
    if (!this.isConnectionChangeTrackingEnabled()) {
      this.updateConnectionChangeTrackingEnabled(false);
    }
    if (!this.lineageBest?.network && this.bestEver?.network) {
      this.lineageBest = {
        generation: this.generation,
        id: this.bestEver.id,
        fitness: this.bestEver.fitness,
        connectionChangeCounts: changeTrackingEnabled ? normalizeConnectionChangeCounts(this.bestEver.connectionChangeCounts) : {},
        network: this.bestEver.network.clone(),
      };
    }
    if (!this.generationLeader?.network && this.lineageBest?.network) {
      this.generationLeader = {
        generation: this.generation,
        id: this.lineageBest.id,
        fitness: this.lineageBest.fitness,
        connectionChangeCounts: changeTrackingEnabled ? normalizeConnectionChangeCounts(this.lineageBest.connectionChangeCounts) : {},
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
      match.teamPlayers = { A: [], B: [] };
      match.players = savedMatch.players.map((player) => {
        const restoredPlayer = {
          team: player.team === "B" ? "B" : "A",
          network: (player.team === "B" ? this.currentB : this.currentA).network,
          x: Number(player.x) || 0,
          y: Number(player.y) || 0,
          vx: Number(player.vx) || 0,
          vy: Number(player.vy) || 0,
          dir: Number(player.dir) || 0,
          radius: Number(player.radius) || FIELD.playerRadius,
          isTouchingBall: Boolean(player.isTouchingBall),
          visionInputs: new Float32Array(INPUT_SIZE),
        };

        match.teamPlayers[restoredPlayer.team].push(restoredPlayer);
        return restoredPlayer;
      });
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
        this.onLog(`Match duration reduced to ${minutes} min. Current match ended early.`);
        this.completeCurrentMatch();
        return minutes;
      }
    }

    this.onLog(`Duration of current and upcoming matches: ${minutes} min.`);
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
      this.onLog(`Match ${skippedLabel} skipped. Opened next match.`);
      return true;
    }

    return false;
  }

  finishGeneration() {
    const ranked = [...this.population].sort((a, b) => b.fitness - a.fitness);
    const historyEnabled = this.isEvolutionVisualizationEnabled();
    const changeTrackingEnabled = this.isConnectionChangeTrackingEnabled();
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
          connectionChangeCounts: changeTrackingEnabled ? normalizeConnectionChangeCounts(individual.visualizationConnectionCounts) : {},
          snapshot: {
            generation: this.generation,
            id: individual.id,
            fitness: individual.fitness,
            parentIds: normalizeParentIds(individual.visualizationParentIds),
            createdBy: typeof individual.visualizationOrigin === "string" ? individual.visualizationOrigin : this.generation <= 1 ? "initial" : "mutation",
            connectionChangeCounts: changeTrackingEnabled ? normalizeConnectionChangeCounts(individual.visualizationConnectionCounts) : {},
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
        connectionChangeCounts: changeTrackingEnabled ? normalizeConnectionChangeCounts(leader.visualizationConnectionCounts) : {},
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
        visualizationConnectionCounts: changeTrackingEnabled ? cloneConnectionChangeCounts(ranked[i].visualizationConnectionCounts) : {},
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
      const inheritedConnectionCounts = changeTrackingEnabled
        ? buildInheritedConnectionChangeCounts(
            child,
            parentA.network,
            parentA.visualizationConnectionCounts,
            parentB?.network || null,
            parentB?.visualizationConnectionCounts || {},
          )
        : {};
      const visualizationChangedConnections = historyEnabled ? changedConnectionKeys : [];
      const visualizationConnectionCounts = changeTrackingEnabled
        ? incrementConnectionChangeCounts(
            inheritedConnectionCounts,
            changedConnectionKeys,
            this.generation + 1,
          )
        : {};

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

function senseTargets(player, targets, output = null, offset = 0, excludedTarget = null) {
  const sensors = output || new Array(SENSOR_COUNT).fill(0);

  for (let i = 0; i < SENSOR_COUNT; i += 1) {
    sensors[offset + i] = 0;
  }

  for (const target of targets) {
    if (!target || target === excludedTarget) {
      continue;
    }

    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const distance = Math.max(0, Math.hypot(dx, dy) - (target.radius || 0));

    if (distance > MAX_SIGHT) continue;

    const angle = normalizeAngle(Math.atan2(dy, dx) - player.dir);
    const normalized = (angle + Math.PI) / (Math.PI * 2);
    const sector = Math.min(SENSOR_COUNT - 1, Math.floor(normalized * SENSOR_COUNT));
    const intensity = 1 - clamp(distance / MAX_SIGHT, 0, 1);
    const sensorIndex = offset + sector;
    sensors[sensorIndex] = Math.max(sensors[sensorIndex], intensity);
  }

  return sensors;
}

function senseDirectionAndDistance(player, target, output = null, offset = 0) {
  const sensors = output || [0, 1];
  if (!target) {
    sensors[offset] = 0;
    sensors[offset + 1] = 1;
    return sensors;
  }

  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const distance = Math.max(0, Math.hypot(dx, dy) - (target.radius || 0));
  const angle = normalizeAngle(Math.atan2(dy, dx) - player.dir);

  sensors[offset] = clamp(angle / Math.PI, -1, 1);
  sensors[offset + 1] = clamp(distance / MAX_SIGHT, 0, 1);
  return sensors;
}

function senseBoundaries(player, output = null, offset = 0) {
  const sensors = output || new Array(SENSOR_COUNT).fill(0);

  for (let i = 0; i < SENSOR_COUNT; i += 1) {
    const angle = player.dir - Math.PI + (i + 0.5) * ((Math.PI * 2) / SENSOR_COUNT);
    const distance = distanceToBoundary(player.x, player.y, angle);
    sensors[offset + i] = 1 - clamp(distance / MAX_SIGHT, 0, 1);
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
        if (payload.config && Object.hasOwn(payload.config, "useMaxSpeed")) {
          runtime.useMaxSpeed = Boolean(payload.config.useMaxSpeed);
        }
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
        runtime.stepsPerFrame = Math.max(0.25, Number(payload.stepsPerFrame) || 1);
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
          if (Object.hasOwn(payload, "collectNetworkVizChangeHistory")) {
            payload.collectNetworkVizChangeHistory = normalizeNetworkVizChangeHistoryCollection(payload.collectNetworkVizChangeHistory);
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
            if (Object.hasOwn(payload, "collectNetworkVizChangeHistory")) {
              runtime.trainer.updateConnectionChangeTrackingEnabled(payload.collectNetworkVizChangeHistory);
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
