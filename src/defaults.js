/**
 * Shared constants and default configuration for Lanki.
 */

export const ANKI_HEADER_LINES = [
  "#separator:tab",
  "#html:true",
  "#columns:Word\tPhonetic\tAudio\tPart of Speech\tDefinition\tSynonyms\tAntonyms\tCollocations\tWord Family\tExamples\tPersian Meaning\tPersian Example Translations"
];

/**
 * Ensures header lines contain #separator:tab, #html:true, and #columns:...
 */
export function normalizeHeaderLines(lines) {
  if (!Array.isArray(lines)) return [...ANKI_HEADER_LINES];
  let separatorLine = "#separator:tab";
  let htmlLine = "#html:true";
  let columnsLine = "";

  for (const raw of lines) {
    const line = (raw || "").trim();
    if (line.startsWith("#separator:")) separatorLine = line;
    else if (line.startsWith("#html:")) htmlLine = line;
    else if (line.startsWith("#columns:")) columnsLine = line;
  }

  if (!columnsLine) {
    columnsLine = ANKI_HEADER_LINES[2];
  }
  return [separatorLine, htmlLine, columnsLine];
}

/**
 * Resolves the 3 Anki header lines (#separator:tab, #html:true, #columns:...)
 * based on prompt template settings, embedded in-prompt text, or falling back to defaults.
 */
export function extractAnkiHeaderLines(promptObj, promptContent) {
  // 1. Explicit headers configured on the prompt object
  if (promptObj?.headers && typeof promptObj.headers === "string" && promptObj.headers.trim()) {
    const lines = promptObj.headers
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);
    if (lines.some(l => l.startsWith("#columns:"))) {
      return normalizeHeaderLines(lines);
    }
  }

  // 2. Embedded in promptContent
  const textToScan = promptContent || promptObj?.content || "";
  if (textToScan && typeof textToScan === "string") {
    const lines = textToScan.split(/\r?\n/).map(l => l.trim());
    const colLine = lines.find(l => l.startsWith("#columns:"));
    if (colLine) {
      return normalizeHeaderLines([
        "#separator:tab",
        "#html:true",
        colLine
      ]);
    }
  }

  // 3. Fallback to default 12-field vocabulary headers
  return [...ANKI_HEADER_LINES];
}

/**
 * Extracts array of column names from header lines or string.
 */
export function getColumnNamesFromHeader(headers) {
  let text = "";
  if (Array.isArray(headers)) {
    text = headers.find(l => (l || "").trim().startsWith("#columns:")) || "";
  } else if (typeof headers === "string") {
    const lines = headers.split(/\r?\n/);
    text = lines.find(l => l.trim().startsWith("#columns:")) || "";
  }
  if (!text.trim().startsWith("#columns:")) return [];
  const rawCols = text.trim().substring("#columns:".length);
  return rawCols.split("\t").map(c => c.trim()).filter(Boolean);
}

// Sample prompt kept as an optional reference / helper button
export const SAMPLE_IELTS_PROMPT = `Act as an expert English lexicographer and IELTS vocabulary instructor specializing in CEFR leveling (targeting B2 proficiency).

I will provide a list of English words. For each word, generate a complete entry matching my exact 12-field Anki structure.

CRITICAL LEVEL & CONTENT RULES:
1. Definition: Provide a clear, natural English definition suitable for a B1–B2 learner (avoid overly archaic or obscure vocabulary).
2. Examples (Crucial):
   - Example 1 must be at CEFR B1 level: Simple, clear, everyday or straightforward academic context using accessible grammar.
   - Example 2 must be at CEFR B2 level: More sophisticated sentence structure, typical of IELTS General/Academic reading/writing contexts, showing natural collocation usage.
   - Format: "1. [B1] <sentence><br>2. [B2] <sentence>"
3. Collocations: Provide 3-4 high-utility academic/natural collocations separated by " | ".
4. Word Family: List the most common derivatives (noun, verb, adj, adv) separated by " | ".
5. Persian Meaning: Accurate, natural Persian equivalents (separated by comma/ویرگول).
6. Persian Translations: Accurate Persian translations of both examples: "۱. [B1] <ترجمه><br>۲. [B2] <ترجمه>".
7. Audio: Leave this column completely empty (just the tab space) as it will be populated locally via TTS.
8. Word Casing (Crucial for Spelling): Always output the word itself in strictly LOWERCASE characters (e.g., "inevitable", "justify") unless it is a proper noun (e.g., countries, nationalities) that inherently requires capitalization.
9. Context Disambiguation (Crucial): If a word includes a '(Context: "...")' note, you MUST choose the specific definition, sense, part of speech, Persian translation, and example nuances that match that exact context rather than an unrelated meaning.

STRICT OUTPUT FORMAT RULES:
- Output MUST be a single raw code block formatted as TSV (Tab-Separated Values).
- Always include these exact 3 header lines at the very top:
#separator:tab
#html:true
#columns:Word\tPhonetic\tAudio\tPart of Speech\tDefinition\tSynonyms\tAntonyms\tCollocations\tWord Family\tExamples\tPersian Meaning\tPersian Example Translations

- Separate each field using a single TAB character. Do NOT use tabs inside field values.
- Do NOT insert actual line breaks within a row; use "<br>" for line breaks.
- Do not write any conversational intro or outro. Output only the TSV code block.

Here is the list of words:
{LIST}`;

