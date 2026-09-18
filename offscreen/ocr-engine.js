/**
 * Lanki Local Offline OCR Engine (PP-OCRv6 via ONNX Runtime Web)
 * Runs in Chrome Offscreen Document context with Canvas and WebAssembly.
 */

// Configure ONNX Runtime Web WASM paths
if (typeof ort !== "undefined" && ort.env) {
  ort.env.wasm.wasmPaths = chrome.runtime.getURL("offscreen/");
  ort.env.wasm.numThreads = 1; // Single thread WASM is most reliable and fast across browsers
}

const CACHE_NAME = "lanki-ocr-cache-v2";

const DEFAULT_URLS = {
  preset: "v6-tiny",
  detUrl: "https://huggingface.co/PaddlePaddle/PP-OCRv6_tiny_det_onnx/resolve/main/inference.onnx",
  recUrl: "https://huggingface.co/PaddlePaddle/PP-OCRv6_tiny_rec_onnx/resolve/main/inference.onnx"
};

// In-memory active inference sessions, dictionary, and active model key
let detSession = null;
let recSession = null;
let charDictionary = null;
let charDictionarySmall = null;
let activeModelUrls = null;
let isInitializing = false;

/**
 * Get internal cache request URLs for a pair of det and rec models.
 */
function getCacheKeys(customUrls = {}) {
  const det = customUrls.detUrl || DEFAULT_URLS.detUrl;
  const rec = customUrls.recUrl || DEFAULT_URLS.recUrl;
  return {
    detKey: `https://lanki.local/models/${encodeURIComponent(det)}`,
    recKey: `https://lanki.local/models/${encodeURIComponent(rec)}`
  };
}

/**
 * Check whether models are fully downloaded and cached in CacheStorage.
 */
export async function checkModelStatus(customUrls = {}) {
  try {
    const { detKey, recKey } = getCacheKeys(customUrls);
    const cache = await caches.open(CACHE_NAME);
    const [detRes, recRes] = await Promise.all([
      cache.match(detKey),
      cache.match(recKey)
    ]);

    if (!detRes || !recRes) {
      return { isReady: false, sizeBytes: 0 };
    }

    const detBlob = await detRes.clone().blob();
    const recBlob = await recRes.clone().blob();
    const totalBytes = detBlob.size + recBlob.size;

    return {
      isReady: true,
      sizeBytes: totalBytes,
      sizeFormatted: (totalBytes / (1024 * 1024)).toFixed(1) + " MB"
    };
  } catch (err) {
    console.warn("Failed to check OCR model status:", err);
    return { isReady: false, sizeBytes: 0, error: err.message };
  }
}

/**
 * Download a file with live progress reporting via ReadableStream reader.
 */
