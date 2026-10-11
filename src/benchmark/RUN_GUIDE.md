# Chaos Lab Benchmark: Team Run Guide
**Handsfree Accessibility & Evaluation (P1, P2, P3, P4)**

This guide coordinates the 4-person parallel evaluation trial for Handsfree vs. Naive Head Cursor vs. Mouse+Keyboard across 3 simulated impairment levels.

---

### 1. Equipment & Environment Setup
- **Parallel Execution**: 4 evaluators running simultaneously on 4 separate laptops.
- **Webcam**: Standard 720p/1080p laptop camera positioned directly at eye level.
- **Microphone**: Laptop built-in or external headset mic.
- **Local Dev Server**: Make sure the Vite dev server is running on each laptop (`npm run dev`).
- **Benchmark URL**: [http://localhost:5173/src/benchmark/index.html](http://localhost:5173/src/benchmark/index.html) or [http://localhost:5173/src/benchmark/dashboard.html](http://localhost:5173/src/benchmark/dashboard.html).

---

### 2. Participant & Counterbalancing Assignment Matrix

To prevent learning bias and fatigue distortion, sessions are counterbalanced across systems and simulated impairment levels in a Latin Square order:

| Evaluator | Participant ID | System Order (3 Blocks) | Impairment Levels | Approx. Duration |
|---|---|---|---|---|
| **P1** (Vision Lead) | `P-01` | 1. **Handsfree** $\rightarrow$ 2. **Naive Cursor** $\rightarrow$ 3. **Mouse** | Level 0 $\rightarrow$ Level 1 $\rightarrow$ Level 2 | ~20 min |
| **P2** (Engine Lead) | `P-02` | 1. **Naive Cursor** $\rightarrow$ 2. **Mouse** $\rightarrow$ 3. **Handsfree** | Level 1 $\rightarrow$ Level 2 $\rightarrow$ Level 0 | ~20 min |
| **P3** (Orchestrator Lead)| `P-03` | 1. **Mouse** $\rightarrow$ 2. **Handsfree** $\rightarrow$ 3. **Naive Cursor** | Level 2 $\rightarrow$ Level 0 $\rightarrow$ Level 1 | ~20 min |
| **P4** (UI & Eval Lead) | `P-04` | 1. **Handsfree** $\rightarrow$ 2. **Mouse** $\rightarrow$ 3. **Naive Cursor** | Level 0 $\rightarrow$ Level 2 $\rightarrow$ Level 1 | ~20 min |

---

### 3. Step-by-Step Session Procedure (per participant)

For each System & Impairment Level block:
1. **Open Portal**: Navigate to `http://localhost:5173/src/benchmark/index.html`.
2. **Configure Identity**: Enter your Participant ID (e.g. `P-01`) and select your assigned System and Simulated Level.
3. **Calibrate / Set Noise**:
   - For Level 1 and Level 2, click **"▶ Play Noise Track"** to output the calibrated ambient chatter/noise volume.
   - Run the 20-second **Setup Wizard** in the sidepanel for Handsfree mode.
4. **Execute Tasks T1 through T6**:
   - **T1: Fitts Targets** (6 circle acquisition trials at varying sizes/distances).
   - **T2: Form Fill** (Enter Name, Email, Search query, and Submit).
   - **T3: Navigation Flow** (Open link, navigate back, switch tab).
   - **T4: Repeated Items** (Disambiguate matching buttons via 2-gear shifter).
   - **T5: Background Talk Resilience** (2 minutes background speech with 8 decoy targets to count accidental activations).
   - **T6: Canvas & Iframe Targets** (Clicking canvas and embedded iframe coordinates).
5. **Rest Break**: A 30-second rest screen will appear between level transitions.
6. **Export Data**:
   - Click **"Export CSV"** and **"Export JSON"** at the top right of the benchmark header.
   - Save the exported files as `telemetry_P0X_<system>_<level>.json` into the `data/benchmark_results/` folder.

---

### 4. Consolidated Analysis & Results Dashboard

- Navigate to [http://localhost:5173/src/benchmark/dashboard.html](http://localhost:5173/src/benchmark/dashboard.html).
- Upload the team's exported `.json` or `.csv` session files (or view the preloaded fixture baseline).
- The dashboard automatically renders:
  1. **Robustness Curves**: Completion time (ms) and error rate (%) across simulated impairment levels for Handsfree vs Naive vs Mouse.
  2. **ISO 9241-9 Fitts Throughput**: Bits per second (bps) comparison.
  3. **Ablation Matrix**: Impact of Quadrant Scope, Look-Away Auto-Pause, Confirmation Policies, Shifter Automation, and Zoom Grid.
  4. **Safety & Speech Metrics**: Accidental activation frequency and gear dwell distribution.
  5. Statistical summary ($N$, Mean, Standard Deviation).
