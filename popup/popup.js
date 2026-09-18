import {
  SAMPLE_IELTS_PROMPT,
  DEFAULT_PROMPTS,
  LOCAL_OCR_PRESETS,
  ANKI_HEADER_LINES,
  extractAnkiHeaderLines,
  normalizeHeaderLines,
  getColumnNamesFromHeader,
  getSettings,
  saveSettings,
  getQueue,
  saveQueue,
  getActivePrompt,
  getItemsForPrompt,
  getPromptCounts,
  normalizeWord,
  normalizeQueueItem
} from "../src/defaults.js";

import {
  generateAnkiDeck,
  triggerTsvDownload,
  testApiConnection,
  testVisionConnection,
  generateAnkiHeaderWithLlm
} from "../src/generator.js";

// DOM Elements - Navigation & Layout
const tabQueueBtn = document.getElementById("tab-queue-btn");
const tabSettingsBtn = document.getElementById("tab-settings-btn");
const tabQueue = document.getElementById("tab-queue");
const tabSettings = document.getElementById("tab-settings");
const alertBanner = document.getElementById("alert-banner");
const queueBadge = document.getElementById("queue-badge");

// DOM Elements - Queue Tab
const addWordForm = document.getElementById("add-word-form");
const wordInput = document.getElementById("word-input");
const contextInput = document.getElementById("context-input");
const snipScreenBtn = document.getElementById("snip-screen-btn");
const statsSummary = document.getElementById("stats-summary");
const clearAllBtn = document.getElementById("clear-all-btn");
const wordListContainer = document.getElementById("word-list-container");
const emptyState = document.getElementById("empty-state");
const generateBtn = document.getElementById("generate-btn");
const generateBtnText = document.getElementById("generate-btn-text");

// DOM Elements - Queue Tab Prompt Selector
const queueActivePromptSelect = document.getElementById("queue-active-prompt-select");
const queueManagePromptsBtn = document.getElementById("queue-manage-prompts-btn");

// DOM Elements - Progress & Success Panels
const progressPanel = document.getElementById("progress-panel");
const progressTitle = document.getElementById("progress-title");
const progressPercent = document.getElementById("progress-percent");
const progressBarFill = document.getElementById("progress-bar-fill");
const progressDetail = document.getElementById("progress-detail");
const cancelGenBtn = document.getElementById("cancel-gen-btn");

const successPanel = document.getElementById("success-panel");
const successMessage = document.getElementById("success-message");
const downloadAgainBtn = document.getElementById("download-again-btn");
const dismissSuccessBtn = document.getElementById("dismiss-success-btn");

// DOM Elements - Settings Tab
const settingsForm = document.getElementById("settings-form");
const settingBaseUrl = document.getElementById("setting-base-url");
const settingApiKey = document.getElementById("setting-api-key");
const toggleKeyVisibility = document.getElementById("toggle-key-visibility");
const settingModel = document.getElementById("setting-model");
const settingChunkSize = document.getElementById("setting-chunk-size");
const settingAutoClear = document.getElementById("setting-auto-clear");
const testConnectionBtn = document.getElementById("test-connection-btn");
const testConnectionResult = document.getElementById("test-connection-result");

// DOM Elements - Settings Tab Vision Section
const settingDedicatedVision = document.getElementById("setting-dedicated-vision");
const visionSettingsFields = document.getElementById("vision-settings-fields");
const settingVisionBaseUrl = document.getElementById("setting-vision-base-url");
const settingVisionModel = document.getElementById("setting-vision-model");
const settingVisionApiKey = document.getElementById("setting-vision-api-key");
const testVisionBtn = document.getElementById("test-vision-btn");
const testVisionResult = document.getElementById("test-vision-result");

// DOM Elements - Settings Tab Local OCR Section
const ocrTabApi = document.getElementById("ocr-tab-api");
const ocrTabLocal = document.getElementById("ocr-tab-local");
const ocrApiPanel = document.getElementById("ocr-api-panel");
const ocrLocalPanel = document.getElementById("ocr-local-panel");
const settingLocalOcrPreset = document.getElementById("setting-local-ocr-preset");
const localOcrModelInfo = document.getElementById("local-ocr-model-info");
const localOcrPresetDesc = document.getElementById("local-ocr-preset-desc");
const localOcrStatusBadge = document.getElementById("local-ocr-status-badge");
const localOcrProgressContainer = document.getElementById("local-ocr-progress-container");
const localOcrProgressBar = document.getElementById("local-ocr-progress-bar");
const localOcrProgressText = document.getElementById("local-ocr-progress-text");
const localOcrProgressPercent = document.getElementById("local-ocr-progress-percent");
const downloadLocalOcrBtn = document.getElementById("download-local-ocr-btn");
const downloadBtnText = document.getElementById("download-btn-text");
const testLocalOcrBtn = document.getElementById("test-local-ocr-btn");
const clearLocalOcrBtn = document.getElementById("clear-local-ocr-btn");
const testLocalOcrResult = document.getElementById("test-local-ocr-result");

// DOM Elements - Settings Tab Prompt Section
const settingsActivePromptSelect = document.getElementById("settings-active-prompt-select");
const openPromptManagerBtn = document.getElementById("open-prompt-manager-btn");
const quickAddPromptBtn = document.getElementById("quick-add-prompt-btn");
const promptCardTitle = document.getElementById("prompt-card-title");
const promptPlaceholderBadge = document.getElementById("prompt-placeholder-badge");
const promptColumnsBadge = document.getElementById("prompt-columns-badge");
const editCurrentPromptBtn = document.getElementById("edit-current-prompt-btn");
const duplicateCurrentPromptBtn = document.getElementById("duplicate-current-prompt-btn");
const togglePromptPreviewBtn = document.getElementById("toggle-prompt-preview-btn");
const previewToggleIcon = document.getElementById("preview-toggle-icon");
const promptPreviewBody = document.getElementById("prompt-preview-body");
const promptPreviewText = document.getElementById("prompt-preview-text");

// DOM Elements - Prompt Modal
const promptModal = document.getElementById("prompt-modal");
const modalTitle = document.getElementById("modal-title");
const closeModalBtn = document.getElementById("close-modal-btn");
const modalListView = document.getElementById("modal-list-view");
const promptCount = document.getElementById("prompt-count");
const modalAddPromptBtn = document.getElementById("modal-add-prompt-btn");
const modalPromptList = document.getElementById("modal-prompt-list");
const modalEditorForm = document.getElementById("modal-editor-form");
const editPromptId = document.getElementById("edit-prompt-id");
const editPromptTitle = document.getElementById("edit-prompt-title");
const editPromptContent = document.getElementById("edit-prompt-content");
const editPromptHeaders = document.getElementById("edit-prompt-headers");
const btnDetectHeaderFromText = document.getElementById("btn-detect-header-from-text");
const btnAiGenerateHeader = document.getElementById("btn-ai-generate-header");
const headerColumnsBadge = document.getElementById("header-columns-badge");
const insertPlaceholderBtn = document.getElementById("insert-placeholder-btn");
const modalCancelEditBtn = document.getElementById("modal-cancel-edit-btn");

