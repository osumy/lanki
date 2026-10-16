/**
 * Background Batch Flashcard Generation Runner for Lanki.
 *
 * Orchestrates multi-chunk flashcard generation in the Chrome MV3 background service worker,
 * persisting atomic chunk checkpoints in chrome.storage.local ("generationJob"),
 * maintaining service worker keepalive via chrome.alarms watchdog,
 * triggering automatic RFC 2397 base64 data URI TSV downloads,
 * and injecting completion toasts into the active tab.
 */

import {
  extractAnkiHeaderLines,
  saveQueue,
  getSettings,
  getActivePrompt
} from "../src/defaults.js";

import {
  chunkArray,
  formatPromptForWords,
  callLlmWithSettings,
  parseTsvRows,
  createGeminiRouterFromSettings
} from "../src/generator.js";

export const WATCHDOG_ALARM_NAME = "lanki-generation-watchdog";

export const DEFAULT_IDLE_JOB = {
  id: "",
  jobId: "",
  status: "idle",
  currentChunk: 0,
  totalChunks: 0,
  completedWords: 0,
  totalWords: 0,
  tsvContent: "",
  filename: "",
  errors: [],
  errorMessage: null,
  startTime: 0,
  endTime: null,
  updatedTime: 0,
  promptId: "",
  promptTitle: "",
  modelUsed: ""
};

let currentAbortController = null;
let activeJobPromise = null;
let isRunning = false;

/**
 * Returns true if an in-memory generation loop is actively processing.
 */
export function isJobRunning() {
  return isRunning;
}

/**
 * Starts a background batch generation job.
 *
 * @param {Object} options
 * @param {Array<string|object>} options.words
 * @param {Object} options.settings
 * @param {string} [options.promptId]
 * @param {string} [options.promptTitle]
 * @returns {Promise<{ success: boolean, jobId?: string, job?: Object, error?: string }>}
 */
export async function startBatchJob({ words, settings, promptId, promptTitle }) {
  if (isRunning) {
    return { success: false, error: "A generation job is already in progress." };
  }

  if (!words || !Array.isArray(words) || words.length === 0) {
    return { success: false, error: "No words in queue to process." };
  }

  const effectiveSettings = settings || await getSettings();
  let promptTemplate = effectiveSettings.promptTemplate;
  const activePrompt = getActivePrompt(effectiveSettings);

  const effectivePromptId = promptId || effectiveSettings.activePromptId || activePrompt?.id || "";
  const effectivePromptTitle = promptTitle || activePrompt?.title || "Anki Deck";

  if (!promptTemplate && activePrompt?.content) {
    promptTemplate = activePrompt.content;
    effectiveSettings.promptTemplate = promptTemplate;
  }

  if (!promptTemplate || !promptTemplate.trim()) {
    return { success: false, error: "Prompt template is empty! Please configure a prompt template in Settings." };
  }

  const jobId = "job_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  const chunkSize = Math.max(1, parseInt(effectiveSettings.chunkSize, 10) || 10);
  const chunks = chunkArray(words, chunkSize);
  const totalChunks = chunks.length;

  const safeTitle = effectivePromptTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const filename = `lanki_${safeTitle || "deck"}_${Date.now()}.txt`;
  const modelUsed = effectiveSettings.llmProvider === "gemini"
    ? (effectiveSettings.geminiModel || "gemini-2.5-flash")
    : (effectiveSettings.model || "custom");

  const job = {
    id: jobId,
    jobId: jobId,
    status: "running",
    currentChunk: 0,
    totalChunks,
    completedWords: 0,
    totalWords: words.length,
    tsvContent: "",
    filename,
    errors: [],
    errorMessage: null,
    startTime: Date.now(),
    endTime: null,
    updatedTime: Date.now(),
    promptId: effectivePromptId,
    promptTitle: effectivePromptTitle,
    modelUsed,
    accumulatedRows: [],
    words,
    settings: effectiveSettings
  };

  // Checkpoint initial state
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.set({ generationJob: job });
  }

  await startWatchdogAlarm();

  currentAbortController = new AbortController();
  isRunning = true;

  // Execute in background without awaiting completion
  activeJobPromise = executeJobLoop(job, chunks).finally(async () => {
    isRunning = false;
    currentAbortController = null;
    activeJobPromise = null;
    await clearWatchdogAlarm();
  });

  return { success: true, jobId, job };
}

