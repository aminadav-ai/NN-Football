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
const MAX_SIGHT = 42;
const MAX_PLAYER_SPEED = 12;
const STEP_DT = 0.08;
const FAST_STEPS = 24;
const SLOW_STEPS = 1;
const BALL_TRAIL_SPEED_THRESHOLD = 1.1;
const BALL_PROXIMITY_REWARD = 0.01;
const BALL_POSSESSION_REWARD = 0.02;
const PLAYER_CONTACT_PENALTY = 0.01;
const HARD_COLLISION_THRESHOLD = 1.5;
const HARD_COLLISION_PENALTY = 1.5;

const TEAM_COLORS = {
  A: "#61a8ff",
  B: "#ff8d6b",
};

const ui = {
  canvas: document.getElementById("pitch"),
  pitchStage: document.getElementById("pitchStage"),
  teamSize: document.getElementById("teamSize"),
  hiddenLayers: document.getElementById("hiddenLayers"),
  neuronsPerLayer: document.getElementById("neuronsPerLayer"),
  populationSize: document.getElementById("populationSize"),
  matchMinutes: document.getElementById("matchMinutes"),
  startBtn: document.getElementById("startBtn"),
  slowBtn: document.getElementById("slowBtn"),
  fastBtn: document.getElementById("fastBtn"),
  showBtn: document.getElementById("showBtn"),
  hideBtn: document.getElementById("hideBtn"),
  skipBtn: document.getElementById("skipBtn"),
  generation: document.getElementById("generation"),
  matchInfo: document.getElementById("matchInfo"),
  bestFitness: document.getElementById("bestFitness"),
  modeInfo: document.getElementById("modeInfo"),
  renderInfo: document.getElementById("renderInfo"),
  log: document.getElementById("log"),
};

const ctx = ui.canvas.getContext("2d");

const state = {
  showGames: true,
  stepsPerFrame: SLOW_STEPS,
  mode: "Медленный",
  trainer: null,
  lastFrameTime: null,
  pitchWidth: 550,
  pitchResize: null,
};

let nextIndividualId = 1;
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
  "Нажмите «Запустить обучение», чтобы начать эволюцию популяции.",
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
  ui.log.textContent = logs.slice(0, 16).join("\n");
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
      });
    }
  }

  resetAfterGoal() {
    this.ball.x = FIELD.width / 2;
    this.ball.y = FIELD.height / 2;
    this.ball.vx = randRange(-0.6, 0.6);
    this.ball.vy = randRange(-0.6, 0.6);
    this.ball.lastTouchTeam = null;
    this.ball.lastTouchAt = -999;
    this.ballTrail = [{ x: this.ball.x, y: this.ball.y }];
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
    this.rewardBallProximity();
    this.rewardBallPossession();

    if (this.time >= this.duration) {
      this.finish();
    }
  }

  finish() {
    if (this.done) return;
    this.done = true;
    const diff = this.score.A - this.score.B;
    this.teamFitness.A += diff * 4;
    this.teamFitness.B -= diff * 4;
  }

  rewardBallProximity() {
    let closestA = Infinity;
    let closestB = Infinity;

    for (const player of this.players) {
      const distance = Math.hypot(player.x - this.ball.x, player.y - this.ball.y);
      if (player.team === "A") {
        closestA = Math.min(closestA, distance);
      } else {
        closestB = Math.min(closestB, distance);
      }
    }

    if (Math.abs(closestA - closestB) < 0.001) {
      return;
    }

    if (closestA < closestB) {
      this.teamFitness.A += BALL_PROXIMITY_REWARD;
    } else {
      this.teamFitness.B += BALL_PROXIMITY_REWARD;
    }
  }

  rewardBallPossession() {
    if (this.ball.lastTouchTeam && this.time - this.ball.lastTouchAt < 1.2) {
      this.teamFitness[this.ball.lastTouchTeam] += BALL_POSSESSION_REWARD;
    }
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
          this.teamFitness[initiator.team] -= PLAYER_CONTACT_PENALTY;
        }

        if (impact > HARD_COLLISION_THRESHOLD && initiator) {
          this.teamFitness[initiator.team] -= HARD_COLLISION_PENALTY;
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
        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = minDistance - distance;

        this.ball.x += nx * overlap;
        this.ball.y += ny * overlap;

        const push = Math.max(2, Math.hypot(player.vx, player.vy) * 0.9 + 2.5);
        this.ball.vx += nx * push + player.vx * 0.35;
        this.ball.vy += ny * push + player.vy * 0.35;

        if (this.time - player.lastTouchAt > 0.35) {
          this.teamFitness[player.team] += 1.5;
          player.lastTouchAt = this.time;
          this.ball.lastTouchTeam = player.team;
          this.ball.lastTouchAt = this.time;
        }
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
    this.teamFitness[scoringTeam] += 35;
    this.teamFitness[concedingTeam] -= 10;

    if (this.ball.lastTouchTeam === concedingTeam) {
      this.teamFitness[concedingTeam] -= 25;
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
  }

  start(config) {
    this.config = config;
    this.population = this.createPopulation(config);
    this.generation = 1;
    this.bestFitness = 0;
    this.bestEver = null;
    this.running = true;
    this.prepareGeneration();
    this.onLog(
      `Старт обучения: популяция ${config.populationSize}, игроков ${config.teamSize}, матч ${config.matchMinutes} мин.`,
    );
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
    this.bestFitness = Math.max(this.bestFitness, leader.fitness);
    this.prepareGeneration();
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
      bestFitness: this.bestFitness,
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
  };
}