// State
let currentQueue = [];
let currentSettings = null;
let isGenerating = false;
let abortController = null;
let lastGeneratedTsv = null;
let bannerTimeout = null;
let isPreviewCollapsed = false;

// Initialization
document.addEventListener("DOMContentLoaded", async () => {
  await loadState();
  setupEventListeners();
  renderQueue();
  renderSettings();
  renderPromptsUI();
});

async function loadState() {
  currentQueue = await getQueue();
  currentSettings = await getSettings();
}

function setupEventListeners() {
  // Navigation tabs
  tabQueueBtn.addEventListener("click", () => switchTab("queue"));
  tabSettingsBtn.addEventListener("click", () => switchTab("settings"));

  // Queue actions
  addWordForm.addEventListener("submit", handleAddWord);
  if (snipScreenBtn) {
    snipScreenBtn.addEventListener("click", handleTriggerSnip);
  }
  clearAllBtn.addEventListener("click", handleClearAll);
  generateBtn.addEventListener("click", handleGenerateDeck);
  cancelGenBtn.addEventListener("click", handleCancelGeneration);
  downloadAgainBtn.addEventListener("click", handleDownloadAgain);
  dismissSuccessBtn.addEventListener("click", () => successPanel.classList.add("hidden"));

  // Prompt selectors (Queue & Settings)
  queueActivePromptSelect.addEventListener("change", (e) => handlePromptSelectChange(e.target.value));
  settingsActivePromptSelect.addEventListener("change", (e) => handlePromptSelectChange(e.target.value));

  // Prompt management triggers
  queueManagePromptsBtn.addEventListener("click", () => openModal("list"));
  openPromptManagerBtn.addEventListener("click", () => openModal("list"));
  quickAddPromptBtn.addEventListener("click", () => openModal("create"));
  modalAddPromptBtn.addEventListener("click", () => openModal("create"));
  closeModalBtn.addEventListener("click", closeModal);
  modalCancelEditBtn.addEventListener("click", () => openModal("list"));
  modalEditorForm.addEventListener("submit", handleSavePromptForm);
  insertPlaceholderBtn.addEventListener("click", handleInsertPlaceholder);

  // Header detection and AI generation triggers
  if (btnDetectHeaderFromText) {
    btnDetectHeaderFromText.addEventListener("click", handleQuickDetectHeader);
  }
  if (btnAiGenerateHeader) {
    btnAiGenerateHeader.addEventListener("click", handleAiGenerateHeader);
  }
  if (editPromptHeaders) {
    editPromptHeaders.addEventListener("input", updateHeaderColumnsBadge);
  }

  // Quick actions on preview card
  editCurrentPromptBtn.addEventListener("click", () => {
    const active = getActivePrompt(currentSettings);
    openModal("edit", active);
  });
  duplicateCurrentPromptBtn.addEventListener("click", () => {
    handleDuplicatePrompt(currentSettings.activePromptId);
  });
  togglePromptPreviewBtn.addEventListener("click", handleTogglePreview);

  // Close modal when clicking on backdrop outside modal dialog
  promptModal.addEventListener("click", (e) => {
    if (e.target === promptModal) {
      closeModal();
    }
  });

  // Settings actions
  settingsForm.addEventListener("submit", handleSaveSettings);
  toggleKeyVisibility.addEventListener("click", handleToggleKeyVisibility);
  testConnectionBtn.addEventListener("click", handleTestConnection);

  // Vision settings triggers
  if (settingDedicatedVision) {
    settingDedicatedVision.addEventListener("change", toggleVisionFields);
  }
  if (testVisionBtn) {
    testVisionBtn.addEventListener("click", handleTestVisionConnection);
  }
  document.querySelectorAll(".vision-preset-btn").forEach(chip => {
    chip.addEventListener("click", () => {
      settingVisionBaseUrl.value = chip.dataset.url;
      settingVisionModel.value = chip.dataset.model;
    });
  });

  // Local OCR Engine mode tabs & actions
  if (ocrTabApi) {
    ocrTabApi.addEventListener("click", () => switchOcrEngineTab("api"));
  }
  if (ocrTabLocal) {
    ocrTabLocal.addEventListener("click", () => switchOcrEngineTab("local"));
  }
  if (settingLocalOcrPreset) {
    settingLocalOcrPreset.addEventListener("change", handlePresetChange);
  }
  if (downloadLocalOcrBtn) {
    downloadLocalOcrBtn.addEventListener("click", handleDownloadLocalOcr);
  }
  if (testLocalOcrBtn) {
    testLocalOcrBtn.addEventListener("click", handleTestLocalOcr);
  }
  if (clearLocalOcrBtn) {
    clearLocalOcrBtn.addEventListener("click", handleClearLocalOcrCache);
  }

  // Runtime message listener for live download progress updates
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "OCR_DOWNLOAD_PROGRESS") {
      updateLocalOcrProgress(msg);
    }
  });

  // Model preset chips
  document.querySelectorAll(".chip-btn:not(.vision-preset-btn)").forEach(chip => {
    chip.addEventListener("click", () => {
      settingModel.value = chip.dataset.model;
    });
  });

  // Storage listener to update queue or settings if modified elsewhere
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local") {
      if (changes.wordsQueue) {
        currentQueue = changes.wordsQueue.newValue || [];
        renderQueue();
      }
      if (changes.settings) {
        currentSettings = changes.settings.newValue || currentSettings;
        renderSettings();
        renderPromptsUI();
      }
    }
  });
}

function switchTab(tabName) {
  if (isGenerating) return; // Prevent switching while generating

  if (tabName === "queue") {
    tabQueueBtn.classList.add("active");
    tabSettingsBtn.classList.remove("active");
    tabQueue.classList.remove("hidden");
    tabSettings.classList.add("hidden");
  } else {
    tabSettingsBtn.classList.add("active");
    tabQueueBtn.classList.remove("active");
    tabSettings.classList.remove("hidden");
    tabQueue.classList.add("hidden");
  }
}

// -------------------------------------------------------------
// Queue View Functions
// -------------------------------------------------------------