// By default, no built-in prompts are pre-loaded as requested; users create their own custom templates
export const DEFAULT_PROMPTS = [];

export const LOCAL_OCR_PRESETS = {
  "v6-tiny": {
    id: "v6-tiny",
    name: "PP-OCRv6 Tiny (Recommended, ~6 MB)",
    badge: "Ultra-Fast",
    description: "Extremely fast & lightweight (1.7 MB Det + 4.3 MB Rec). Ideal for everyday word clipping on any CPU.",
    detUrl: "https://huggingface.co/PaddlePaddle/PP-OCRv6_tiny_det_onnx/resolve/main/inference.onnx",
    recUrl: "https://huggingface.co/PaddlePaddle/PP-OCRv6_tiny_rec_onnx/resolve/main/inference.onnx",
    estimatedBytes: 6243229,
    detSize: 1780590,
    recSize: 4462639
  },
  "v6-small": {
    id: "v6-small",
    name: "PP-OCRv6 Small (High Accuracy, ~30 MB)",
    badge: "High Precision",
    description: "Superior accuracy (9.4 MB Det + 20.2 MB Rec). 93.3% accuracy on printed text, beats v5 server models.",
    detUrl: "https://huggingface.co/PaddlePaddle/PP-OCRv6_small_det_onnx/resolve/main/inference.onnx",
    recUrl: "https://huggingface.co/PaddlePaddle/PP-OCRv6_small_rec_onnx/resolve/main/inference.onnx",
    estimatedBytes: 31037850,
    detSize: 9877800,
    recSize: 21160050
  }
};

export const DEFAULT_SETTINGS = {
  apiBaseUrl: "http://localhost:4000/v1",
  apiKey: "",
  model: "gpt-4o-mini",
  chunkSize: 10,
  autoClearOnExport: true,
  // Dedicated Vision / OCR settings (LM Studio, Ollama, LiteLLM, or inherit main)
  ocrEngine: "api", // "api" | "local"
  useDedicatedVision: false,
  visionBaseUrl: "http://localhost:1234/v1",
  visionApiKey: "",
  visionModel: "qwen2-vl",
  // Local Offline OCR Engine (PP-OCRv6 ONNX) configuration
  localOcr: {
    preset: "v6-tiny",
    detUrl: LOCAL_OCR_PRESETS["v6-tiny"].detUrl,
    recUrl: LOCAL_OCR_PRESETS["v6-tiny"].recUrl,
    dictUrl: "" // Loaded directly from bundled offscreen/dict.txt
  },
  prompts: [],
  activePromptId: "",
  promptTemplate: ""
};

/**
 * Normalizes a word string (trimming whitespace, punctuation edges, lowering case).
 */
