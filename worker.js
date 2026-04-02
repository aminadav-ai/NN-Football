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
const BALL_TRAIL_SPEED_THRESHOLD = 1.1;
const FITNESS_SETTINGS_DEFAULTS = {
  ballTouchReward: 1.5,
  goalReward: 35,
  concededPenalty: -10,
  ownGoalPenalty: -25,
  playerContactPenalty: -0.01,
  hardCollisionPenalty: -1.5,
};
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
  lastSaveAt: 0,
  canvas: null,
  ctx: null,
  showGames: true,
  showTimeIndicator: true,
  showFieldStripes: true,
  useMaxSpeed: false,
  accumulator: 0,
  previousRenderMatch: null,
  currentRenderMatch: null,
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

function normalizeFitnessSettings(settings = {}) {
  return {
    ballTouchReward: toFiniteNumber(settings.ballTouchReward, FITNESS_SETTINGS_DEFAULTS.ballTouchReward),
    goalReward: toFiniteNumber(settings.goalReward, FITNESS_SETTINGS_DEFAULTS.goalReward),
    concededPenalty: toFiniteNumber(settings.concededPenalty, FITNESS_SETTINGS_DEFAULTS.concededPenalty),
    ownGoalPenalty: toFiniteNumber(settings.ownGoalPenalty, FITNESS_SETTINGS_DEFAULTS.ownGoalPenalty),
    playerContactPenalty: toFiniteNumber(settings.playerContactPenalty, FITNESS_SETTINGS_DEFAULTS.playerContactPenalty),
    hardCollisionPenalty: toFiniteNumber(settings.hardCollisionPenalty, FITNESS_SETTINGS_DEFAULTS.hardCollisionPenalty),
  };
}

function createEmptyFitnessBreakdown() {
  return {
    ballTouch: 0,
    goals: 0,
    conceded: 0,
    ownGoal: 0,
    playerContact: 0,
    hardCollision: 0,
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
    individualA: currentA ? { id: currentA.id } : null,
    individualB: currentB ? { id: currentB.id } : null,
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
    ball: { ...match.ball },
    ballTrail: match.ballTrail.map((point) => ({ ...point })),
    players: match.players.map((player) => ({
      team: player.team,
      x: player.x,
      y: player.y,
      vx: player.vx,
      vy: player.vy,
      dir: player.dir,
      radius: player.radius,
      lastTouchAt: player.lastTouchAt,
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
    version: 2,
    savedAt: Date.now(),
    generation: trainer.generation,
    bestFitness: trainer.bestFitness,
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

function emitSaveData(force = false) {
  const now = performance.now();
  if (!force && now - runtime.lastSaveAt < 900) {
    return;
  }

  const payload = createSavePayload();
  if (!payload) {
    return;
  }

  runtime.lastSaveAt = now;
  postMessage({ type: "saveData", payload });
}

function emitStatus(force = false) {
  const trainer = runtime.trainer;
  if (!trainer && !force) {
    return;
  }

  const now = performance.now();
  if (!force && now - runtime.lastStatusAt < 33) {
    return;
  }

  const payload = {
    snapshotAt: now,
    generation: trainer?.generation || 0,
    matchInfo: trainer?.currentMatch
      ? `${trainer.matchCursor + 1}/${trainer.schedule.length} · ${trainer.currentA.id} vs ${trainer.currentB.id}`
      : "—",
    bestFitness: trainer?.bestFitness || 0,
    running: Boolean(trainer?.running),
    isPaused: runtime.isPaused,
    currentMatch: trainer?.currentMatch ? serializeMatchState(trainer.currentMatch, trainer.currentA, trainer.currentB) : null,
  };

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

function drawField() {
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

  const goalHeightPx = FIELD.goalWidth * FIELD.pxPerMeter;
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

  const totalSeconds = Math.max(1, Number(match.duration) || 1);
  const progress = clamp((Number(match.time) || 0) / totalSeconds, 0, 1);
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

function renderFrame(now) {
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

    emitSaveData(false);
  }

  const alpha = clamp(runtime.accumulator / STEP_DT, 0, 1);
  const matchForRender = interpolateMatchState(runtime.previousRenderMatch, runtime.currentRenderMatch, alpha);
  drawMatch(matchForRender || runtime.currentRenderMatch);
  emitStatus(false);

  runtime.loopId = requestWorkerFrame(renderFrame);
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
      lastTouchAt: -999,
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
        lastTouchAt: -999,
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
    this.ball.lastTouchAt = -999;
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
        const { touching, impact, initiator } = resolveElasticCollision(a, b, 0.88);

        if (touching && initiator) {
          this.addFitness(initiator.team, "playerContact", this.getFitnessSetting("playerContactPenalty"));
        }

        if (impact > HARD_COLLISION_THRESHOLD && initiator) {
          this.addFitness(initiator.team, "hardCollision", this.getFitnessSetting("hardCollisionPenalty"));
        }
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

        if (!player.isTouchingBall) {
          this.addFitness(player.team, "ballTouch", this.getFitnessSetting("ballTouchReward"));
          player.lastTouchAt = this.time;
          this.ball.lastTouchTeam = player.team;
          this.ball.lastTouchAt = this.time;
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

    const inCorner = (
      (this.ball.x - this.ball.radius <= 0 || this.ball.x + this.ball.radius >= FIELD.width)
      && (this.ball.y - this.ball.radius <= 0 || this.ball.y + this.ball.radius >= FIELD.height)
    );
    if (inCorner) {
      this.resetBallToCenter();
      return;
    }

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
    nextIndividualId = Math.max(nextIndividualId, Number(savedData.nextIndividualId) || 0, maxLoadedId);
    this.generation = Math.max(1, Math.floor(Number(savedData.generation) || 1));
    this.bestFitness = Number(savedData.bestFitness) || 0;
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
      ...match.ball,
      ...(savedMatch.ball || {}),
      radius: FIELD.ballRadius,
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
        lastTouchAt: Number(player.lastTouchAt) || -999,
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
    for (const individual of this.population) {
      individual.fitness = 0;
    }

    this.schedule = [];
    for (let indexA = 0; indexA < this.population.length; indexA += 1) {
      for (let indexB = indexA + 1; indexB < this.population.length; indexB += 1) {
        this.schedule.push([indexA, indexB]);
      }
    }

    this.schedule = shuffle(this.schedule);
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

    this.bestFitness = Math.max(this.bestFitness, this.currentA.fitness, this.currentB.fitness);
    this.matchCursor += 1;

    if (this.matchCursor >= this.schedule.length) {
      this.finishGeneration();
    } else {
      this.loadNextMatch();
      emitSaveData(true);
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
    this.bestFitness = Math.max(this.bestFitness, leader.fitness);
    this.prepareGeneration();
    emitSaveData(true);
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
          }
          if (Object.hasOwn(payload, "showTimeIndicator")) {
            runtime.showTimeIndicator = payload.showTimeIndicator !== false;
          }
          if (Object.hasOwn(payload, "showFieldStripes")) {
            runtime.showFieldStripes = payload.showFieldStripes !== false;
          }
          if (Object.hasOwn(payload, "useMaxSpeed")) {
            runtime.useMaxSpeed = Boolean(payload.useMaxSpeed);
          }
          if (runtime.trainer?.config) {
            Object.assign(runtime.trainer.config, payload);
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