function renderQueue() {
  const activePrompt = getActivePrompt(currentSettings);
  const activePromptId = activePrompt?.id || "";
  const activePromptTitle = activePrompt?.title || "Default";

  // Filter currentQueue for the active prompt template
  const activeQueue = getItemsForPrompt(currentQueue, activePromptId);
  const count = activeQueue.length;
  const totalCount = currentQueue.length;

  queueBadge.textContent = String(count);

  if (count === 0) {
    emptyState.classList.remove("hidden");
    const emptySubtext = emptyState.querySelector("p");
    if (emptySubtext) {
      emptySubtext.innerHTML = `No items queued for <b>${activePromptTitle}</b>.<br>Add words above or highlight and right-click on any webpage.`;
    }
    wordListContainer.innerHTML = "";
    statsSummary.textContent = `0 words in "${activePromptTitle}" queue${totalCount > 0 ? ` (${totalCount} total in other prompts)` : ""}`;
    clearAllBtn.style.display = "none";
    generateBtn.disabled = true;
    generateBtnText.textContent = "Generate Anki Deck";
    return;
  }

  emptyState.classList.add("hidden");
  clearAllBtn.style.display = "inline-block";
  generateBtn.disabled = isGenerating;

  const chunkSize = currentSettings?.chunkSize || 10;
  const totalBatches = Math.ceil(count / chunkSize);
  const lastBatchRemainder = count % chunkSize || chunkSize;

  statsSummary.textContent = `${count} word${count === 1 ? "" : "s"} in "${activePromptTitle}" • ${totalBatches} batch${totalBatches === 1 ? "" : "es"} (${chunkSize}/batch${totalBatches > 1 && lastBatchRemainder !== chunkSize ? `, last: ${lastBatchRemainder}` : ""})${totalCount !== count ? ` • [${totalCount} total]` : ""}`;
  generateBtnText.textContent = `Generate ${activePromptTitle} Deck (${count} items)`;

  // Render word chips for activeQueue
  wordListContainer.innerHTML = "";
  activeQueue.forEach((item) => {
    const wordText = typeof item === "string" ? item : item.word;
    const contextText = typeof item === "object" && item.context ? item.context.trim() : "";

    const chip = document.createElement("div");
    chip.className = "word-chip" + (contextText ? " has-context" : "");
    if (contextText) {
      chip.title = `Context: "${contextText}"`;
    }

    if (contextText) {
      const ctxIcon = document.createElement("span");
      ctxIcon.className = "word-chip-context-icon";
      ctxIcon.textContent = "📝";
      ctxIcon.title = `Context: "${contextText}"`;
      chip.appendChild(ctxIcon);
    }

    const textSpan = document.createElement("span");
    textSpan.textContent = wordText;

    const delBtn = document.createElement("button");
    delBtn.className = "word-chip-delete";
    delBtn.innerHTML = "&times;";
    delBtn.title = `Remove "${wordText}"`;
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleRemoveItem(item.id, wordText);
    });

    chip.appendChild(textSpan);
    chip.appendChild(delBtn);
    wordListContainer.appendChild(chip);
  });
}

async function handleAddWord(e) {
  e.preventDefault();
  const rawValue = wordInput.value;
  const word = normalizeWord(rawValue);
  const context = (contextInput ? contextInput.value : "").trim();

  if (!word) return;

  const activePrompt = getActivePrompt(currentSettings);
  const activePromptId = activePrompt?.id || "";
  const activePromptTitle = activePrompt?.title || "Active";

  const alreadyIndex = currentQueue.findIndex(w => {
    const itemWord = typeof w === "string" ? w : w.word;
    const itemPrompt = typeof w === "object" ? (w.promptId || "") : "";
    return itemPrompt === activePromptId && itemWord.toLowerCase() === word.toLowerCase();
  });

  if (alreadyIndex !== -1) {
    if (context && !currentQueue[alreadyIndex].context) {
      currentQueue[alreadyIndex].context = context;
      await saveQueue(currentQueue);
      renderQueue();
      showAlert(`Updated context for "${word}".`, "success", 2000);
      wordInput.value = "";
      if (contextInput) contextInput.value = "";
      return;
    }
    showAlert(`"${word}" is already in "${activePromptTitle}" queue.`, "info");
    wordInput.value = "";
    return;
  }

  const newItem = {
    id: "w_" + Math.random().toString(36).slice(2, 9),
    word,
    context,
    promptId: activePromptId,
    timestamp: Date.now()
  };

  currentQueue.push(newItem);
  await saveQueue(currentQueue);
  wordInput.value = "";
  if (contextInput) contextInput.value = "";
  renderQueue();
  renderPromptsUI();
  showAlert(`Added "${word}"${context ? " with context" : ""} to ${activePromptTitle}.`, "success", 2000);
}

async function handleTriggerSnip() {
  try {
    const res = await chrome.runtime.sendMessage({ action: "TRIGGER_SNIP_ACTIVE_TAB" });
    if (res?.success) {
      window.close(); // Close extension popup so user can drag selection directly on webpage
    } else {
      showAlert(res?.error || "Cannot capture on this page.", "error");
    }
  } catch (err) {
    showAlert("Could not start snipping: " + err.message, "error");
  }
}

async function handleRemoveItem(itemId, wordText) {
  const index = currentQueue.findIndex(item => (item.id && item.id === itemId) || item.word === wordText);
  if (index !== -1) {
    const removed = currentQueue.splice(index, 1);
    await saveQueue(currentQueue);
    renderQueue();
    renderPromptsUI();
    const removedWord = typeof removed[0] === "string" ? removed[0] : removed[0]?.word;
    showAlert(`Removed "${removedWord}".`, "info", 1800);
  }
}

async function handleClearAll() {
  const activePrompt = getActivePrompt(currentSettings);
  const activePromptId = activePrompt?.id || "";
  const activePromptTitle = activePrompt?.title || "Active";
  const activeQueue = getItemsForPrompt(currentQueue, activePromptId);

  if (activeQueue.length === 0) return;
  if (confirm(`Remove all ${activeQueue.length} items from "${activePromptTitle}" queue?`)) {
    currentQueue = currentQueue.filter(item => (item.promptId || "") !== activePromptId);
    await saveQueue(currentQueue);
    renderQueue();
    renderPromptsUI();
    showAlert(`"${activePromptTitle}" queue cleared.`, "info", 2000);
  }
}

// -------------------------------------------------------------
// Generation & Export Flow
// -------------------------------------------------------------

