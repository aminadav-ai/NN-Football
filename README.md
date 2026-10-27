# ⚽ NN-Football — 2D Neuroevolution Football Simulator

[![Live Demo](https://img.shields.io/badge/Live_Demo-GitHub_Pages-10b981?style=for-the-badge&logo=github&logoColor=white)](https://aminadav-ai.github.io/NN-Football/)
[![JavaScript](https://img.shields.io/badge/Vanilla_JS-ES_Modules-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![HTML5 Canvas](https://img.shields.io/badge/Rendering-HTML5_Canvas_%26_OffscreenCanvas-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
[![Web Workers](https://img.shields.io/badge/Compute-Web_Workers-0284c7?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](./LICENSE)

**Live Demo:** [https://aminadav-ai.github.io/NN-Football/](https://aminadav-ai.github.io/NN-Football/)

`NN-Football` is a zero-dependency browser simulation where teams of autonomous agents learn to play 2D football from scratch through **neuroevolution** (custom feed-forward neural networks + genetic algorithms). All physics, sensor raycasting, tournament scheduling, and evolutionary operators run inside a background **Web Worker** (`OffscreenCanvas`) for high-throughput training.

---

## 📸 Screenshots

### 1. Live Match Pitch, Lineage Graph & Neural Network Change Heatmap
![Pitch, Lineage and Neural Network Evolution](./docs/screenshots/01_pitch_and_evolution.png)

### 2. Selected Individual Lineage & Cumulative Mutation Heatmap (Close-Up)
![Lineage Tree and Neural Network Change Heatmap](./docs/screenshots/02_sidebar_controls.png)

---

## ✨ Key Features

- **Custom Neural Network & Genetic Algorithm Engine:** Written from scratch in vanilla JavaScript without external ML libraries. Configurable hidden layers, neurons per layer, population size, tournament games per individual, crossover rate, and Gaussian mutation noise.
- **Background Web Worker & Multi-Speed Training:** Runs match simulations in a dedicated Web Worker (`worker.js`) with `OffscreenCanvas` rendering. Switch on the fly between **Slow**, **Fast**, **Ultra-Fast**, and **Unlimited / Max** headless training modes.
- **Interactive Lineage Tree Across Generations:** Inspect any generation and click individual nodes to trace elite carry-overs, parent-child transitions, and mutants.
- **Neural Network Evolution Visualizer:** Compare a selected individual's weights and biases directly against its parent(s) or switch to the **Change Heatmap** mode to highlight which synapses mutated most frequently along the winning evolutionary lineage.
- **Live Fitness Shaping & State Persistence:** Tune reward weights (goals scored, goals conceded, own goals) in real time and export/import full population snapshots as JSON files.

---

## 🚀 Running Locally

Because the simulator uses ES Modules and a Web Worker (`worker.js`), serve the folder over any local HTTP server:

```bash
git clone https://github.com/aminadav-ai/NN-Football.git
cd NN-Football
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

---

## 📄 License

This project is licensed under the [MIT License](./LICENSE).
