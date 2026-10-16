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
  getActivePrompt,
  getQueue,
  saveQueue,
  getItemsForPrompt,
  getPromptCounts
} from "../src/defaults.js";

import { testApiConnection, testVisionConnection, generateAnkiHeaderWithLlm } from "../src/generator.js";
import { parseGeminiKeys, maskApiKey } from "../src/router.js";

// DOM Elements - Settings Form
const settingsForm = document.getElementById("settings-form");
const settingBaseUrl = document.getElementById("setting-base-url");
const settingApiKey = document.getElementById("setting-api-key");
const toggleKeyVisibility = document.getElementById("toggle-key-visibility");
const settingModel = document.getElementById("setting-model");
const settingChunkSize = document.getElementById("setting-chunk-size");
const settingAutoClear = document.getElementById("setting-auto-clear");
const testConnectionBtn = document.getElementById("test-connection-btn");
const testConnectionResult = document.getElementById("test-connection-result");
const alertBanner = document.getElementById("alert-banner");

// DOM Elements - LLM Provider Segmented Control & Gemini Multi-Key
const providerTabCustom = document.getElementById("provider-tab-custom");
const providerTabGemini = document.getElementById("provider-tab-gemini");
const providerPanelCustom = document.getElementById("provider-panel-custom");
const providerPanelGemini = document.getElementById("provider-panel-gemini");
const settingGeminiKeys = document.getElementById("setting-gemini-keys");
const toggleGeminiKeysMask = document.getElementById("toggle-gemini-keys-mask");
const keyCountTotal = document.getElementById("key-count-total");
const keyCountValid = document.getElementById("key-count-valid");
const keyCountInvalid = document.getElementById("key-count-invalid");
const settingGeminiModel = document.getElementById("setting-gemini-model");
const geminiCustomModelRow = document.getElementById("gemini-custom-model-row");
const settingGeminiCustomModel = document.getElementById("setting-gemini-custom-model");
const settingGeminiStrategy = document.getElementById("setting-gemini-strategy");
const geminiRoutingDesc = document.getElementById("gemini-routing-desc");
const settingGeminiCooldown = document.getElementById("setting-gemini-cooldown");
const settingGeminiRetries = document.getElementById("setting-gemini-retries");
const btnTestGeminiKeys = document.getElementById("btn-test-gemini-keys");
const geminiTestSummary = document.getElementById("gemini-test-summary");
const geminiKeysResultsContainer = document.getElementById("gemini-keys-results-container");

// DOM Elements - Vision & Local OCR Section
const ocrTabApi = document.getElementById("ocr-tab-api");
const ocrTabLocal = document.getElementById("ocr-tab-local");
const ocrApiPanel = document.getElementById("ocr-api-panel");
const ocrLocalPanel = document.getElementById("ocr-local-panel");
const settingDedicatedVision = document.getElementById("setting-dedicated-vision");
const visionSettingsFields = document.getElementById("vision-settings-fields");
const settingVisionBaseUrl = document.getElementById("setting-vision-base-url");
const settingVisionModel = document.getElementById("setting-vision-model");
const settingVisionApiKey = document.getElementById("setting-vision-api-key");
const testVisionBtn = document.getElementById("test-vision-btn");
const testVisionResult = document.getElementById("test-vision-result");
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

// DOM Elements - Prompt Section
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

let currentSettings = null;
let currentQueue = [];
let bannerTimeout = null;
let isPreviewCollapsed = false;

document.addEventListener("DOMContentLoaded", async () => {
  currentSettings = await getSettings();
  currentQueue = await getQueue();
  populateForm(currentSettings);
  renderPromptsUI();
  setupListeners();
});

