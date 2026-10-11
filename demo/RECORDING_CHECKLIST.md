# Handsfree: Backup Video Recording Checklist & Fail-Safe Guide

A high-quality, pre-recorded backup video is mandatory for all live demonstrations, accessibility reviews, and hackathon judging sessions to eliminate risks from conference WiFi failures, camera driver crashes, or ambient venue noise.

---

## 🛠️ Phase 1: Environment & Hardware Setup (T - 60 min)

### 1. Physical Environment & Lighting
- [ ] **Ambient Noise:** Choose a quiet room with ambient noise floor $\le 42 \text{ dB}$ (verify via Side Panel audio level meter).
- [ ] **Lighting:** Position diffuse soft key light in front of face (45° angle). Avoid harsh overhead lights or bright backlighting (windows behind head) that degrade MediaPipe face landmark confidence.
- [ ] **Camera Placement:** Position webcam directly at eye level at approximately 50–70 cm (20–28 inches) distance.
- [ ] **Microphone:** Use a dedicated USB condenser microphone, headset, or lapel mic positioned 3–5 inches from mouth with pop filter. Do not use built-in laptop mic.

### 2. Display & Operating System
- [ ] **Display Resolution:** Set primary display to standard **1920 × 1080 (1080p)** at **100% DPI scaling**.
- [ ] **Do Not Disturb:** Enable OS Do Not Disturb / Focus Assist mode (disable notifications, Slack, Discord, email alerts).
- [ ] **Background Apps:** Close heavy background processes (Docker, Spotify, IDE watchers) to ensure $\ge 30\text{ FPS}$ sustained webcam inference.

---

## 💻 Phase 2: Browser & Extension Setup (T - 30 min)

### 1. Chrome Setup
- [ ] **Chrome Profile:** Use a clean, dedicated Chrome profile without competing extensions or ad blockers.
- [ ] **Browser Window:** Maximize Chrome to full screen (1920 × 1080).
- [ ] **Side Panel:** Open the Handsfree side panel via extension action icon (`sidepanel.html`); dock it to the right at **400 px width**.
- [ ] **Page Zoom:** Ensure browser default zoom is set to exactly **100%** (`Ctrl + 0`).
- [ ] **Permissions:** Confirm `camera` and `microphone` permissions are permanently set to **"Allow"** on `localhost`, `chrome-extension://`, and demo origins.

### 2. Dev Harness & Demo Tabs Pre-loading
Pre-open the demo tabs in the exact presentation order to allow instant switching:
1. `Tab 1:` Setup Wizard (`sidepanel.html`)
2. `Tab 2:` `demo/shop.html` (E-Commerce, search, routine actions)
3. `Tab 3:` `demo/repeated-buttons.html` (2-Gear Disambiguation)
4. `Tab 4:` `demo/form.html` (Important Action Confirmation)
5. `Tab 5:` `demo/dense-links.html` (Recursive 3x3 Zoom Grid)
6. `Tab 6:` `src/benchmark/dashboard.html` (Chaos Lab Results Dashboard)

---

## 🎥 Phase 3: Screen Recording Configuration (OBS Studio) (T - 20 min)

### 1. Video Settings
- [ ] **Canvas Base Resolution:** `1920 × 1080`
- [ ] **Output (Scaled) Resolution:** `1920 × 1080`
- [ ] **Frame Rate:** `60 FPS` constant frame rate
- [ ] **Video Encoder:** Hardware NVENC (NVIDIA) or Apple Silicon / QuickSync (`H.264 / AVC`)
- [ ] **Rate Control:** `CBR` at `12,000 Kbps`
- [ ] **Color Format:** `NV12`, Color Space `709`, Color Range `Partial`

### 2. Audio Settings
- [ ] **Sample Rate:** `48 kHz`
- [ ] **Track 1:** Mixed Master (Microphone + System Audio)
- [ ] **Track 2:** Microphone Isolated (Clean vocal track for voice recognition subtitles)
- [ ] **Track 3:** System Desktop Audio (Extension audio chimes and cues)
- [ ] **Filter Chain (Microphone):** Noise Suppression (RNNoise) ➔ Compressor ➔ Limiter (-1.5 dB)

