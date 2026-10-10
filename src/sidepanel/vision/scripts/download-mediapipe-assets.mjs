import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '../../../../');
const publicMediapipeDir = path.join(projectRoot, 'public', 'mediapipe');
const wasmSourceDir = path.join(projectRoot, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');

if (!fs.existsSync(publicMediapipeDir)) {
  fs.mkdirSync(publicMediapipeDir, { recursive: true });
}

// 1. Copy WASM files from node_modules
if (fs.existsSync(wasmSourceDir)) {
  const files = fs.readdirSync(wasmSourceDir);
  for (const file of files) {
    const srcPath = path.join(wasmSourceDir, file);
    const destPath = path.join(publicMediapipeDir, file);
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${file} to public/mediapipe/`);
  }
} else {
  console.warn(`WASM source dir not found at ${wasmSourceDir}. Ensure @mediapipe/tasks-vision is installed.`);
}

// 2. Download face_landmarker.task model file
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const modelDest = path.join(publicMediapipeDir, 'face_landmarker.task');

console.log(`Downloading ${modelUrl}...`);
const fileStream = fs.createWriteStream(modelDest);

https.get(modelUrl, (response) => {
  if (response.statusCode !== 200) {
    console.error(`Failed to download model: HTTP ${response.statusCode}`);
    return;
  }
  response.pipe(fileStream);
  fileStream.on('finish', () => {
    fileStream.close();
    console.log('Downloaded face_landmarker.task successfully!');
  });
}).on('error', (err) => {
  fs.unlink(modelDest, () => {});
  console.error(`Error downloading model: ${err.message}`);
});