function populateForm(settings) {
  // Provider Mode (Custom vs Gemini)
  const activeProvider = settings.llmProvider || "custom";
  switchLlmProviderTab(activeProvider, false);

  // Custom / LiteLLM Proxy Settings
  settingBaseUrl.value = settings.apiBaseUrl || "http://localhost:4000/v1";
  settingApiKey.value = settings.apiKey || "";
  settingModel.value = settings.model || "gpt-4o-mini";
  settingChunkSize.value = settings.chunkSize || 10;
  settingAutoClear.checked = settings.autoClearOnExport !== false;

  // Direct Google Gemini Multi-Key Settings
  const keysArray = Array.isArray(settings.geminiApiKeys) && settings.geminiApiKeys.length > 0
    ? settings.geminiApiKeys
    : (Array.isArray(settings.geminiKeys) ? settings.geminiKeys : []);
  if (settingGeminiKeys) {
    settingGeminiKeys.value = keysArray.join("\n");
    updateGeminiKeyValidationBadges();
  }

  const gModel = settings.geminiModel || "gemini-2.5-flash";
  if (settingGeminiModel) {
    const hasOption = Array.from(settingGeminiModel.options).some(o => o.value === gModel);
    if (hasOption) {
      settingGeminiModel.value = gModel;
      if (geminiCustomModelRow) geminiCustomModelRow.classList.add("hidden");
    } else {
      settingGeminiModel.value = "custom";
      if (geminiCustomModelRow) {
        geminiCustomModelRow.classList.remove("hidden");
        if (settingGeminiCustomModel) settingGeminiCustomModel.value = gModel;
      }
    }
  }

  const gStrategy = settings.geminiStrategy || settings.geminiRoutingStrategy || "round-robin";
  if (settingGeminiStrategy) {
    settingGeminiStrategy.value = gStrategy;
    updateGeminiStrategyDesc(gStrategy);
  }

  if (settingGeminiCooldown) {
    settingGeminiCooldown.value = typeof settings.geminiCooldownSeconds === "number" ? settings.geminiCooldownSeconds : 60;
  }
  if (settingGeminiRetries) {
    settingGeminiRetries.value = typeof settings.geminiMaxRetries === "number" ? settings.geminiMaxRetries : 3;
  }

  // Dedicated Vision / OCR settings
  const activeEngine = settings.ocrEngine || "api";
  switchOcrEngineTab(activeEngine, false);

  if (settingDedicatedVision) {
    settingDedicatedVision.checked = settings.useDedicatedVision === true;
    toggleVisionFields();
  }
  if (settingVisionBaseUrl) {
    settingVisionBaseUrl.value = settings.visionBaseUrl || "http://localhost:1234/v1";
  }
  if (settingVisionModel) {
    settingVisionModel.value = settings.visionModel || "qwen2-vl";
  }
  if (settingVisionApiKey) {
    settingVisionApiKey.value = settings.visionApiKey || "";
  }

  // Local OCR Preset
  const currentPreset = settings.localOcr?.preset || "v6-tiny";
  if (settingLocalOcrPreset) {
    settingLocalOcrPreset.value = currentPreset;
    updatePresetDisplay(currentPreset);
  }
}