### 3. Visual Layout Composition
- [ ] **Primary View (80% width):** Chrome browser window showing webpage and Handsfree cyan overlay.
- [ ] **Side View (20% width):** Handsfree Side Panel monitor showing live head dot tracking and voice SNR.
- [ ] **Webcam PiP (Optional Inset):** 320 × 240 webcam inset box in bottom-left showing presenter's face and natural head movements (proves no mouse or keyboard is being touched!).

---

## 🎬 Phase 4: Pre-Flight Sound Check & Calibration (T - 10 min)

- [ ] **MediaPipe Warm-up:** Open Side Panel, observe MediaPipe model load within 3 seconds, confirm 30+ FPS monitor readout.
- [ ] **Run Calibration:** Run the 20-second setup calibration in Side Panel Setup wizard. Neutral pose checked, 4 corners verified.
- [ ] **Audio Confidence:** Speak test phrase: *"search wireless headset"*; confirm speech recognition latency $< 300\text{ ms}$ and transcript toast appears at bottom-center.
- [ ] **Keyboard Fallback Verification:** Press `7`, `9`, `1`, `3` to verify quadrant shifting; press `Enter` to verify confirmation acceptance.
- [ ] **Audio Gain Check:** Ensure voice audio peaks between **-12 dB and -6 dB** without clipping into red.

---

## ⏱️ Phase 5: Recording Take Protocol (Live Run)

1. [ ] **Slate & Countdown:** Start recording, count down 3... 2... 1... silently in head; take a steady breath.
2. [ ] **Minute 0:00 – 0:45:**
   - Deliver introductory problem hook clearly.
   - Run 20-second calibration wizard; demonstrate look-away auto-pause.
3. [ ] **Minute 0:45 – 1:45:**
   - Switch to `demo/shop.html`.
   - Tilt head TL, say *"search wireless headphones"*.
   - Point out amber `🔒 LOCKED` quadrant badge.
   - Tilt head TR, say *"click cart"* (demonstrates routine action fast path).
4. [ ] **Minute 1:45 – 2:30:**
   - Switch to `demo/repeated-buttons.html`.
   - Aim BL, say *"click add to cart"* (demonstrates numbered badges).
   - Say *"two"* to select item #2.
   - Say *"hop mode"*, flick head down, nod forward (demonstrates Hop gear).
5. [ ] **Minute 2:30 – 3:15:**
   - Switch to `demo/form.html`.
   - Aim BR, say *"click delete account"*.
   - Point out high-contrast confirmation banner with 5s countdown bar.
   - Speak *"yes"* or nod to accept.
   - Turn head away 45° to demonstrate `⏸ PAUSED` state.
6. [ ] **Minute 3:15 – 4:00:**
   - Switch to `demo/dense-links.html`.
   - Say *"zoom"*, say *"five"*, say *"click"* (demonstrates 3x3 Zoom Grid fallback).
   - Switch to `src/benchmark/dashboard.html`.
   - State real empirical findings: **2.84 bps throughput (+208%)**, **94.2% tremor accuracy**, $N=4$ evaluators.
   - Conclude cleanly with project vision.
7. [ ] **Buffer:** Hold still for 3 seconds before hitting Stop Recording.

---

## 📦 Phase 6: Post-Recording Verification & Export (T + 15 min)

- [ ] **Full Playback Review:** Watch the entire 4-minute recording from start to finish. Check for:
  - Audio sync issues or clipping.
  - Webcam dropped frames or MediaPipe freezes.
  - Overlay clipping on sticky headers or dark backgrounds.
- [ ] **Encoding & Compression:**
  ```bash
  # Web-optimized MP4 with fast-start streaming flag
  ffmpeg -i take1_raw.mkv -c:v libx264 -preset slow -crf 18 -c:a aac -b:a 192k -movflags +faststart handsfree_demo_backup.mp4
  ```
- [ ] **Backup Redundancy:**
  - Copy `handsfree_demo_backup.mp4` to a physical USB thumb drive.
  - Upload to unlisted YouTube / Google Drive / Dropbox link.
  - Save locally on presenter desktop: `Desktop/Handsfree_Demo_Backup.mp4`.