function drawField() {
  ctx.clearRect(0, 0, ui.canvas.width, ui.canvas.height);

  ctx.fillStyle = "#1b7f38";
  ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);

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

  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.fillRect(14, 14, 180, 56);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px Inter, sans-serif";
  ctx.fillText(`${match.score.A} : ${match.score.B}`, 32, 40);
  ctx.font = "14px Inter, sans-serif";
  ctx.fillText(`t = ${match.time.toFixed(1)} / ${match.duration} c`, 32, 60);

  const fitnessBoxWidth = 300;
  const fitnessBoxX = (ui.canvas.width - fitnessBoxWidth) / 2;
  ctx.fillStyle = "rgba(0,0,0,0.38)";
  ctx.fillRect(fitnessBoxX, 14, fitnessBoxWidth, 56);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "bold 22px Inter, sans-serif";
  ctx.fillText(`${match.teamFitness.A.toFixed(2)} : ${match.teamFitness.B.toFixed(2)}`, ui.canvas.width / 2, 40);
  ctx.font = "14px Inter, sans-serif";
  ctx.fillText("Фитнес за матч", ui.canvas.width / 2, 60);
  ctx.textAlign = "start";
}

function drawCenterText(text) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(0, 0, ui.canvas.width, ui.canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 28px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, ui.canvas.width / 2, ui.canvas.height / 2);
  ctx.textAlign = "start";
}

function updateStats() {
  const status = state.trainer?.getStatus() || {
    generation: 0,
    matchInfo: "—",
    bestFitness: 0,
    currentMatch: null,
  };

  ui.generation.textContent = String(status.generation);
  ui.matchInfo.textContent = status.matchInfo;
  ui.bestFitness.textContent = status.bestFitness.toFixed(2);
  ui.modeInfo.textContent = state.mode;
  ui.renderInfo.textContent = state.showGames ? "Вкл." : "Выкл.";

  drawMatch(status.currentMatch);
}

function tick(timestamp) {
  if (state.lastFrameTime === null) {
    state.lastFrameTime = timestamp;
  }

  const elapsedSeconds = clamp((timestamp - state.lastFrameTime) / 1000, 0, 0.1);
  state.lastFrameTime = timestamp;

  if (state.trainer?.running) {
    state.trainer.step(elapsedSeconds * state.stepsPerFrame);
  }

  updateStats();
  requestAnimationFrame(tick);
}

ui.startBtn.addEventListener("click", () => {
  const trainer = new EvolutionTrainer(addLog);
  trainer.start(readConfig());
  state.trainer = trainer;
  state.lastFrameTime = performance.now();
  addLog("Обучение запущено.");
});

ui.slowBtn.addEventListener("click", () => {
  state.stepsPerFrame = SLOW_STEPS;
  state.mode = "Медленный";
  state.lastFrameTime = performance.now();
  addLog("Включён медленный режим реального времени.");
});

ui.fastBtn.addEventListener("click", () => {
  state.stepsPerFrame = FAST_STEPS;
  state.mode = "Быстрый";
  state.lastFrameTime = performance.now();
  addLog("Включён быстрый режим.");
});

ui.showBtn.addEventListener("click", () => {
  state.showGames = true;
  addLog("Показ матчей включён.");
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

ui.hideBtn.addEventListener("click", () => {
  state.showGames = false;
  addLog("Показ матчей отключён.");
});

ui.matchMinutes.addEventListener("change", () => {
  const minutes = clamp(Math.round(Number(ui.matchMinutes.value) || 10), 1, 10);
  ui.matchMinutes.value = String(minutes);

  if (state.trainer?.running) {
    state.trainer.updateMatchDuration(minutes);
    state.lastFrameTime = performance.now();
  } else {
    addLog(`Длительность новых матчей установлена: ${minutes} мин.`);
  }
});

ui.skipBtn.addEventListener("click", () => {
  if (!state.trainer?.running) {
    addLog("Сейчас нет активного матча для пропуска.");
    return;
  }

  state.trainer.skipCurrentMatch();
  state.lastFrameTime = performance.now();
});

applyPitchWidth();
updateStats();
ui.log.textContent = logs.join("\n");
requestAnimationFrame(tick);