function setupListeners() {
  settingsForm.addEventListener("submit", handleSaveSettings);
  toggleKeyVisibility.addEventListener("click", handleToggleKeyVisibility);
  testConnectionBtn.addEventListener("click", handleTestConnection);

  // LLM Provider Tab Switching
  if (providerTabCustom) {
    providerTabCustom.addEventListener("click", () => switchLlmProviderTab("custom"));
  }
  if (providerTabGemini) {
    providerTabGemini.addEventListener("click", () => switchLlmProviderTab("gemini"));
  }

  // Gemini Multi-Key Listeners
  if (settingGeminiKeys) {
    settingGeminiKeys.addEventListener("input", updateGeminiKeyValidationBadges);
    settingGeminiKeys.addEventListener("blur", updateGeminiKeyValidationBadges);
  }
  if (toggleGeminiKeysMask) {
    toggleGeminiKeysMask.addEventListener("click", handleToggleGeminiKeysMask);
  }
  const maskOverlay = document.getElementById("gemini-mask-overlay");
  if (maskOverlay) {
    maskOverlay.addEventListener("click", handleToggleGeminiKeysMask);
  }
  if (settingGeminiModel) {
    settingGeminiModel.addEventListener("change", handleGeminiModelChange);
  }
  if (settingGeminiStrategy) {
    settingGeminiStrategy.addEventListener("change", (e) => updateGeminiStrategyDesc(e.target.value));
  }
  if (btnTestGeminiKeys) {
    btnTestGeminiKeys.addEventListener("click", handleTestGeminiKeys);
  }

  // Vision triggers
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

  // Local OCR tabs, presets & actions
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

  // Prompt dropdown
  settingsActivePromptSelect.addEventListener("change", (e) => handlePromptSelectChange(e.target.value));

  // Prompt actions
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

  // Close modal when clicking on backdrop
  promptModal.addEventListener("click", (e) => {
    if (e.target === promptModal) {
      closeModal();
    }
  });

  // Preset chips
  document.querySelectorAll(".preset-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      settingModel.value = chip.dataset.model;
    });
  });

  // Listen to chrome storage changes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.settings) {
      currentSettings = changes.settings.newValue || currentSettings;
      populateForm(currentSettings);
      renderPromptsUI();
    }
  });
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

  // Populate select
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
      const count = promptCounts[p.id] || 0;
      opt.textContent = `${p.title} (${count})`;
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
    promptPreviewText.textContent = "No prompt templates yet.\nClick [+ New Template] above to add your custom prompt template.";
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
  showAlert(`Active prompt: "${active?.title || 'Selected'}"`, "success", 2000);
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
        <p>Click "New Template" above to write or paste your custom prompt template.</p>
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
    const snippet = p.description || p.content.replace(/\r?\n+/g, " ").trim().slice(0, 130) + "...";
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
      activeStatus.style.fontSize = "11.5px";
      activeStatus.style.color = "#34d399";
      activeStatus.textContent = "● Currently Selected";
      footerRow.appendChild(activeStatus);
    }

    const actionsDiv = document.createElement("div");
    actionsDiv.className = "modal-card-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn-card-action";
    editBtn.title = "Edit template";
    editBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> <span>Edit</span>`;
    editBtn.addEventListener("click", () => openModal("edit", p));
    actionsDiv.appendChild(editBtn);

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn-card-action";
    copyBtn.title = "Duplicate template";
    copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> <span>Copy</span>`;
    copyBtn.addEventListener("click", () => handleDuplicatePrompt(p.id));
    actionsDiv.appendChild(copyBtn);

    const delBtn = document.createElement("button");
    delBtn.className = "btn-card-action danger";
    delBtn.title = "Delete template";
    delBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> <span>Delete</span>`;
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

async function handleSaveSettings(e) {
  e.preventDefault();

  const chunkSize = parseInt(settingChunkSize.value, 10);
  if (isNaN(chunkSize) || chunkSize < 1 || chunkSize > 50) {
    showAlert("Chunk size must be between 1 and 50.", "error");
    return;
  }

  // LLM Provider mode (Custom vs Gemini)
  const isGemini = providerTabGemini?.classList.contains("active");
  currentSettings.llmProvider = isGemini ? "gemini" : "custom";

  // Custom / LiteLLM Proxy settings
  currentSettings.apiBaseUrl = settingBaseUrl.value.trim();
  currentSettings.apiKey = settingApiKey.value.trim();
  currentSettings.model = settingModel.value.trim() || "gpt-4o-mini";
  currentSettings.chunkSize = chunkSize;
  currentSettings.autoClearOnExport = settingAutoClear.checked;

  // Direct Google Gemini Multi-Key settings
  const rawGeminiKeys = settingGeminiKeys?.value || "";
  const parsedGeminiKeys = parseGeminiKeys(rawGeminiKeys);
  currentSettings.geminiApiKeys = parsedGeminiKeys;
  currentSettings.geminiKeys = parsedGeminiKeys;

  let selectedGeminiModel = settingGeminiModel?.value || "gemini-2.5-flash";
  if (selectedGeminiModel === "custom" && settingGeminiCustomModel?.value.trim()) {
    selectedGeminiModel = settingGeminiCustomModel.value.trim();
  }
  currentSettings.geminiModel = selectedGeminiModel;
  currentSettings.geminiStrategy = settingGeminiStrategy?.value || "round-robin";
  currentSettings.geminiRoutingStrategy = currentSettings.geminiStrategy;

  const cd = parseInt(settingGeminiCooldown?.value, 10);
  currentSettings.geminiCooldownSeconds = (!isNaN(cd) && cd >= 5) ? cd : 60;

  const retries = parseInt(settingGeminiRetries?.value, 10);
  currentSettings.geminiMaxRetries = (!isNaN(retries) && retries >= 0) ? retries : 3;

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
  showAlert("Settings saved successfully!", "success");
}

function switchLlmProviderTab(provider, updateState = true) {
  if (updateState && currentSettings) {
    currentSettings.llmProvider = provider;
  }

  if (provider === "gemini") {
    providerTabGemini?.classList.add("active");
    providerTabCustom?.classList.remove("active");
    providerTabGemini?.setAttribute("aria-selected", "true");
    providerTabCustom?.setAttribute("aria-selected", "false");
    providerPanelGemini?.classList.remove("hidden");
    providerPanelCustom?.classList.add("hidden");
  } else {
    providerTabCustom?.classList.add("active");
    providerTabGemini?.classList.remove("active");
    providerTabCustom?.setAttribute("aria-selected", "true");
    providerTabGemini?.setAttribute("aria-selected", "false");
    providerPanelCustom?.classList.remove("hidden");
    providerPanelGemini?.classList.add("hidden");
  }
}

function updateGeminiKeyValidationBadges() {
  if (!settingGeminiKeys || !keyCountTotal) return;
  const raw = settingGeminiKeys.value || "";
  const keys = parseGeminiKeys(raw);
  const total = keys.length;

  const validKeys = keys.filter(k => /^AIza[0-9A-Za-z\-_]{35}$/.test(k));
  const invalidCount = total - validKeys.length;

  keyCountTotal.textContent = `${total} key${total === 1 ? "" : "s"}`;
  if (total === 0) {
    keyCountValid?.classList.add("hidden");
    keyCountInvalid?.classList.add("hidden");
  } else {
    if (keyCountValid) {
      keyCountValid.textContent = `${validKeys.length} valid`;
      keyCountValid.classList.remove("hidden");
    }
    if (keyCountInvalid) {
      if (invalidCount > 0) {
        keyCountInvalid.textContent = `${invalidCount} invalid`;
        keyCountInvalid.classList.remove("hidden");
      } else {
        keyCountInvalid.classList.add("hidden");
      }
    }
  }
}

function handleToggleGeminiKeysMask() {
  const wrapper = document.getElementById("gemini-keys-wrapper") || settingGeminiKeys?.closest(".textarea-wrapper");
  const overlay = document.getElementById("gemini-mask-overlay");
  const maskIcon = document.getElementById("mask-icon");
  const maskText = document.getElementById("mask-text");
  if (!wrapper) return;

  wrapper.classList.toggle("masked");
  const isMasked = wrapper.classList.contains("masked");

  if (overlay) {
    if (isMasked) {
      overlay.classList.remove("hidden");
    } else {
      overlay.classList.add("hidden");
    }
  }

  if (maskIcon) maskIcon.textContent = isMasked ? "🙈" : "👁️";
  if (maskText) maskText.textContent = isMasked ? "Show Keys" : "Hide Keys";
  if (toggleGeminiKeysMask) {
    toggleGeminiKeysMask.setAttribute("aria-label", isMasked ? "Show Gemini Keys" : "Hide Gemini Keys");
  }
}

function handleGeminiModelChange() {
  if (settingGeminiModel?.value === "custom") {
    geminiCustomModelRow?.classList.remove("hidden");
    settingGeminiCustomModel?.focus();
  } else {
    geminiCustomModelRow?.classList.add("hidden");
  }
}

function updateGeminiStrategyDesc(val) {
  if (!geminiRoutingDesc) return;
  if (val === "round-robin") {
    geminiRoutingDesc.textContent = "Evenly spreads generation requests across all configured API keys to maximize aggregate quota.";
  } else if (val === "least-busy") {
    geminiRoutingDesc.textContent = "Directs each chunk to whichever key currently has the fewest in-flight requests or lowest load.";
  } else if (val === "rate-limit-fallback") {
    geminiRoutingDesc.textContent = "Primary key receives all traffic until hitting 429 quota exhaustion, then fails over to standby keys.";
  }
}

async function handleTestGeminiKeys() {
  if (!btnTestGeminiKeys) return;
  const rawKeys = settingGeminiKeys?.value || "";
  const keys = parseGeminiKeys(rawKeys);

  if (keys.length === 0) {
    showAlert("Please enter at least one Google Gemini API key to test.", "error", 4000);
    return;
  }

  let testModel = settingGeminiModel?.value || "gemini-2.5-flash";
  if (testModel === "custom" && settingGeminiCustomModel?.value.trim()) {
    testModel = settingGeminiCustomModel.value.trim();
  }

  btnTestGeminiKeys.disabled = true;
  if (geminiTestSummary) {
    geminiTestSummary.className = "test-summary-text";
    geminiTestSummary.textContent = `Testing ${keys.length} key${keys.length === 1 ? "" : "s"}...`;
    geminiTestSummary.classList.remove("hidden");
  }

  if (geminiKeysResultsContainer) {
    geminiKeysResultsContainer.innerHTML = `<div style="color: #94a3b8; font-size: 12px; padding: 4px;">Sending test pings to generativelanguage.googleapis.com...</div>`;
    geminiKeysResultsContainer.classList.remove("hidden");
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: "TEST_GEMINI_KEYS",
      keys,
      model: testModel,
      cooldownSeconds: parseInt(settingGeminiCooldown?.value, 10) || 60,
      maxRetries: parseInt(settingGeminiRetries?.value, 10) || 3,
      strategy: settingGeminiStrategy?.value || "round-robin"
    });

    if (!response || !response.success) {
      throw new Error(response?.error || "Key testing failed");
    }

    const { total, healthy, status, results } = response;

    if (geminiTestSummary) {
      geminiTestSummary.className = `test-summary-text ${status}`;
      geminiTestSummary.textContent = `Pool Status: ${healthy} of ${total} keys healthy (${status.toUpperCase()})`;
    }

    if (geminiKeysResultsContainer && Array.isArray(results)) {
      geminiKeysResultsContainer.innerHTML = "";
      results.forEach((res, index) => {
        const card = document.createElement("div");
        const cardStatus = res.healthy ? "healthy" : (res.error && res.error.includes("429") ? "degraded" : "failed");
        card.className = `key-health-card ${cardStatus}`;

        const badgeText = res.healthy
          ? `Healthy (${res.latencyMs}ms)`
          : (res.error && res.error.includes("429") ? "Rate-Limited (429)" : "Invalid / Error");

        const badgeClass = res.healthy ? "success" : (res.error && res.error.includes("429") ? "warning" : "error");

        card.innerHTML = `
          <div class="key-card-left">
            <span class="key-dot ${cardStatus}"></span>
            <span class="key-masked-name">${res.keyMask || maskApiKey(keys[index] || "")}</span>
            <span class="key-index-pill">Key #${index + 1}</span>
          </div>
          <div class="key-card-right">
            <span class="badge-tag ${badgeClass}" title="${res.error ? res.error.replace(/"/g, '&quot;') : 'Operational'}">${badgeText}</span>
          </div>
        `;
        geminiKeysResultsContainer.appendChild(card);
      });
    }
  } catch (err) {
    if (geminiTestSummary) {
      geminiTestSummary.className = "test-summary-text failed";
      geminiTestSummary.textContent = `Test failed: ${err.message}`;
    }
    if (geminiKeysResultsContainer) {
      geminiKeysResultsContainer.innerHTML = `<div style="color: #ef4444; font-size: 12px; padding: 4px;">Error: ${err.message}</div>`;
    }
  } finally {
    btnTestGeminiKeys.disabled = false;
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
  testVisionResult.className = "test-result";
  testVisionResult.textContent = "Testing Vision connection...";
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
    const res = await testVisionConnection(testConfig);
    testVisionResult.className = "test-result success";
    testVisionResult.textContent = `✓ Connected to Vision API! Response: "${res.slice(0, 40)}..."`;
  } catch (err) {
    testVisionResult.className = "test-result error";
    testVisionResult.textContent = `✗ Vision connection failed: ${err.message}`;
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
    localOcrModelInfo.textContent = `~${mb} MB total (${preset.badge})`;
  }
  if (localOcrPresetDesc) {
    localOcrPresetDesc.textContent = preset.description;
  }
  if (downloadBtnText && !downloadLocalOcrBtn?.disabled) {
    const mb = (preset.estimatedBytes / (1024 * 1024)).toFixed(0);
    downloadBtnText.textContent = `Download Model (~${mb} MB)`;
  }
}

function handlePresetChange(e) {
  const presetId = e.target.value;
  const preset = LOCAL_OCR_PRESETS[presetId] || LOCAL_OCR_PRESETS["v6-tiny"];
  if (currentSettings) {
    currentSettings.localOcr = {
      preset: presetId,
      detUrl: preset.detUrl,
      recUrl: preset.recUrl,
      dictUrl: ""
    };
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
  const activePresetId = settingLocalOcrPreset?.value || "v6-tiny";
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
      showAlert(`${preset.name} downloaded and cached successfully!`, "success", 3000);
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
  testLocalOcrResult.className = "test-result";
  testLocalOcrResult.textContent = "Running test on sample image...";
  testLocalOcrResult.classList.remove("hidden");
  testLocalOcrBtn.disabled = true;

  const activePresetId = settingLocalOcrPreset?.value || "v6-tiny";
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
    testLocalOcrResult.className = "test-result success";
    testLocalOcrResult.textContent = `✓ PP-OCRv6 OK! Read: "${res?.text}" (${elapsed}ms)`;
  } catch (err) {
    testLocalOcrResult.className = "test-result error";
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

function showAlert(message, type = "success", duration = 3500) {
  if (bannerTimeout) clearTimeout(bannerTimeout);

  alertBanner.textContent = message;
  alertBanner.className = `alert-banner ${type}`;
  alertBanner.classList.remove("hidden");

  bannerTimeout = setTimeout(() => {
    alertBanner.classList.add("hidden");
  }, duration);
}