export function normalizeWord(rawWord) {
  if (!rawWord || typeof rawWord !== "string") return "";
  let cleaned = rawWord.trim();
  cleaned = cleaned.replace(/^["'“”‘’«»()\[\]{}]+|["'“”‘’«»()\[\]{}]+$/g, "").trim();
  if (!/^[A-Z]{2,6}$/.test(cleaned)) {
    cleaned = cleaned.toLowerCase();
  }
  return cleaned;
}

/**
 * Normalizes a queue item, converting legacy string entries or raw objects
 * into a standardized { id, word, context, promptId, timestamp } structure.
 */
export function normalizeQueueItem(rawItem, defaultPromptId = "") {
  if (!rawItem) return null;
  if (typeof rawItem === "string") {
    const w = normalizeWord(rawItem);
    if (!w) return null;
    return {
      id: "w_" + Math.random().toString(36).slice(2, 9),
      word: w,
      context: "",
      promptId: defaultPromptId || "",
      timestamp: Date.now()
    };
  }
  if (typeof rawItem === "object") {
    const w = normalizeWord(rawItem.word);
    if (!w) return null;
    return {
      id: rawItem.id || ("w_" + Math.random().toString(36).slice(2, 9)),
      word: w,
      context: (rawItem.context || "").trim(),
      promptId: rawItem.promptId || defaultPromptId || "",
      timestamp: rawItem.timestamp || Date.now()
    };
  }
  return null;
}

/**
 * Filter queue items for a specific prompt template ID.
 */
export function getItemsForPrompt(queue, promptId) {
  if (!Array.isArray(queue)) return [];
  if (!promptId) return queue;
  return queue.filter(item => item.promptId === promptId || !item.promptId);
}

/**
 * Calculate count of words per prompt template ID.
 */
export function getPromptCounts(queue) {
  const counts = {};
  if (!Array.isArray(queue)) return counts;
  for (const item of queue) {
    const pId = item?.promptId || "default";
    counts[pId] = (counts[pId] || 0) + 1;
  }
  return counts;
}

/**
 * Returns the currently active prompt template object from settings, or null if none.
 */
export function getActivePrompt(settings) {
  if (!settings || !Array.isArray(settings.prompts) || settings.prompts.length === 0) {
    return null;
  }
  return settings.prompts.find(p => p.id === settings.activePromptId) || settings.prompts[0] || null;
}

/**
 * Retrieve user settings merged with defaults and perform legacy migration.
 */
export async function getSettings() {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return { ...DEFAULT_SETTINGS };
  }
  const result = await chrome.storage.local.get("settings");
  const raw = result.settings || {};

  let prompts = Array.isArray(raw.prompts) ? [...raw.prompts] : null;
  let activePromptId = raw.activePromptId || "";

  // Migration from legacy v1.0.0 settings
  if (!prompts) {
    prompts = [];
    if (raw.promptTemplate && raw.promptTemplate.trim() && raw.promptTemplate.trim() !== SAMPLE_IELTS_PROMPT.trim()) {
      const customId = "prompt-migrated-" + Date.now();
      prompts.push({
        id: customId,
        title: "Custom Migrated Prompt",
        description: "Migrated from previous version",
        content: raw.promptTemplate.trim(),
        isBuiltIn: false,
        createdAt: Date.now()
      });
      activePromptId = customId;
    }
  }

  // Ensure every prompt has a headers field
  prompts = prompts.map(p => {
    if (!p.headers || typeof p.headers !== "string" || !p.headers.trim()) {
      return {
        ...p,
        headers: extractAnkiHeaderLines(p).join("\n")
      };
    }
    return p;
  });

  // Ensure activePromptId exists in prompts
  let activePrompt = prompts.find(p => p.id === activePromptId);
  if (!activePrompt && prompts.length > 0) {
    activePrompt = prompts[0];
    activePromptId = activePrompt.id;
  } else if (prompts.length === 0) {
    activePrompt = null;
    activePromptId = "";
  }

  const promptTemplate = activePrompt ? activePrompt.content : "";

  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    prompts,
    activePromptId,
    promptTemplate
  };
}

/**
 * Save user settings to chrome.storage.local.
 */
export async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
}

/**
 * Retrieve the current list of queued words (normalized).
 */
export async function getQueue(defaultPromptId = "") {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return [];
  const result = await chrome.storage.local.get(["wordsQueue", "settings"]);
  const raw = Array.isArray(result.wordsQueue) ? result.wordsQueue : [];
  const activePromptId = defaultPromptId || result.settings?.activePromptId || "";
  return raw.map(item => normalizeQueueItem(item, activePromptId)).filter(Boolean);
}

/**
 * Save updated list of queued words (normalized).
 */
export async function saveQueue(items, badgeCount = null) {
  const normalized = (Array.isArray(items) ? items : []).map(item => normalizeQueueItem(item)).filter(Boolean);
  await chrome.storage.local.set({ wordsQueue: normalized });
  const count = typeof badgeCount === "number" ? badgeCount : normalized.length;
  await updateBadge(count);
}

/**
 * Update the extension icon badge counter and style.
 */
export async function updateBadge(count) {
  try {
    const text = count > 0 ? String(count) : "";
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: "#4F46E5" });
  } catch (err) {
    console.error("Failed to update badge:", err);
  }
}
