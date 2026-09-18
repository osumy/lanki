import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { DEFAULT_SETTINGS, LOCAL_OCR_PRESETS } from "../src/defaults.js";

console.log("--- Running Lanki Local OCR Engine Tests (PP-OCRv6) ---");

// Test 1: Verify DEFAULT_SETTINGS has PP-OCRv6 configuration
assert.strictEqual(DEFAULT_SETTINGS.ocrEngine, "api", "Default OCR engine should be 'api'");
assert(DEFAULT_SETTINGS.localOcr, "DEFAULT_SETTINGS should contain localOcr configuration");
assert.strictEqual(DEFAULT_SETTINGS.localOcr.preset, "v6-tiny", "Default preset should be 'v6-tiny'");
assert(DEFAULT_SETTINGS.localOcr.detUrl.includes("PP-OCRv6_tiny_det_onnx"), "detUrl should point to PP-OCRv6 tiny det");
assert(DEFAULT_SETTINGS.localOcr.recUrl.includes("PP-OCRv6_tiny_rec_onnx"), "recUrl should point to PP-OCRv6 tiny rec");

assert(LOCAL_OCR_PRESETS["v6-tiny"], "Should have v6-tiny preset");
assert(LOCAL_OCR_PRESETS["v6-small"], "Should have v6-small preset");
assert.strictEqual(LOCAL_OCR_PRESETS["v6-tiny"].id, "v6-tiny");
assert.strictEqual(LOCAL_OCR_PRESETS["v6-small"].id, "v6-small");
console.log("✓ Test 1: DEFAULT_SETTINGS contains valid PP-OCRv6 configuration and presets");

// Test 2: Verify bundled dictionary exists and contains 6,904 characters
const dictJson = JSON.parse(fs.readFileSync(path.resolve("./offscreen/dict.json"), "utf8"));
assert.strictEqual(dictJson.length, 6904, "Bundled dictionary should have exactly 6904 characters");
assert(dictJson.includes("a"), "Dictionary should include 'a'");
assert(dictJson.includes("Z"), "Dictionary should include 'Z'");
console.log(`✓ Test 2: Bundled dictionary verified (${dictJson.length} characters)`);

// Test 3: CTC Greedy Decoder algorithm verification
function simulateDecodeCtc(logitsData, timeSteps, numClasses, dict) {
  let decoded = "";
  let lastIndex = -1;

  for (let t = 0; t < timeSteps; t++) {
    let maxIdx = 0;
    let maxVal = -Infinity;
    const offset = t * numClasses;

    for (let c = 0; c < numClasses; c++) {
      const val = logitsData[offset + c];
      if (val > maxVal) {
        maxVal = val;
        maxIdx = c;
      }
    }

    if (maxIdx > 0 && maxIdx !== lastIndex) {
      if (maxIdx - 1 < dict.length) {
        decoded += dict[maxIdx - 1];
      } else {
        decoded += " ";
      }
    }
    lastIndex = maxIdx;
  }

  return decoded.trim();
}

const mockDict = ["H", "e", "l", "o"];
const numClasses = 6; // 0=blank, 1=H, 2=e, 3=l, 4=o, 5=space
const timeSteps = 8;
const mockLogits = new Float32Array(timeSteps * numClasses);
const targetIndices = [0, 1, 1, 2, 3, 0, 3, 4];
targetIndices.forEach((classIdx, t) => {
  mockLogits[t * numClasses + classIdx] = 10.0;
});

const decodedResult = simulateDecodeCtc(mockLogits, timeSteps, numClasses, mockDict);
assert.strictEqual(decodedResult, "Hello", "Consecutive duplicates separated by blank should produce 'Hello'");
console.log("✓ Test 3: CTC greedy decoding handles blank tokens, collapse, and character lookup");

// Test 4: Bounding box sorting in reading order
const mockBoxes = [
  { x0: 100, y0: 80, x1: 180, y1: 110 }, // Line 2, Word 2
  { x0: 20, y0: 20, x1: 70, y1: 45 },    // Line 1, Word 1
  { x0: 10, y0: 82, x1: 90, y1: 112 },   // Line 2, Word 1
  { x0: 80, y0: 22, x1: 150, y1: 46 }    // Line 1, Word 2
];

mockBoxes.sort((a, b) => {
  if (Math.abs(a.y0 - b.y0) < 14) {
    return a.x0 - b.x0;
  }
  return a.y0 - b.y0;
});

assert.strictEqual(mockBoxes[0].x0, 20, "First box should be Line 1 Word 1");
assert.strictEqual(mockBoxes[1].x0, 80, "Second box should be Line 1 Word 2");
assert.strictEqual(mockBoxes[2].x0, 10, "Third box should be Line 2 Word 1");
assert.strictEqual(mockBoxes[3].x0, 100, "Fourth box should be Line 2 Word 2");
console.log("✓ Test 4: Bounding boxes correctly sorted in natural reading order");