async function handleGenerateDeck() {
  const activePrompt = getActivePrompt(currentSettings);
  if (!activePrompt || !activePrompt.content || !activePrompt.content.trim()) {
    showAlert("Please create a prompt template first before generating!", "error", 5000);
    openModal(currentSettings?.prompts?.length > 0 ? "list" : "create");
    return;
  }

  const activePromptId = activePrompt.id;
  const activePromptTitle = activePrompt.title;
  const wordsToProcess = getItemsForPrompt(currentQueue, activePromptId);

  if (isGenerating || wordsToProcess.length === 0) return;

  currentSettings.promptTemplate = activePrompt.content;

  isGenerating = true;
  abortController = new AbortController();
  successPanel.classList.add("hidden");
  progressPanel.classList.remove("hidden");

  // UI locks
  generateBtn.disabled = true;
  clearAllBtn.style.display = "none";
  addWordForm.querySelector("button").disabled = true;
  wordInput.disabled = true;

  const chunkSize = currentSettings?.chunkSize || 10;
  const totalBatches = Math.ceil(wordsToProcess.length / chunkSize);

  updateProgressUI({
    currentChunk: 1,
    totalChunks: totalBatches,
    percent: 0,
    message: `Starting batch 1 of ${totalBatches}...`
  });

  try {
    const result = await generateAnkiDeck({
      words: wordsToProcess,
      settings: currentSettings,
      signal: abortController.signal,
      onProgress: (prog) => {
        if (prog.status === "processing") {
          const pct = Math.round(((prog.currentChunk - 1) / prog.totalChunks) * 100);
          updateProgressUI({
            currentChunk: prog.currentChunk,
            totalChunks: prog.totalChunks,
            percent: pct,
            message: `Batch ${prog.currentChunk}/${prog.totalChunks}: processing ${prog.chunkWords.length} words...`
          });
        } else if (prog.status === "chunk_finished") {
          const pct = Math.round((prog.currentChunk / prog.totalChunks) * 100);
          updateProgressUI({
            currentChunk: prog.currentChunk,
            totalChunks: prog.totalChunks,
            percent: pct,
            message: `Batch ${prog.currentChunk}/${prog.totalChunks} completed (${prog.completedWords}/${prog.totalWords} cards).`
          });
        }
      }
    });

    lastGeneratedTsv = result.tsvContent;
    const safeTitle = activePromptTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const filename = `lanki_${safeTitle || "deck"}_${Date.now()}.txt`;
    await triggerTsvDownload(lastGeneratedTsv, filename);

    // Show success panel
    successPanel.classList.remove("hidden");
    successMessage.textContent = `Downloaded 1 file containing ${result.rowCount} flashcard entries for "${activePromptTitle}".`;

    if (result.errors && result.errors.length > 0) {
      showAlert(`Completed with warnings:\n${result.errors.join("; ")}`, "info", 6000);
    } else {
      showAlert(`All ${result.rowCount} cards generated successfully for "${activePromptTitle}"!`, "success", 4000);
    }

    // Auto-clear only the exported items belonging to this prompt!
    if (currentSettings.autoClearOnExport) {
      currentQueue = currentQueue.filter(item => (item.promptId || "") !== activePromptId);
      await saveQueue(currentQueue);
      renderQueue();
      renderPromptsUI();
    }
  } catch (err) {
    if (err.name === "AbortError") {
      showAlert("Generation cancelled by user.", "info", 3000);
    } else {
      console.error("Generation error:", err);
      showAlert(`Error: ${err.message}`, "error", 8000);
    }
  } finally {
    isGenerating = false;
    abortController = null;
    progressPanel.classList.add("hidden");
    addWordForm.querySelector("button").disabled = false;
    wordInput.disabled = false;
    renderQueue();
  }
}

function updateProgressUI({ currentChunk, totalChunks, percent, message }) {
  progressTitle.textContent = `Batch ${currentChunk} of ${totalChunks}`;
  progressPercent.textContent = `${percent}%`;
  progressBarFill.style.width = `${percent}%`;
  progressDetail.textContent = message;
}

function handleCancelGeneration() {
  if (abortController) {
    abortController.abort();
  }
}

async function handleDownloadAgain() {
  if (lastGeneratedTsv) {
    await triggerTsvDownload(lastGeneratedTsv);
    showAlert("Download re-triggered!", "success", 2000);
  }
}

// -------------------------------------------------------------
// Settings Functions
// -------------------------------------------------------------

function renderSettings() {
  if (!currentSettings) return;

  settingBaseUrl.value = currentSettings.apiBaseUrl || "http://localhost:4000/v1";
  settingApiKey.value = currentSettings.apiKey || "";
  settingModel.value = currentSettings.model || "gpt-4o-mini";
  settingChunkSize.value = currentSettings.chunkSize || 10;
  settingAutoClear.checked = currentSettings.autoClearOnExport !== false;

  // Dedicated Vision / OCR settings
  const activeEngine = currentSettings.ocrEngine || "api";
  switchOcrEngineTab(activeEngine, false);

  if (settingDedicatedVision) {
    settingDedicatedVision.checked = currentSettings.useDedicatedVision === true;
    toggleVisionFields();
  }
  if (settingVisionBaseUrl) {
    settingVisionBaseUrl.value = currentSettings.visionBaseUrl || "http://localhost:1234/v1";
  }
  if (settingVisionModel) {
    settingVisionModel.value = currentSettings.visionModel || "qwen2-vl";
  }
  if (settingVisionApiKey) {
    settingVisionApiKey.value = currentSettings.visionApiKey || "";
  }

  // Local OCR Preset
  const currentPreset = currentSettings.localOcr?.preset || "v6-tiny";
  if (settingLocalOcrPreset) {
    settingLocalOcrPreset.value = currentPreset;
    updatePresetDisplay(currentPreset);
  }
}

async function handleSaveSettings(e) {
  e.preventDefault();

  const chunkSize = parseInt(settingChunkSize.value, 10);
  if (isNaN(chunkSize) || chunkSize < 1 || chunkSize > 50) {
    showAlert("Chunk size must be between 1 and 50.", "error");
    return;
  }

  currentSettings.apiBaseUrl = settingBaseUrl.value.trim();
  currentSettings.apiKey = settingApiKey.value.trim();
  currentSettings.model = settingModel.value.trim() || "gpt-4o-mini";
  currentSettings.chunkSize = chunkSize;
  currentSettings.autoClearOnExport = settingAutoClear.checked;

  // OCR Engine mode
  currentSettings.ocrEngine = ocrTabLocal?.classList.contains("active") ? "local" : "api";

  // Dedicated Vision settings
  if (settingDedicatedVision) {
    currentSettings.useDedicatedVision = settingDedicatedVision.checked;
  }
  if (settingVisionBaseUrl) {
    currentSettings.visionBaseUrl = settingVisionBaseUrl.value.trim() || "http://localhost:1234/v1";
  }
  if (settingVisionModel) {
    currentSettings.visionModel = settingVisionModel.value.trim() || "qwen2-vl";
  }
  if (settingVisionApiKey) {
    currentSettings.visionApiKey = settingVisionApiKey.value.trim();
  }

  // Local OCR Preset settings
  const selectedPresetId = settingLocalOcrPreset?.value || "v6-tiny";
  const presetConfig = LOCAL_OCR_PRESETS[selectedPresetId] || LOCAL_OCR_PRESETS["v6-tiny"];
  currentSettings.localOcr = {
    preset: selectedPresetId,
    detUrl: presetConfig.detUrl,
    recUrl: presetConfig.recUrl,
    dictUrl: ""
  };

  const active = getActivePrompt(currentSettings);
  currentSettings.promptTemplate = active ? active.content : "";

  await saveSettings(currentSettings);
  showAlert("Settings saved successfully!", "success", 2500);
  renderQueue();
  renderPromptsUI();
}

function handleToggleKeyVisibility() {
  const isPassword = settingApiKey.type === "password";
  settingApiKey.type = isPassword ? "text" : "password";
  toggleKeyVisibility.textContent = isPassword ? "🙈" : "👁️";
}