/**
 * Executes chunk loop with persistence checkpoints after each chunk.
 */
async function executeJobLoop(job, chunks) {
  let activeRouter = null;
  if (job.settings?.llmProvider === "gemini") {
    activeRouter = createGeminiRouterFromSettings(job.settings);
  }

  const startIndex = job.currentChunk || 0;

  for (let i = startIndex; i < job.totalChunks; i++) {
    if (currentAbortController?.signal?.aborted) {
      job.status = "canceled";
      job.endTime = Date.now();
      job.updatedTime = Date.now();
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        await chrome.storage.local.set({ generationJob: job });
      }
      return job;
    }

    job.currentChunk = i + 1;
    job.updatedTime = Date.now();
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ generationJob: job });
    }

    const chunkWords = chunks[i];

    try {
      const prompt = formatPromptForWords(job.settings.promptTemplate, chunkWords);
      const rawOutput = await callLlmWithSettings({
        prompt,
        settings: job.settings,
        signal: currentAbortController?.signal,
        routerInstance: activeRouter
      });

      const parsedRows = parseTsvRows(rawOutput);
      if (parsedRows.length === 0) {
        job.errors.push(`Chunk ${i + 1}: No valid TSV rows parsed from model response.`);
      } else {
        job.accumulatedRows.push(...parsedRows);
        job.completedWords = job.accumulatedRows.length;
      }
    } catch (err) {
      if (err.name === "AbortError" || currentAbortController?.signal?.aborted) {
        job.status = "canceled";
        job.endTime = Date.now();
        job.updatedTime = Date.now();
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          await chrome.storage.local.set({ generationJob: job });
        }
        return job;
      }
      job.errors.push(`Chunk ${i + 1} failed: ${err.message}`);
    }

    job.updatedTime = Date.now();
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ generationJob: job });
    }
  }

  // Handle zero-output failure
  if (job.accumulatedRows.length === 0 && job.errors.length > 0) {
    job.status = "error";
    job.errorMessage = job.errors.join("; ");
    job.endTime = Date.now();
    job.updatedTime = Date.now();
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ generationJob: job });
    }
    return job;
  }

  // Assemble consolidated TSV file
  const activePrompt = (Array.isArray(job.settings?.prompts)
    ? job.settings.prompts.find(p => p.id === job.promptId)
    : null) || null;
  const headerLines = extractAnkiHeaderLines(activePrompt, job.settings?.promptTemplate);
  const consolidatedTsv = [...headerLines, ...job.accumulatedRows].join("\n");

  job.status = "completed";
  job.tsvContent = consolidatedTsv;
  job.completedWords = job.accumulatedRows.length;
  job.endTime = Date.now();
  job.updatedTime = Date.now();

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.set({ generationJob: job });
  }

  // Auto-clear exported prompt words from queue if enabled
  if (job.settings?.autoClearOnExport && job.promptId) {
    try {
      const result = await chrome.storage.local.get("wordsQueue");
      const currentQueue = Array.isArray(result?.wordsQueue) ? result.wordsQueue : [];
      const remainingQueue = currentQueue.filter(item => (item.promptId || "") !== job.promptId);
      await saveQueue(remainingQueue);
    } catch (clearErr) {
      console.warn("Lanki SW: Could not auto-clear queue after export:", clearErr);
    }
  }

  // Automated background download via data: URI
  try {
    await downloadTsvFromServiceWorker(job.tsvContent, job.filename);
  } catch (dlErr) {
    console.warn("Lanki SW: Auto-download failed:", dlErr);
    job.errors.push(`Auto-download failed: ${dlErr.message}`);
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ generationJob: job });
    }
  }

  // In-page celebratory toast injection
  try {
    await notifyBatchCompleteInActiveTab({
      promptTitle: job.promptTitle,
      cardCount: job.completedWords,
      filename: job.filename
    });
  } catch (toastErr) {
    console.warn("Lanki SW: Toast notification failed:", toastErr);
  }

  return job;
}

/**
 * Cancels a running batch generation job.
 *
 * @param {string} [jobId]
 * @returns {Promise<{ success: boolean }>}
 */
export async function cancelBatchJob(jobId) {
  if (currentAbortController) {
    currentAbortController.abort();
  }
  isRunning = false;

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    const { generationJob } = await chrome.storage.local.get("generationJob");
    if (generationJob && (generationJob.status === "running" || (jobId && generationJob.id === jobId))) {
      generationJob.status = "canceled";
      generationJob.endTime = Date.now();
      generationJob.updatedTime = Date.now();
      await chrome.storage.local.set({ generationJob });
    }
  }

  await clearWatchdogAlarm();
  return { success: true };
}