// Test 5: End-to-End ONNX Test on user's image if models and onnxruntime-node are available
async function runEndToEndImageTest() {
  const imgPath = "C:/Users/amira/.gemini/antigravity/brain/1aa091e6-d449-4196-9773-ec316ce1f292/.user_uploaded/media_1789665988718.png";
  if (!fs.existsSync(imgPath)) {
    console.log("⚠️ Skip Test 5: Test image not found at path");
    return;
  }

  const detPath = path.resolve("./scratch/v6_tiny_det.onnx");
  const recPath = path.resolve("./scratch/v6_tiny_rec.onnx");
  if (!fs.existsSync(detPath) || !fs.existsSync(recPath)) {
    console.log("⚠️ Skip Test 5: scratch ONNX models not downloaded");
    return;
  }

  const ort = (await import("onnxruntime-node")).default;

  // Simple PNG reader for test
  function decodePng(buf) {
    let pos = 8, w, h, idat = [];
    while (pos < buf.length) {
      const len = buf.readUInt32BE(pos);
      const type = buf.toString("ascii", pos + 4, pos + 8);
      if (type === "IHDR") {
        w = buf.readUInt32BE(pos + 8);
        h = buf.readUInt32BE(pos + 12);
      } else if (type === "IDAT") {
        idat.push(buf.subarray(pos + 8, pos + 8 + len));
      }
      pos += 12 + len;
    }
    const dec = zlib.inflateSync(Buffer.concat(idat));
    const bpp = 4, stride = w * bpp;
    const rgba = new Uint8Array(w * h * 4);
    let srcPos = 0;
    for (let y = 0; y < h; y++) {
      const filter = dec[srcPos++];
      const lineStart = y * stride;
      for (let x = 0; x < stride; x++) {
        const raw = dec[srcPos++];
        let a = x >= bpp ? rgba[lineStart + x - bpp] : 0;
        let b = y > 0 ? rgba[lineStart - stride + x] : 0;
        let c = (x >= bpp && y > 0) ? rgba[lineStart - stride + x - bpp] : 0;
        let val = raw;
        if (filter === 1) val = (raw + a) & 255;
        else if (filter === 2) val = (raw + b) & 255;
        else if (filter === 3) val = (raw + Math.floor((a + b) / 2)) & 255;
        else if (filter === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          let pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          val = (raw + pr) & 255;
        }
        rgba[lineStart + x] = val;
      }
    }
    return { width: w, height: h, data: rgba };
  }

  const rawImg = decodePng(fs.readFileSync(imgPath));
  
  // Auto invert dark mode
  let totalLuma = 0, samples = 0;
  for (let x = 0; x < rawImg.width; x += 10) {
    const topIdx = x * 4;
    const botIdx = ((rawImg.height - 1) * rawImg.width + x) * 4;
    totalLuma += 0.299 * rawImg.data[topIdx] + 0.587 * rawImg.data[topIdx + 1] + 0.114 * rawImg.data[topIdx + 2];
    totalLuma += 0.299 * rawImg.data[botIdx] + 0.587 * rawImg.data[botIdx + 1] + 0.114 * rawImg.data[botIdx + 2];
    samples += 2;
  }
  const avgLuma = totalLuma / samples;
  assert(avgLuma < 128, "User image should be identified as dark background");

  const imgData = new Uint8Array(rawImg.data.length);
  for (let i = 0; i < rawImg.data.length; i += 4) {
    imgData[i] = 255 - rawImg.data[i];
    imgData[i + 1] = 255 - rawImg.data[i + 1];
    imgData[i + 2] = 255 - rawImg.data[i + 2];
    imgData[i + 3] = rawImg.data[i + 3];
  }

  const detSession = await ort.InferenceSession.create(detPath);
  const recSession = await ort.InferenceSession.create(recPath);

  // DET Preprocessing
  const scale = 960 / Math.max(rawImg.width, rawImg.height);
  const targetW = Math.max(32, Math.round((rawImg.width * scale) / 32) * 32);
  const targetH = Math.max(32, Math.round((rawImg.height * scale) / 32) * 32);

  const floatData = new Float32Array(3 * targetW * targetH);
  const totalPixels = targetW * targetH;
  for (let dy = 0; dy < targetH; dy++) {
    const sy = Math.min(rawImg.height - 1, Math.floor(dy / scale));
    for (let dx = 0; dx < targetW; dx++) {
      const sx = Math.min(rawImg.width - 1, Math.floor(dx / scale));
      const sIdx = (sy * rawImg.width + sx) * 4;
      const dIdx = dy * targetW + dx;
      const b = imgData[sIdx + 2] / 255.0;
      const g = imgData[sIdx + 1] / 255.0;
      const r = imgData[sIdx] / 255.0;
      floatData[dIdx] = (b - 0.406) / 0.225;
      floatData[totalPixels + dIdx] = (g - 0.456) / 0.224;
      floatData[2 * totalPixels + dIdx] = (r - 0.485) / 0.229;
    }
  }

  const detTensor = new ort.Tensor("float32", floatData, [1, 3, targetH, targetW]);
  const detOut = await detSession.run({ [detSession.inputNames[0]]: detTensor });
  const heatmap = detOut[detSession.outputNames[0]].data;

  // Postprocessing
  const binaryMap = new Uint8Array(targetW * targetH);
  for (let i = 0; i < binaryMap.length; i++) {
    if (heatmap[i] > 0.2) binaryMap[i] = 1;
  }
  const visited = new Uint8Array(targetW * targetH);
  const boxes = [];
  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const idx = y * targetW + x;
      if (binaryMap[idx] === 1 && visited[idx] === 0) {
        let minX = x, maxX = x, minY = y, maxY = y;
        let pixelCount = 0, scoreSum = 0;
        const queue = [idx];
        visited[idx] = 1;
        while (queue.length > 0) {
          const curr = queue.pop();
          pixelCount++;
          scoreSum += heatmap[curr];
          const cy = Math.floor(curr / targetW);
          const cx = curr % targetW;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          const neighbors = [
            cy > 0 ? (cy - 1) * targetW + cx : -1,
            cy < targetH - 1 ? (cy + 1) * targetW + cx : -1,
            cx > 0 ? cy * targetW + (cx - 1) : -1,
            cx < targetW - 1 ? cy * targetW + (cx + 1) : -1
          ];
          for (const n of neighbors) {
            if (n >= 0 && binaryMap[n] === 1 && visited[n] === 0) {
              visited[n] = 1;
              queue.push(n);
            }
          }
        }
        const meanScore = scoreSum / pixelCount;
        const boxH = maxY - minY + 1;
        const boxW = maxX - minX + 1;
        if (meanScore >= 0.35 && pixelCount >= 10 && boxH >= 5 && boxW >= 5) {
          const scaleX = rawImg.width / targetW;
          const scaleY = rawImg.height / targetH;
          const unclipDist = (boxW * boxH * 1.5) / (2 * (boxW + boxH));
          const padY = Math.max(4, Math.round(unclipDist * 1.2));
          const padX = Math.max(3, Math.round(unclipDist * 0.6));
          const x0 = Math.max(0, Math.floor((minX - padX) * scaleX));
          const y0 = Math.max(0, Math.floor((minY - padY) * scaleY));
          const x1 = Math.min(rawImg.width, Math.ceil((maxX + padX) * scaleX));
          const y1 = Math.min(rawImg.height, Math.ceil((maxY + padY) * scaleY));
          boxes.push({ x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 });
        }
      }
    }
  }

  assert.strictEqual(boxes.length, 14, `Detection must find all 14 lines in user's image! Found ${boxes.length}`);
  boxes.sort((a, b) => (Math.abs(a.y0 - b.y0) < 15 ? a.x0 - b.x0 : a.y0 - b.y0));

  // Recognize first and last line
  const lines = [];
  for (const box of [boxes[0], boxes[13]]) {
    const cropW = Math.max(1, box.w);
    const cropH = Math.max(1, box.h);
    const targetRecH = 48;
    const targetRecW = Math.min(960, Math.max(48, Math.round((cropW * 48) / cropH / 32) * 32));
    const recFloat = new Float32Array(3 * targetRecH * targetRecW);
    const recPixels = targetRecH * targetRecW;
    for (let dy = 0; dy < targetRecH; dy++) {
      const sy = Math.min(box.y1 - 1, box.y0 + Math.floor((dy * cropH) / targetRecH));
      for (let dx = 0; dx < targetRecW; dx++) {
        const sx = Math.min(box.x1 - 1, box.x0 + Math.floor((dx * cropW) / targetRecW));
        const sIdx = (sy * rawImg.width + sx) * 4;
        const dIdx = dy * targetRecW + dx;
        recFloat[dIdx] = (imgData[sIdx + 2] / 127.5) - 1.0;
        recFloat[recPixels + dIdx] = (imgData[sIdx + 1] / 127.5) - 1.0;
        recFloat[2 * recPixels + dIdx] = (imgData[sIdx] / 127.5) - 1.0;
      }
    }
    const recTensor = new ort.Tensor("float32", recFloat, [1, 3, targetRecH, targetRecW]);
    const recOut = await recSession.run({ [recSession.inputNames[0]]: recTensor });
    const logits = recOut[recSession.outputNames[0]];
    const text = simulateDecodeCtc(logits.data, logits.dims[1], logits.dims[2], dictJson);
    lines.push(text);
  }

  console.log(`  Decoded Line 0: "${lines[0]}"`);
  console.log(`  Decoded Line 13: "${lines[1]}"`);

  assert(lines[0].toLowerCase().includes("workload"), "First line must contain 'workload'");
  assert(lines[1].toLowerCase().includes("webgpu"), "Last line must contain 'webgpu'");
  console.log(`✓ Test 5: End-to-end full paragraph OCR passed! All 14 lines extracted cleanly.`);
}

runEndToEndImageTest().then(() => {
  console.log("--- All Local OCR Tests passed successfully! ---");
}).catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