// -------------------------------------------------------------
// Prompt Management UI & Operations
// -------------------------------------------------------------

function renderPromptsUI() {
  if (!currentSettings || !Array.isArray(currentSettings.prompts)) return;

  const prompts = currentSettings.prompts;
  const activePrompt = getActivePrompt(currentSettings);
  const activeId = activePrompt ? activePrompt.id : "";
  const promptCounts = getPromptCounts(currentQueue);

  // Populate Queue Tab select
  queueActivePromptSelect.innerHTML = "";
  if (prompts.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No templates (Click ⚙ to create)";
    opt.disabled = true;
    opt.selected = true;
    queueActivePromptSelect.appendChild(opt);
  } else {
    prompts.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      const cnt = promptCounts[p.id] || 0;
      opt.textContent = `${p.title} (${cnt})`;
      if (p.id === activeId) opt.selected = true;
      queueActivePromptSelect.appendChild(opt);
    });
  }

  // Populate Settings Tab select
  settingsActivePromptSelect.innerHTML = "";
  if (prompts.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No templates created yet";
    opt.disabled = true;
    opt.selected = true;
    settingsActivePromptSelect.appendChild(opt);
  } else {
    prompts.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      const cnt = promptCounts[p.id] || 0;
      opt.textContent = `${p.title} (${cnt})`;
      if (p.id === activeId) opt.selected = true;
      settingsActivePromptSelect.appendChild(opt);
    });
  }

  // Update preview card
  if (activePrompt && activePrompt.content) {
    promptCardTitle.textContent = activePrompt.title;
    promptPreviewText.textContent = activePrompt.content;

    if (activePrompt.content.includes("{LIST}") || activePrompt.content.includes("{WORDS_LIST}")) {
      promptPlaceholderBadge.textContent = "✓ {LIST}";
      promptPlaceholderBadge.className = "badge-tag success";
      promptPlaceholderBadge.title = "Words will replace {LIST}";
    } else {
      promptPlaceholderBadge.textContent = "+ Appended at end";
      promptPlaceholderBadge.className = "badge-tag warning";
      promptPlaceholderBadge.title = "Words will be appended at the end of prompt";
    }

    if (promptColumnsBadge) {
      const activeHeaders = extractAnkiHeaderLines(activePrompt, activePrompt.content);
      const cols = getColumnNamesFromHeader(activeHeaders);
      promptColumnsBadge.textContent = `${cols.length} Col${cols.length === 1 ? "" : "s"}`;
      promptColumnsBadge.className = "badge-tag info";
      promptColumnsBadge.title = cols.length > 0 ? cols.join(" | ") : "Default headers";
      promptColumnsBadge.style.display = "inline-flex";
    }
  } else {
    promptCardTitle.textContent = "No template configured";
    promptPreviewText.textContent = "No prompt templates yet.\nClick [+ New] above to add your custom prompt template.";
    promptPlaceholderBadge.textContent = "Empty";
    promptPlaceholderBadge.className = "badge-tag warning";
    promptPlaceholderBadge.title = "No template configured";
    if (promptColumnsBadge) {
      promptColumnsBadge.style.display = "none";
    }
  }
}

async function handlePromptSelectChange(selectedId) {
  if (!currentSettings) return;

  currentSettings.activePromptId = selectedId;
  const active = getActivePrompt(currentSettings);
  currentSettings.promptTemplate = active ? active.content : "";

  await saveSettings(currentSettings);
  renderPromptsUI();
  renderQueue();
  showAlert(`Active prompt: "${active?.title || 'Selected'}"`, "info", 1800);
}

function handleTogglePreview() {
  isPreviewCollapsed = !isPreviewCollapsed;
  if (isPreviewCollapsed) {
    promptPreviewBody.classList.add("collapsed");
    previewToggleIcon.textContent = "▸";
  } else {
    promptPreviewBody.classList.remove("collapsed");
    previewToggleIcon.textContent = "▾";
  }
}

// Modal handling
function openModal(mode = "list", promptToEdit = null) {
  promptModal.classList.remove("hidden");

  if (mode === "list") {
    modalTitle.textContent = "Manage Prompt Templates";
    modalListView.classList.remove("hidden");
    modalEditorForm.classList.add("hidden");
    renderModalPromptList();
  } else if (mode === "create") {
    modalTitle.textContent = "Create New Prompt Template";
    modalListView.classList.add("hidden");
    modalEditorForm.classList.remove("hidden");

    editPromptId.value = "";
    editPromptTitle.value = "";
    editPromptContent.value = "";
    if (editPromptHeaders) {
      editPromptHeaders.value = ANKI_HEADER_LINES.join("\n");
      updateHeaderColumnsBadge();
    }
    editPromptTitle.focus();
  } else if (mode === "edit" && promptToEdit) {
    modalTitle.textContent = `Edit: ${promptToEdit.title}`;
    modalListView.classList.add("hidden");
    modalEditorForm.classList.remove("hidden");

    editPromptId.value = promptToEdit.id;
    editPromptTitle.value = promptToEdit.title;
    editPromptContent.value = promptToEdit.content;
    if (editPromptHeaders) {
      editPromptHeaders.value = promptToEdit.headers || extractAnkiHeaderLines(promptToEdit, promptToEdit.content).join("\n");
      updateHeaderColumnsBadge();
    }
    editPromptTitle.focus();
  }
}

function closeModal() {
  promptModal.classList.add("hidden");
}