async function fetchWithProgress(url, label, onProgress) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${label} (${response.status} ${response.statusText})`);
  }

  const contentLengthHeader = response.headers.get("Content-Length");
  const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
  let loadedBytes = 0;

  const reader = response.body.getReader();
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loadedBytes += value.length;
    if (onProgress) {
      onProgress(loadedBytes, totalBytes, label);
    }
  }

  const combined = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return new Response(combined.buffer, {
    headers: { "Content-Type": "application/octet-stream" }
  });
}

/**
 * Downloads PP-OCRv6 model weights and stores them in CacheStorage.
 */
export async function downloadAndCacheModels(customUrls = {}) {
  const detUrl = customUrls.detUrl || DEFAULT_URLS.detUrl;
  const recUrl = customUrls.recUrl || DEFAULT_URLS.recUrl;
  const { detKey, recKey } = getCacheKeys(customUrls);

  const isSmall = detUrl.includes("small") || recUrl.includes("small");
  const estimatedSizes = isSmall
    ? { det: 9877800, rec: 21160050 }
    : { det: 1780590, rec: 4462639 };
  const totalEstimatedBytes = estimatedSizes.det + estimatedSizes.rec;
  let totalDownloadedSoFar = 0;

  function reportProgress(fileLoaded, fileTotal, fileLabel) {
    const currentTotal = totalDownloadedSoFar + fileLoaded;
    const percent = Math.min(99, Math.round((currentTotal / totalEstimatedBytes) * 100));
    try {
      chrome.runtime.sendMessage({
        action: "OCR_DOWNLOAD_PROGRESS",
        percent,
        loadedBytes: currentTotal,
        totalBytes: totalEstimatedBytes,
        currentFile: fileLabel
      }).catch(() => {});
    } catch {}
  }

  const cache = await caches.open(CACHE_NAME);

  // 1. Download Detection model
  const detRes = await fetchWithProgress(detUrl, "Detection Model", (loaded, total) => {
    reportProgress(loaded, total || estimatedSizes.det, "Detection Model");
  });
  await cache.put(detKey, detRes);
  totalDownloadedSoFar += estimatedSizes.det;

  // 2. Download Recognition model
  const recRes = await fetchWithProgress(recUrl, "Recognition Model", (loaded, total) => {
    reportProgress(loaded, total || estimatedSizes.rec, "Recognition Model");
  });
  await cache.put(recKey, recRes);
  totalDownloadedSoFar += estimatedSizes.rec;

  // Final 100% notification
  try {
    chrome.runtime.sendMessage({
      action: "OCR_DOWNLOAD_PROGRESS",
      percent: 100,
      loadedBytes: totalEstimatedBytes,
      totalBytes: totalEstimatedBytes,
      currentFile: "Complete"
    }).catch(() => {});
  } catch {}

  // Initialize inference sessions with newly downloaded models
  await initInferenceSessions(customUrls);

  return { success: true };
}

/**
 * Clear the cached models to free storage.
 */
export async function clearModelCache() {
  await caches.delete(CACHE_NAME);
  detSession = null;
  recSession = null;
  activeModelUrls = null;
  return { success: true };
}

/**
 * Ensure character dictionary is loaded from bundled offscreen/dict.json (or dict_small.json).
 */
async function ensureDictionary(isSmall = false) {
  if (isSmall) {
    if (charDictionarySmall && charDictionarySmall.length > 0) return charDictionarySmall;
    try {
      const dictUrl = chrome.runtime.getURL("offscreen/dict_small.json");
      const res = await fetch(dictUrl);
      charDictionarySmall = await res.json();
      console.log(`Lanki Small OCR dictionary loaded: ${charDictionarySmall.length} characters`);
      return charDictionarySmall;
    } catch (err) {
      console.warn("Could not load dict_small.json, falling back to dict.json:", err);
    }
  }

  if (charDictionary && charDictionary.length > 0) return charDictionary;

  try {
    const dictUrl = chrome.runtime.getURL("offscreen/dict.json");
    const res = await fetch(dictUrl);
    charDictionary = await res.json();
    console.log(`Lanki OCR dictionary loaded: ${charDictionary.length} characters`);
  } catch (err) {
    try {
      const fallbackUrl = chrome.runtime.getURL("offscreen/dict.txt");
      const res = await fetch(fallbackUrl);
      const text = await res.text();
      charDictionary = text.split(/\r?\n/).filter(line => line.length > 0);
    } catch (e2) {
      console.error("Failed to load OCR dictionary:", err, e2);
      charDictionary = [];
    }
  }
  return charDictionary;
}

/**
 * Ensure inference sessions are initialized from cache.
 */
async function initInferenceSessions(customUrls = {}) {
  const detUrl = customUrls.detUrl || DEFAULT_URLS.detUrl;
  const recUrl = customUrls.recUrl || DEFAULT_URLS.recUrl;
  const isSmall = detUrl.includes("small") || recUrl.includes("small");
  const urlKey = `${detUrl}|${recUrl}`;

  if (detSession && recSession && activeModelUrls === urlKey) {
    return;
  }

  if (isInitializing) {
    while (isInitializing) {
      await new Promise(r => setTimeout(r, 100));
    }
    if (detSession && recSession && activeModelUrls === urlKey) return;
  }

  isInitializing = true;
  try {
    await ensureDictionary(isSmall);

    const { detKey, recKey } = getCacheKeys(customUrls);
    const cache = await caches.open(CACHE_NAME);
    const [detRes, recRes] = await Promise.all([
      cache.match(detKey),
      cache.match(recKey)
    ]);

    if (!detRes || !recRes) {
      throw new Error("Local OCR models are not downloaded. Please open Settings and download them.");
    }

    const [detBuffer, recBuffer] = await Promise.all([
      detRes.arrayBuffer(),
      recRes.arrayBuffer()
    ]);

    const sessionOptions = {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all"
    };

    detSession = await ort.InferenceSession.create(detBuffer, sessionOptions);
    recSession = await ort.InferenceSession.create(recBuffer, sessionOptions);
    activeModelUrls = urlKey;
    console.log("Lanki Local PP-OCRv6 sessions initialized successfully!");
  } finally {
    isInitializing = false;
  }
}

/**
 * Loads an HTMLImageElement from base64 data URL.
 */
function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error("Failed to load image for OCR: " + err));
    img.src = dataUrl;
  });
}

/**
 * Check if the image has a dark background and invert colors if necessary.
 * PP-OCR models are trained on dark text on light backgrounds.
 */
function checkAndInvertDarkMode(ctx, width, height) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  let sampleCount = 0;
  let totalLuma = 0;

  // Sample top and bottom borders
  for (let x = 0; x < width; x += 10) {
    const topIdx = x * 4;
    const botIdx = ((height - 1) * width + x) * 4;
    totalLuma += 0.299 * data[topIdx] + 0.587 * data[topIdx + 1] + 0.114 * data[topIdx + 2];
    totalLuma += 0.299 * data[botIdx] + 0.587 * data[botIdx + 1] + 0.114 * data[botIdx + 2];
    sampleCount += 2;
  }
  // Sample left and right borders
  for (let y = 0; y < height; y += 10) {
    const leftIdx = (y * width) * 4;
    const rightIdx = (y * width + (width - 1)) * 4;
    totalLuma += 0.299 * data[leftIdx] + 0.587 * data[leftIdx + 1] + 0.114 * data[leftIdx + 2];
    totalLuma += 0.299 * data[rightIdx] + 0.587 * data[rightIdx + 1] + 0.114 * data[rightIdx + 2];
    sampleCount += 2;
  }

  const avgLuma = totalLuma / Math.max(1, sampleCount);
  const isDark = avgLuma < 128;

  if (isDark) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
    ctx.putImageData(imgData, 0, 0);
  }

  return isDark;
}

/**
 * DBNet Preprocessing:
 * Rescales image so dimensions are multiples of 32, checks for dark background,
 * and normalizes with ImageNet stats in BGR channel layout.
 */
function preprocessDet(img) {
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  const maxSide = 960;
  let scale = 1.0;
  if (Math.max(origW, origH) > maxSide) {
    scale = maxSide / Math.max(origW, origH);
  }

  const targetW = Math.max(32, Math.round((origW * scale) / 32) * 32);
  const targetH = Math.max(32, Math.round((origH * scale) / 32) * 32);

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, targetW, targetH);

  // Auto invert if dark mode
  checkAndInvertDarkMode(ctx, targetW, targetH);

  const imgData = ctx.getImageData(0, 0, targetW, targetH).data;

  // Paddle uses BGR channel order with ImageNet normalization
  // mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225]
  const totalPixels = targetW * targetH;
  const floatData = new Float32Array(3 * totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const r = imgData[i * 4] / 255.0;
    const g = imgData[i * 4 + 1] / 255.0;
    const b = imgData[i * 4 + 2] / 255.0;

    // Channel 0: B
    floatData[i] = (b - 0.406) / 0.225;
    // Channel 1: G
    floatData[totalPixels + i] = (g - 0.456) / 0.224;
    // Channel 2: R
    floatData[2 * totalPixels + i] = (r - 0.485) / 0.229;
  }

  return {
    tensor: new ort.Tensor("float32", floatData, [1, 3, targetH, targetW]),
    targetW,
    targetH,
    origW,
    origH,
    processedCanvas: canvas
  };
}

/**
 * DBNet Postprocessing:
 * Extracts text bounding boxes using connected components and applies
 * standard polygon unclip expansion to avoid cutting off letter ascenders/descenders.
 */
function postprocessDet(heatmapData, targetW, targetH, origW, origH) {
  const thresh = 0.2; // PP-OCRv6 standard threshold
  const binaryMap = new Uint8Array(targetW * targetH);

  for (let i = 0; i < binaryMap.length; i++) {
    binaryMap[i] = heatmapData[i] > thresh ? 1 : 0;
  }

  const visited = new Uint8Array(targetW * targetH);
  const boxes = [];

  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const idx = y * targetW + x;
      if (binaryMap[idx] === 1 && visited[idx] === 0) {
        let minX = x, maxX = x, minY = y, maxY = y;
        let pixelCount = 0;
        let scoreSum = 0;
        const queue = [idx];
        visited[idx] = 1;

        while (queue.length > 0) {
          const curr = queue.pop();
          pixelCount++;
          scoreSum += heatmapData[curr];
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

        // Filter out tiny noise (box_thresh = 0.35, min dimensions)
        if (meanScore >= 0.35 && pixelCount >= 10 && boxH >= 5 && boxW >= 5) {
          const scaleX = origW / targetW;
          const scaleY = origH / targetH;

          // Standard DBNet unclip distance:
          // distance = (boxW * boxH * unclip_ratio) / (2 * (boxW + boxH))
          const unclipDist = (boxW * boxH * 1.5) / (2 * (boxW + boxH));
          const padY = Math.max(4, Math.round(unclipDist * 1.2));
          const padX = Math.max(3, Math.round(unclipDist * 0.6));

          const realX0 = Math.max(0, Math.floor((minX - padX) * scaleX));
          const realY0 = Math.max(0, Math.floor((minY - padY) * scaleY));
          const realX1 = Math.min(origW, Math.ceil((maxX + padX) * scaleX));
          const realY1 = Math.min(origH, Math.ceil((maxY + padY) * scaleY));

          boxes.push({
            x0: realX0,
            y0: realY0,
            x1: realX1,
            y1: realY1,
            w: realX1 - realX0,
            h: realY1 - realY0,
            meanScore
          });
        }
      }
    }
  }

  // Sort boxes in reading order: top-to-bottom line grouping, then left-to-right
  boxes.sort((a, b) => {
    // If boxes are on nearly the same line (vertical overlap)
    if (Math.abs(a.y0 - b.y0) < 15) {
      return a.x0 - b.x0;
    }
    return a.y0 - b.y0;
  });

  return boxes;
}

/**
 * PP-OCRv6 Recognition Preprocessing:
 * Crops text line from canvas, scales to height 48, normalizes to [-1, 1] in BGR.
 */
function preprocessRec(sourceCanvas, box, origW, origH) {
  const cropW = Math.max(1, box.w);
  const cropH = Math.max(1, box.h);

  const targetH = 48;
  // Scale with 1.25x breathing room for Latin text spacing, up to 3200 (PP-OCRv6 dynamic shape max)
  let targetW = Math.max(48, Math.min(3200, Math.round(((cropW * 48) / cropH * 1.25) / 32) * 32));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  // Scale coordinates to sourceCanvas dimensions
  const scaleX = sourceCanvas.width / origW;
  const scaleY = sourceCanvas.height / origH;
  const sx = Math.max(0, Math.floor(box.x0 * scaleX));
  const sy = Math.max(0, Math.floor(box.y0 * scaleY));
  const sw = Math.min(sourceCanvas.width - sx, Math.ceil(box.w * scaleX));
  const sh = Math.min(sourceCanvas.height - sy, Math.ceil(box.h * scaleY));

  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, targetW, targetH);
  const imgData = ctx.getImageData(0, 0, targetW, targetH).data;

  // BGR normalized: (pixel / 127.5) - 1.0
  const totalPixels = targetW * targetH;
  const floatData = new Float32Array(3 * totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const r = (imgData[i * 4] / 127.5) - 1.0;
    const g = (imgData[i * 4 + 1] / 127.5) - 1.0;
    const b = (imgData[i * 4 + 2] / 127.5) - 1.0;

    // Channel 0: B, Channel 1: G, Channel 2: R
    floatData[i] = b;
    floatData[totalPixels + i] = g;
    floatData[2 * totalPixels + i] = r;
  }

  return new ort.Tensor("float32", floatData, [1, 3, targetH, targetW]);
}

/**
 * CTC Greedy Decoder:
 * Argmax along class dimension, collapse consecutive duplicates, skip blank (token 0).
 */
function decodeCtc(logitsData, timeSteps, numClasses, dict) {
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
      // In PP-OCR CTC:
      // Index 0 is blank.
      // Index 1..numClasses-2 map to dict[maxIdx - 1].
      // Index numClasses-1 is space ' '.
      if (maxIdx === numClasses - 1) {
        decoded += " ";
      } else if (maxIdx - 1 < dict.length) {
        decoded += dict[maxIdx - 1];
      }
    }
    lastIndex = maxIdx;
  }

  return decoded.trim();
}

/**
 * Run full OCR pipeline (Detection -> Recognition) on a base64 image.
 */
export async function runLocalOcr(imageBase64, customUrls = {}) {
  await initInferenceSessions(customUrls);

  const img = await loadImageElement(imageBase64);
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;

  // 1. Detection
  const detInput = preprocessDet(img);
  const detInputName = detSession.inputNames[0];
  const detResults = await detSession.run({ [detInputName]: detInput.tensor });
  const detOutputName = detSession.outputNames[0];
  const detHeatmap = detResults[detOutputName].data;

  // Extract bounding boxes
  let boxes = postprocessDet(detHeatmap, detInput.targetW, detInput.targetH, origW, origH);

  // Fallback: If DBNet detected 0 boxes, treat the entire snippet as a single box
  if (boxes.length === 0) {
    boxes = [{
      x0: 0,
      y0: 0,
      x1: origW,
      y1: origH,
      w: origW,
      h: origH
    }];
  }

  // 2. Recognition for each box
  const recognizedLines = [];
  const recInputName = recSession.inputNames[0];
  const recOutputName = recSession.outputNames[0];

  const detUrl = customUrls.detUrl || DEFAULT_URLS.detUrl;
  const recUrl = customUrls.recUrl || DEFAULT_URLS.recUrl;
  const isSmall = detUrl.includes("small") || recUrl.includes("small");
  const activeDict = isSmall && charDictionarySmall ? charDictionarySmall : charDictionary;

  for (const box of boxes) {
    const recTensor = preprocessRec(detInput.processedCanvas, box, origW, origH);
    const recResults = await recSession.run({ [recInputName]: recTensor });
    const logitsTensor = recResults[recOutputName];

    const timeSteps = logitsTensor.dims[1];
    const numClasses = logitsTensor.dims[2];

    const lineText = decodeCtc(logitsTensor.data, timeSteps, numClasses, activeDict);
    if (lineText) {
      recognizedLines.push(lineText);
    }
  }

  return recognizedLines.join(" ");
}

/**
 * Generate a quick test image and run OCR to verify engine sanity.
 */
export async function testLocalOcr(customUrls = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 70;
  const ctx = canvas.getContext("2d");

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 320, 70);

  // Black text
  ctx.fillStyle = "#000000";
  ctx.font = "bold 26px Arial, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillText("Lanki PP-OCRv6", 20, 35);

  const testBase64 = canvas.toDataURL("image/png");
  const result = await runLocalOcr(testBase64, customUrls);
  return result;
}

// Runtime message listener for Offscreen Document commands
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== "ocr-offscreen") return;

  (async () => {
    try {
      if (message.action === "CHECK_LOCAL_OCR_STATUS") {
        const status = await checkModelStatus(message.customUrls);
        sendResponse(status);
        return;
      }

      if (message.action === "DOWNLOAD_LOCAL_OCR_MODELS") {
        const res = await downloadAndCacheModels(message.customUrls);
        sendResponse(res);
        return;
      }

      if (message.action === "CLEAR_LOCAL_OCR_CACHE") {
        const res = await clearModelCache();
        sendResponse(res);
        return;
      }

      if (message.action === "RUN_LOCAL_OCR") {
        const text = await runLocalOcr(message.imageBase64, message.customUrls);
        sendResponse({ text });
        return;
      }

      if (message.action === "TEST_LOCAL_OCR") {
        const text = await testLocalOcr(message.customUrls);
        sendResponse({ text });
        return;
      }
    } catch (err) {
      console.error("OCR Offscreen Worker error:", err);
      sendResponse({ error: err.message });
    }
  })();

  return true; // Keep message channel open for async response
});