/**
 * Resets the current generation job in storage to idle.
 *
 * @returns {Promise<{ success: boolean }>}
 */
export async function dismissBatchJob() {
  if (currentAbortController) {
    currentAbortController.abort();
  }
  isRunning = false;

  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    await chrome.storage.local.set({
      generationJob: {
        ...DEFAULT_IDLE_JOB,
        startTime: 0,
        endTime: 0
      }
    });
  }

  await clearWatchdogAlarm();
  return { success: true };
}

/**
 * Retrieves the current generationJob state from chrome.storage.local.
 *
 * @returns {Promise<Object>}
 */
export async function getGenerationJobState() {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return { ...DEFAULT_IDLE_JOB };
  }
  const { generationJob } = await chrome.storage.local.get("generationJob");
  return generationJob || { ...DEFAULT_IDLE_JOB };
}

/**
 * Resumes an interrupted batch generation job after service worker restart.
 */
export async function resumeBatchJobIfNeeded() {
  if (isRunning) return;
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;

  try {
    const { generationJob } = await chrome.storage.local.get("generationJob");
    if (generationJob && generationJob.status === "running") {
      if (Array.isArray(generationJob.words) && generationJob.settings) {
        const chunkSize = Math.max(1, parseInt(generationJob.settings.chunkSize, 10) || 10);
        const chunks = chunkArray(generationJob.words, chunkSize);
        if (generationJob.currentChunk < chunks.length) {
          console.log(`Lanki SW: Resuming interrupted batch job from chunk ${generationJob.currentChunk + 1} of ${chunks.length}`);
          isRunning = true;
          currentAbortController = new AbortController();
          await startWatchdogAlarm();
          activeJobPromise = executeJobLoop(generationJob, chunks).finally(async () => {
            isRunning = false;
            currentAbortController = null;
            activeJobPromise = null;
            await clearWatchdogAlarm();
          });
        } else {
          generationJob.status = "completed";
          generationJob.endTime = Date.now();
          await chrome.storage.local.set({ generationJob });
          await clearWatchdogAlarm();
        }
      }
    } else {
      await clearWatchdogAlarm();
    }
  } catch (err) {
    console.warn("Lanki SW: resumeBatchJobIfNeeded error:", err);
  }
}

/**
 * Handles the keepalive watchdog alarm.
 */
export async function handleWatchdogAlarm(alarm) {
  if (alarm && alarm.name !== WATCHDOG_ALARM_NAME) return;
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;

  const { generationJob } = await chrome.storage.local.get("generationJob");
  if (generationJob && generationJob.status === "running") {
    if (!isRunning) {
      await resumeBatchJobIfNeeded();
    }
  } else {
    await clearWatchdogAlarm();
  }
}

/**
 * Triggers background download of Anki TSV file directly from Service Worker
 * using RFC 2397 base64 data URI format with UTF-8 BOM (\uFEFF).
 *
 * @param {string} tsvContent
 * @param {string} filename
 * @returns {Promise<{ downloadId: number|null, filename: string, dataUrl: string }>}
 */
export async function downloadTsvFromServiceWorker(tsvContent, filename) {
  if (!tsvContent) {
    throw new Error("No TSV content to download.");
  }

  const contentWithBom = tsvContent.startsWith("\uFEFF") ? tsvContent : ("\uFEFF" + tsvContent);
  const utf8Bytes = new TextEncoder().encode(contentWithBom);

  let binaryString = "";
  const chunkSize = 8192;
  for (let i = 0; i < utf8Bytes.length; i += chunkSize) {
    const subChunk = utf8Bytes.subarray(i, i + chunkSize);
    binaryString += String.fromCharCode.apply(null, subChunk);
  }

  let base64Data = "";
  if (typeof btoa === "function") {
    base64Data = btoa(binaryString);
  } else if (typeof Buffer !== "undefined") {
    base64Data = Buffer.from(utf8Bytes).toString("base64");
  }

  const dataUrl = `data:text/tab-separated-values;charset=utf-8;base64,${base64Data}`;

  let safeFilename = filename || `lanki_anki_deck_${Date.now()}.txt`;
  if (!safeFilename.toLowerCase().endsWith(".txt")) {
    safeFilename += ".txt";
  }

  if (typeof chrome !== "undefined" && chrome.downloads?.download) {
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: safeFilename,
      saveAs: false,
      conflictAction: "uniquify"
    });
    return { downloadId, filename: safeFilename, dataUrl };
  }

  return { downloadId: null, filename: safeFilename, dataUrl };
}