function renderModalPromptList() {
  if (!currentSettings || !Array.isArray(currentSettings.prompts)) return;

  const prompts = currentSettings.prompts;
  promptCount.textContent = String(prompts.length);
  modalPromptList.innerHTML = "";

  if (prompts.length === 0) {
    modalPromptList.innerHTML = `
      <div class="empty-prompt-state">
        <div class="empty-icon">📝</div>
        <h4>No templates created yet</h4>
        <p>Click "Add New" above to write or paste your custom prompt template.</p>
      </div>
    `;
    return;
  }

  prompts.forEach((p) => {
    const isActive = p.id === currentSettings.activePromptId;
    const card = document.createElement("div");
    card.className = `modal-prompt-card ${isActive ? "active" : ""}`;

    // Top row
    const topRow = document.createElement("div");
    topRow.className = "modal-card-top";

    const infoCol = document.createElement("div");
    infoCol.className = "modal-card-info";

    const titleRow = document.createElement("div");
    titleRow.className = "modal-card-title-row";

    const titleSpan = document.createElement("span");
    titleSpan.className = "modal-card-title";
    titleSpan.textContent = p.title;
    titleRow.appendChild(titleSpan);

    // Column count badge
    const promptHeaders = extractAnkiHeaderLines(p, p.content);
    const cols = getColumnNamesFromHeader(promptHeaders);
    const colPill = document.createElement("span");
    colPill.className = "badge-tag info";
    colPill.style.fontSize = "9.5px";
    colPill.style.padding = "1px 6px";
    colPill.textContent = `${cols.length} cols`;
    colPill.title = cols.length > 0 ? cols.join(" | ") : "Default headers";
    titleRow.appendChild(colPill);

    // Prompt queue items count badge
    const pQueueCount = getItemsForPrompt(currentQueue, p.id).length;
    const countPill = document.createElement("span");
    countPill.className = "badge-tag" + (pQueueCount > 0 ? " success" : " warning");
    countPill.style.fontSize = "9.5px";
    countPill.style.padding = "1px 6px";
    countPill.textContent = `${pQueueCount} queued`;
    countPill.title = `${pQueueCount} word(s) in queue for this template`;
    titleRow.appendChild(countPill);

    if (isActive) {
      const activePill = document.createElement("span");
      activePill.className = "active-pill";
      activePill.textContent = "Active";
      titleRow.appendChild(activePill);
    }
    infoCol.appendChild(titleRow);

    const desc = document.createElement("p");
    desc.className = "modal-card-desc";
    const snippet = p.description || p.content.replace(/\r?\n+/g, " ").trim().slice(0, 110) + "...";
    desc.textContent = snippet;
    infoCol.appendChild(desc);
    topRow.appendChild(infoCol);
    card.appendChild(topRow);

    // Footer row
    const footerRow = document.createElement("div");
    footerRow.className = "modal-card-footer";

    if (!isActive) {
      const setActiveBtn = document.createElement("button");
      setActiveBtn.className = "btn-set-active";
      setActiveBtn.textContent = "Set Active";
      setActiveBtn.addEventListener("click", async () => {
        await handlePromptSelectChange(p.id);
        renderModalPromptList();
      });
      footerRow.appendChild(setActiveBtn);
    } else {
      const activeStatus = document.createElement("span");
      activeStatus.style.fontSize = "10.5px";
      activeStatus.style.color = "#34d399";
      activeStatus.textContent = "● Currently Selected";
      footerRow.appendChild(activeStatus);
    }

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "modal-card-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn-card-action";
    editBtn.title = "Edit template";
    editBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> <span>Edit</span>`;
    editBtn.addEventListener("click", () => openModal("edit", p));
    actionsDiv.appendChild(editBtn);

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn-card-action";
    copyBtn.title = "Duplicate template";
    copyBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> <span>Copy</span>`;
    copyBtn.addEventListener("click", () => handleDuplicatePrompt(p.id));
    actionsDiv.appendChild(copyBtn);

    const delBtn = document.createElement("button");
    delBtn.className = "btn-card-action danger";
    delBtn.title = "Delete template";
    delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> <span>Delete</span>`;
    delBtn.addEventListener("click", () => handleDeletePrompt(p.id));
    actionsDiv.appendChild(delBtn);

    footerRow.appendChild(actionsDiv);
    card.appendChild(footerRow);
    modalPromptList.appendChild(card);
  });
}

async function handleDuplicatePrompt(promptId) {
  const original = currentSettings.prompts.find(p => p.id === promptId);
  if (!original) return;

  const newPrompt = {
    id: "prompt_" + Date.now(),
    title: `${original.title} (Copy)`,
    description: original.description ? `${original.description} (Copy)` : "",
    content: original.content,
    headers: original.headers || extractAnkiHeaderLines(original, original.content).join("\n"),
    isBuiltIn: false,
    createdAt: Date.now()
  };

  currentSettings.prompts.push(newPrompt);
  currentSettings.activePromptId = newPrompt.id;
  currentSettings.promptTemplate = newPrompt.content;

  await saveSettings(currentSettings);
  renderPromptsUI();
  renderQueue();
  if (!promptModal.classList.contains("hidden")) {
    renderModalPromptList();
  }
  showAlert(`Duplicated as "${newPrompt.title}"`, "success", 2000);
}

async function handleDeletePrompt(promptId) {
  const promptToDelete = currentSettings.prompts.find(p => p.id === promptId);
  if (!promptToDelete) return;

  if (!confirm(`Delete template "${promptToDelete.title}"? This will also remove any words queued for this template.`)) return;

  currentSettings.prompts = currentSettings.prompts.filter(p => p.id !== promptId);
  currentQueue = currentQueue.filter(item => (item.promptId || "") !== promptId);
  await saveQueue(currentQueue);

  if (currentSettings.activePromptId === promptId) {
    currentSettings.activePromptId = currentSettings.prompts[0]?.id || "";
    currentSettings.promptTemplate = currentSettings.prompts[0]?.content || "";
  }

  await saveSettings(currentSettings);
  renderPromptsUI();
  renderQueue();
  renderModalPromptList();
  showAlert(`Deleted "${promptToDelete.title}".`, "info", 2000);
}

function updateHeaderColumnsBadge() {
  if (!editPromptHeaders || !headerColumnsBadge) return;
  const cols = getColumnNamesFromHeader(editPromptHeaders.value);
  if (cols.length > 0) {
    headerColumnsBadge.textContent = `${cols.length} column${cols.length === 1 ? "" : "s"}`;
    headerColumnsBadge.className = "badge-tag success";
    headerColumnsBadge.title = cols.join(" | ");
  } else {
    headerColumnsBadge.textContent = "0 columns (Invalid)";
    headerColumnsBadge.className = "badge-tag warning";
    headerColumnsBadge.title = "Ensure headers include #columns: separated by tabs";
  }
}

function handleQuickDetectHeader() {
  const promptText = editPromptContent.value || "";
  const lines = promptText.split(/\r?\n/).map(l => l.trim());
  const colLine = lines.find(l => l.startsWith("#columns:"));

  if (!colLine) {
    showAlert("No '#columns:' line found in prompt text. Click '✨ AI Generate'.", "info", 3000);
    return;
  }

  const detected = normalizeHeaderLines(["#separator:tab", "#html:true", colLine]).join("\n");
  if (editPromptHeaders) {
    editPromptHeaders.value = detected;
    updateHeaderColumnsBadge();
  }
  const cols = getColumnNamesFromHeader(detected);
  showAlert(`Detected ${cols.length} columns from prompt text!`, "success", 2200);
}

async function handleAiGenerateHeader() {
  const promptText = (editPromptContent.value || "").trim();
  if (!promptText) {
    showAlert("Please enter your prompt instructions first.", "error", 2500);
    editPromptContent.focus();
    return;
  }

  if (!btnAiGenerateHeader) return;
  const origHtml = btnAiGenerateHeader.innerHTML;
  btnAiGenerateHeader.disabled = true;
  btnAiGenerateHeader.innerHTML = `<span>⏳ Analyzing...</span>`;

  try {
    const generated = await generateAnkiHeaderWithLlm({
      promptContent: promptText,
      settings: currentSettings
    });

    if (editPromptHeaders) {
      editPromptHeaders.value = generated;
      updateHeaderColumnsBadge();
    }
    const cols = getColumnNamesFromHeader(generated);
    showAlert(`✨ AI generated ${cols.length} columns: ${cols.slice(0, 4).join(", ")}${cols.length > 4 ? "..." : ""}!`, "success", 3500);
  } catch (err) {
    console.error("AI Header generation error:", err);
    showAlert(`AI generation error: ${err.message}`, "error", 4000);
  } finally {
    btnAiGenerateHeader.disabled = false;
    btnAiGenerateHeader.innerHTML = origHtml;
  }
}

function handleInsertPlaceholder() {
  const textarea = editPromptContent;
  const start = textarea.selectionStart || 0;
  const end = textarea.selectionEnd || 0;
  const text = textarea.value;
  const insertText = "{LIST}";

  textarea.value = text.substring(0, start) + insertText + text.substring(end);
  textarea.focus();
  textarea.setSelectionRange(start + insertText.length, start + insertText.length);
}

async function handleSavePromptForm(e) {
  e.preventDefault();

  const title = editPromptTitle.value.trim();
  const content = editPromptContent.value.trim();
  const promptId = editPromptId.value.trim();
  const rawHeaders = editPromptHeaders ? editPromptHeaders.value.trim() : "";
  const headers = rawHeaders ? normalizeHeaderLines(rawHeaders.split(/\r?\n/)).join("\n") : extractAnkiHeaderLines(null, content).join("\n");

  if (!title) {
    showAlert("Please provide a template title.", "error");
    editPromptTitle.focus();
    return;
  }

  if (!content) {
    showAlert("Prompt instructions cannot be empty.", "error");
    editPromptContent.focus();
    return;
  }

  if (promptId) {
    // Edit existing
    const existing = currentSettings.prompts.find(p => p.id === promptId);
    if (existing) {
      existing.title = title;
      existing.content = content;
      existing.headers = headers;
      if (currentSettings.activePromptId === promptId) {
        currentSettings.promptTemplate = content;
      }
    }
  } else {
    // Create new
    const newPrompt = {
      id: "prompt_" + Date.now(),
      title,
      content,
      headers,
      isBuiltIn: false,
      createdAt: Date.now()
    };
    currentSettings.prompts.push(newPrompt);
    currentSettings.activePromptId = newPrompt.id;
    currentSettings.promptTemplate = content;
  }

  await saveSettings(currentSettings);
  renderPromptsUI();
  openModal("list");
  showAlert(`Template "${title}" saved!`, "success", 2500);
}

async function handleTestConnection() {
  testConnectionResult.className = "test-result";
  testConnectionResult.textContent = "Testing connection to LiteLLM / API...";
  testConnectionResult.classList.remove("hidden");
  testConnectionBtn.disabled = true;

  const testConfig = {
    apiBaseUrl: settingBaseUrl.value.trim(),
    apiKey: settingApiKey.value.trim(),
    model: settingModel.value.trim() || "gpt-4o-mini"
  };

  try {
    const response = await testApiConnection(testConfig);
    testConnectionResult.className = "test-result success";
    testConnectionResult.textContent = `✓ Connected successfully! Response: "${response.slice(0, 40)}..."`;
  } catch (err) {
    testConnectionResult.className = "test-result error";
    testConnectionResult.textContent = `✗ Connection failed: ${err.message}`;
  } finally {
    testConnectionBtn.disabled = false;
  }
}

function toggleVisionFields() {
  if (!settingDedicatedVision || !visionSettingsFields) return;
  if (settingDedicatedVision.checked) {
    visionSettingsFields.classList.remove("hidden");
  } else {
    visionSettingsFields.classList.add("hidden");
  }
}

async function handleTestVisionConnection() {
  if (!testVisionResult || !testVisionBtn) return;
  testVisionResult.className = "test-result-inline";
  testVisionResult.textContent = "Testing...";
  testVisionResult.classList.remove("hidden");
  testVisionBtn.disabled = true;

  const testConfig = {
    useDedicatedVision: settingDedicatedVision.checked,
    visionBaseUrl: settingVisionBaseUrl.value.trim() || "http://localhost:1234/v1",
    visionApiKey: settingVisionApiKey.value.trim(),
    visionModel: settingVisionModel.value.trim() || "qwen2-vl",
    apiBaseUrl: settingBaseUrl.value.trim(),
    apiKey: settingApiKey.value.trim(),
    model: settingModel.value.trim()
  };

  try {
    await testVisionConnection(testConfig);
    testVisionResult.className = "test-result-inline success";
    testVisionResult.textContent = "✓ Vision OK!";
  } catch (err) {
    testVisionResult.className = "test-result-inline error";
    testVisionResult.textContent = `✗ Failed: ${err.message.slice(0, 30)}...`;
  } finally {
    testVisionBtn.disabled = false;
  }
}

// -------------------------------------------------------------
// Local Offline OCR (PP-OCRv6) Helpers
// -------------------------------------------------------------

function updatePresetDisplay(presetId) {
  const preset = LOCAL_OCR_PRESETS[presetId] || LOCAL_OCR_PRESETS["v6-tiny"];
  if (localOcrModelInfo) {
    const mb = (preset.estimatedBytes / (1024 * 1024)).toFixed(0);
    localOcrModelInfo.textContent = `~${mb} MB (${preset.badge})`;
  }
  if (localOcrPresetDesc) {
    localOcrPresetDesc.textContent = preset.description;
  }
  if (downloadBtnText && !downloadLocalOcrBtn?.disabled) {
    const mb = (preset.estimatedBytes / (1024 * 1024)).toFixed(0);
    downloadBtnText.textContent = `Download Model (~${mb} MB)`;
  }
}

async function handlePresetChange(e) {
  const presetId = e.target.value;
  const preset = LOCAL_OCR_PRESETS[presetId] || LOCAL_OCR_PRESETS["v6-tiny"];
  if (currentSettings) {
    currentSettings.localOcr = {
      preset: presetId,
      detUrl: preset.detUrl,
      recUrl: preset.recUrl,
      dictUrl: ""
    };
    await saveSettings(currentSettings);
  }
  updatePresetDisplay(presetId);
  refreshLocalOcrStatus();
  if (testLocalOcrResult) testLocalOcrResult.classList.add("hidden");
}

function switchOcrEngineTab(engine, updateState = true) {
  if (updateState && currentSettings) {
    currentSettings.ocrEngine = engine;
  }

  if (engine === "local") {
    ocrTabLocal?.classList.add("active");
    ocrTabApi?.classList.remove("active");
    ocrLocalPanel?.classList.remove("hidden");
    ocrApiPanel?.classList.add("hidden");
    refreshLocalOcrStatus();
  } else {
    ocrTabApi?.classList.add("active");
    ocrTabLocal?.classList.remove("active");
    ocrApiPanel?.classList.remove("hidden");
    ocrLocalPanel?.classList.add("hidden");
  }
}

async function refreshLocalOcrStatus() {
  if (!localOcrStatusBadge) return;
  localOcrStatusBadge.className = "badge-tag warning";
  localOcrStatusBadge.textContent = "Checking...";

  try {
    const activePresetId = settingLocalOcrPreset?.value || currentSettings?.localOcr?.preset || "v6-tiny";
    const preset = LOCAL_OCR_PRESETS[activePresetId] || LOCAL_OCR_PRESETS["v6-tiny"];
    const approxMb = (preset.estimatedBytes / (1024 * 1024)).toFixed(0);

    const activeOcr = {
      preset: activePresetId,
      detUrl: preset.detUrl,
      recUrl: preset.recUrl
    };

    const res = await chrome.runtime.sendMessage({
      action: "GET_LOCAL_OCR_STATUS",
      customUrls: activeOcr
    });

    if (res?.isReady) {
      localOcrStatusBadge.className = "badge-tag success";
      localOcrStatusBadge.textContent = `Ready (${res.sizeFormatted || "Cached"})`;
      if (downloadLocalOcrBtn) {
        downloadLocalOcrBtn.disabled = true;
        downloadLocalOcrBtn.style.opacity = "0.7";
      }
      if (downloadBtnText) downloadBtnText.textContent = "Downloaded (Ready)";
      if (testLocalOcrBtn) testLocalOcrBtn.disabled = false;
      if (clearLocalOcrBtn) clearLocalOcrBtn.disabled = false;
    } else {
      localOcrStatusBadge.className = "badge-tag warning";
      localOcrStatusBadge.textContent = "Not Downloaded";
      if (downloadLocalOcrBtn) {
        downloadLocalOcrBtn.disabled = false;
        downloadLocalOcrBtn.style.opacity = "1";
      }
      if (downloadBtnText) downloadBtnText.textContent = `Download Model (~${approxMb} MB)`;
      if (testLocalOcrBtn) testLocalOcrBtn.disabled = true;
      if (clearLocalOcrBtn) clearLocalOcrBtn.disabled = true;
    }
  } catch (err) {
    localOcrStatusBadge.className = "badge-tag error";
    localOcrStatusBadge.textContent = "Offline/Unavailable";
  }
}

function updateLocalOcrProgress(msg) {
  if (!localOcrProgressContainer) return;
  localOcrProgressContainer.classList.remove("hidden");
  const percent = msg.percent || 0;
  if (localOcrProgressBar) localOcrProgressBar.style.width = `${percent}%`;
  if (localOcrProgressPercent) localOcrProgressPercent.textContent = `${percent}%`;
  if (localOcrProgressText) {
    const mbLoaded = (msg.loadedBytes / (1024 * 1024)).toFixed(1);
    const mbTotal = (msg.totalBytes / (1024 * 1024)).toFixed(1);
    localOcrProgressText.textContent = `Downloading ${msg.currentFile || "model"}... (${mbLoaded} MB / ${mbTotal} MB)`;
  }

  if (percent >= 100) {
    setTimeout(() => {
      localOcrProgressContainer.classList.add("hidden");
      refreshLocalOcrStatus();
    }, 1200);
  }
}

async function handleDownloadLocalOcr() {
  if (!downloadLocalOcrBtn) return;
  const activePresetId = settingLocalOcrPreset?.value || currentSettings?.localOcr?.preset || "v6-tiny";
  const preset = LOCAL_OCR_PRESETS[activePresetId] || LOCAL_OCR_PRESETS["v6-tiny"];

  downloadLocalOcrBtn.disabled = true;
  if (downloadBtnText) downloadBtnText.textContent = "Downloading...";
  if (localOcrProgressContainer) localOcrProgressContainer.classList.remove("hidden");
  if (localOcrProgressBar) localOcrProgressBar.style.width = "2%";
  if (localOcrProgressPercent) localOcrProgressPercent.textContent = "0%";
  if (localOcrProgressText) localOcrProgressText.textContent = "Starting download...";

  try {
    const res = await chrome.runtime.sendMessage({
      action: "START_LOCAL_OCR_DOWNLOAD",
      customUrls: {
        preset: activePresetId,
        detUrl: preset.detUrl,
        recUrl: preset.recUrl
      }
    });
    if (res?.success) {
      showAlert(`${preset.name} downloaded and ready!`, "success", 3000);
      refreshLocalOcrStatus();
    } else {
      throw new Error(res?.error || "Download failed");
    }
  } catch (err) {
    showAlert(`Download error: ${err.message}`, "error", 4000);
    if (localOcrProgressContainer) localOcrProgressContainer.classList.add("hidden");
    refreshLocalOcrStatus();
  }
}

async function handleTestLocalOcr() {
  if (!testLocalOcrResult || !testLocalOcrBtn) return;
  testLocalOcrResult.className = "test-result-inline";
  testLocalOcrResult.textContent = "Running test on sample image...";
  testLocalOcrResult.classList.remove("hidden");
  testLocalOcrBtn.disabled = true;

  const activePresetId = settingLocalOcrPreset?.value || currentSettings?.localOcr?.preset || "v6-tiny";
  const preset = LOCAL_OCR_PRESETS[activePresetId] || LOCAL_OCR_PRESETS["v6-tiny"];

  const startTime = Date.now();
  try {
    const res = await chrome.runtime.sendMessage({
      action: "TEST_LOCAL_OCR",
      customUrls: {
        preset: activePresetId,
        detUrl: preset.detUrl,
        recUrl: preset.recUrl
      }
    });
    const elapsed = Date.now() - startTime;
    if (res?.error) {
      throw new Error(res.error);
    }
    testLocalOcrResult.className = "test-result-inline success";
    testLocalOcrResult.textContent = `✓ PP-OCRv6 OK! Read: "${res?.text}" (${elapsed}ms)`;
  } catch (err) {
    testLocalOcrResult.className = "test-result-inline error";
    testLocalOcrResult.textContent = `✗ OCR Test failed: ${err.message}`;
  } finally {
    testLocalOcrBtn.disabled = false;
  }
}

async function handleClearLocalOcrCache() {
  if (!confirm("Clear downloaded PP-OCRv6 models and free browser cache?")) {
    return;
  }
  try {
    await chrome.runtime.sendMessage({ action: "CLEAR_LOCAL_OCR_CACHE" });
    showAlert("PP-OCRv6 model cache cleared.", "info", 2000);
    refreshLocalOcrStatus();
    if (testLocalOcrResult) testLocalOcrResult.classList.add("hidden");
  } catch (err) {
    showAlert(`Failed to clear cache: ${err.message}`, "error");
  }
}

// -------------------------------------------------------------
// Helper Alerts
// -------------------------------------------------------------

function showAlert(message, type = "info", duration = 3000) {
  if (bannerTimeout) {
    clearTimeout(bannerTimeout);
  }

  alertBanner.textContent = message;
  alertBanner.className = `alert-banner ${type}`;
  alertBanner.classList.remove("hidden");

  bannerTimeout = setTimeout(() => {
    alertBanner.classList.add("hidden");
  }, duration);
}