/**
 * Injects a celebratory completion toast into the currently active tab.
 *
 * @param {Object} options
 * @param {string} options.promptTitle
 * @param {number} options.cardCount
 * @param {string} options.filename
 * @returns {Promise<boolean>}
 */
export async function notifyBatchCompleteInActiveTab({ promptTitle, cardCount, filename }) {
  try {
    if (typeof chrome === "undefined" || !chrome.tabs?.query || !chrome.scripting?.executeScript) {
      return false;
    }
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTab?.id || !isTabInjectable(activeTab.url)) {
      return false;
    }

    await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: displayBatchCompleteToast,
      args: [promptTitle, cardCount, filename]
    });
    return true;
  } catch (err) {
    console.warn("Lanki SW: Could not inject batch completion toast:", err);
    return false;
  }
}

/**
 * Self-contained DOM toast injected into active web tab.
 * Uses Lanki's #lanki-toast-container element.
 */
export function displayBatchCompleteToast(promptTitle, cardCount, filename) {
  const HOST_ID = "lanki-toast-container";
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    Object.assign(host.style, {
      position: "fixed",
      bottom: "24px",
      right: "24px",
      zIndex: "2147483647",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      pointerEvents: "none",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    });
    document.body.appendChild(host);
  }

  const toast = document.createElement("div");
  Object.assign(toast.style, {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    padding: "14px 20px",
    background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
    color: "#ffffff",
    border: "1px solid #6366f1",
    borderRadius: "12px",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.3)",
    fontSize: "13px",
    opacity: "0",
    transform: "translateY(16px) scale(0.95)",
    transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
    pointerEvents: "auto",
    maxWidth: "420px",
    backdropFilter: "blur(12px)"
  });

  const titleText = promptTitle || "Deck";
  const count = typeof cardCount === "number" ? cardCount : 0;

  toast.innerHTML = `
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: linear-gradient(135deg, #4f46e5 0%, #10b981 100%);
      color: #fff;
      font-weight: bold;
      font-size: 18px;
      flex-shrink: 0;
      box-shadow: 0 0 12px rgba(79, 70, 229, 0.6);
    ">🎉</div>
    <div style="display: flex; flex-direction: column; overflow: hidden;">
      <div style="font-weight: 700; color: #f8fafc; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        Lanki: Anki Deck Generated!
      </div>
      <div style="font-size: 12px; color: #cbd5e1; margin-top: 2px;">
        Generated <b>${count}</b> cards for <i>${titleText}</i>.
      </div>
      <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
        File downloaded ready for Anki import.
      </div>
    </div>
  `;

  host.appendChild(toast);

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0) scale(1)";
    });
  } else {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0) scale(1)";
  }

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(12px) scale(0.95)";
    setTimeout(() => {
      toast.remove();
      if (host.children.length === 0) host.remove();
    }, 300);
  }, 4500);
}

/**
 * Checks whether a URL is injectable for scripting.
 */
export function isTabInjectable(url) {
  if (!url) return false;
  return !url.startsWith("chrome://") &&
         !url.startsWith("edge://") &&
         !url.startsWith("chrome-extension://") &&
         !url.startsWith("view-source:") &&
         !url.startsWith("devtools://") &&
         !url.includes("chromewebstore.google.com") &&
         !url.includes("chrome.google.com/webstore");
}

export async function startWatchdogAlarm() {
  try {
    if (typeof chrome !== "undefined" && chrome.alarms?.create) {
      await chrome.alarms.create(WATCHDOG_ALARM_NAME, {
        periodInMinutes: 0.5
      });
    }
  } catch (err) {
    console.warn("Lanki SW: Could not start watchdog alarm:", err);
  }
}

export async function clearWatchdogAlarm() {
  try {
    if (typeof chrome !== "undefined" && chrome.alarms?.clear) {
      await chrome.alarms.clear(WATCHDOG_ALARM_NAME);
    }
  } catch (err) {
    console.warn("Lanki SW: Could not clear watchdog alarm:", err);
  }
}
