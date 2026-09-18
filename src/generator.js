import { ANKI_HEADER_LINES, extractAnkiHeaderLines, normalizeHeaderLines } from "./defaults.js";

/**
 * Split an array of items into chunks of a specified size.
 * e.g. 59 words with chunkSize 10 -> [10, 10, 10, 10, 10, 9]
 */
export function chunkArray(array, chunkSize) {
  const size = Math.max(1, parseInt(chunkSize, 10) || 10);
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Format the prompt for a given chunk of words, including context if provided.
 */
export function formatPromptForWords(template, words) {
  if (!template || !template.trim()) {
    throw new Error("Prompt template is empty. Please open Settings and paste your prompt first.");
  }
  const baseTemplate = template.trim();
  const wordListText = words
    .map((item, idx) => {
      const wordText = typeof item === "string" ? item : item?.word || "";
      const contextText = typeof item === "object" && item?.context ? item.context.trim() : "";
      if (contextText) {
        return `${idx + 1}. ${wordText} (Context: "${contextText}")`;
      }
      return `${idx + 1}. ${wordText}`;
    })
    .join("\n");

  if (baseTemplate.includes("{LIST}")) {
    return baseTemplate.replace("{LIST}", wordListText);
  } else if (baseTemplate.includes("{WORDS_LIST}")) {
    return baseTemplate.replace("{WORDS_LIST}", wordListText);
  } else {
    return `${baseTemplate}\n\nHere is the list of words:\n${wordListText}`;
  }
}

/**
 * Extract and sanitize TSV rows from raw LLM output.
 * Strips markdown code blocks and filters out duplicate header lines.
 */
export function parseTsvRows(rawText) {
  if (!rawText) return [];

  // Remove markdown code fences ```tsv ... ``` or ``` ... ```
  let text = rawText
    .replace(/^```[a-zA-Z]*\r?\n/gm, "")
    .replace(/```\s*$/gm, "")
    .trim();

  const lines = text.split(/\r?\n/);
  const validRows = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip Anki header lines if the LLM output them in this chunk
    if (
      trimmed.startsWith("#separator:") ||
      trimmed.startsWith("#html:") ||
      trimmed.startsWith("#columns:")
    ) {
      continue;
    }

    // A valid TSV row must contain tab characters
    if (line.includes("\t")) {
      validRows.push(trimmed);
    }
  }

  return validRows;
}

/**
 * Call OpenAI / LiteLLM chat completions endpoint.
 */
export async function callLlmChat({ baseUrl, apiKey, model, prompt, signal }) {
  const cleanBase = (baseUrl || "http://localhost:4000/v1").replace(/\/+$/, "");
  const url = `${cleanBase}/chat/completions`;

  const headers = {
    "Content-Type": "application/json"
  };
  if (apiKey && apiKey.trim()) {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }

  const isGemini3Plus = /gemini-3/i.test(model || "");

  const payload = {
    model: model || "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: prompt
      }
    ]
  };

  // Google Gemini 3+ deprecates temperature, top_p, and top_k. Only include for other models.
  if (!isGemini3Plus) {
    payload.temperature = 0.3;
  }

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal
    });
  } catch (fetchErr) {
    if (fetchErr.name === "AbortError") {
      throw fetchErr;
    }
    throw new Error(
      `Could not connect to API at ${url}. Ensure your LiteLLM proxy or API server is running. (${fetchErr.message})`
    );
  }

  if (!response.ok) {
    let errorDetail = "";
    try {
      const errJson = await response.json();
      errorDetail = errJson.error?.message || JSON.stringify(errJson);
    } catch {
      errorDetail = await response.text();
    }
    throw new Error(`API Error (${response.status} ${response.statusText}): ${errorDetail}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("API returned an empty response or unexpected format.");
  }

  return content;
}

/**
 * Test connectivity to the configured API endpoint.
 */
export async function testApiConnection(settings) {
  return await callLlmChat({
    baseUrl: settings.apiBaseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    prompt: "Reply with the word 'OK' if you can read this."
  });
}

/**
 * Call OpenAI / LM Studio / Ollama / LiteLLM vision endpoint to transcribe text from an image.
 */
export async function transcribeImageContext({
  baseUrl,
  apiKey,
  model,
  imageBase64,
  signal
}) {
  const cleanBase = (baseUrl || "http://localhost:1234/v1").replace(/\/+$/, "");
  const url = `${cleanBase}/chat/completions`;

  const headers = {
    "Content-Type": "application/json"
  };
  if (apiKey && apiKey.trim()) {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }

  const imageUrl = imageBase64.startsWith("data:")
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  const payload = {
    model: model || "qwen2-vl",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Please transcribe the English sentence, subtitle, or phrase visible in this image snippet. Return ONLY the extracted text/sentence without quotes, preamble, or commentary."
          },
          {
            type: "image_url",
            image_url: {
              url: imageUrl
            }
          }
        ]
      }
    ],
    temperature: 0.1,
    max_tokens: 300
  };

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal
    });
  } catch (fetchErr) {
    if (fetchErr.name === "AbortError") throw fetchErr;
    throw new Error(`Could not connect to Vision model at ${url}. (${fetchErr.message})`);
  }

  if (!response.ok) {
    let errorDetail = "";
    try {
      const errJson = await response.json();
      errorDetail = errJson.error?.message || JSON.stringify(errJson);
    } catch {
      errorDetail = await response.text();
    }
    throw new Error(`Vision API Error (${response.status} ${response.statusText}): ${errorDetail}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Vision API returned an empty transcription.");
  }

  return content.trim().replace(/^["'“”]+|["'“”]+$/g, "");
}

/**
 * Test connectivity to the configured Vision API endpoint.
 */
export async function testVisionConnection(settings) {
  const baseUrl = settings.useDedicatedVision && settings.visionBaseUrl ? settings.visionBaseUrl : settings.apiBaseUrl;
  const apiKey = settings.useDedicatedVision ? settings.visionApiKey : settings.apiKey;
  const model = settings.useDedicatedVision && settings.visionModel ? settings.visionModel : settings.model;

  return await callLlmChat({
    baseUrl,
    apiKey,
    model,
    prompt: "Reply with 'Vision OK' if you can read this."
  });
}

/**
 * Uses the configured LLM to inspect prompt instructions and generate the exact Anki TSV headers.
 */
export async function generateAnkiHeaderWithLlm({ promptContent, settings, signal }) {
  if (!promptContent || !promptContent.trim()) {
    throw new Error("Prompt content is empty. Please enter your prompt instructions first.");
  }

  // Quick check: If the prompt content already has a clear #columns: line, we can parse it directly
  const lines = promptContent.split(/\r?\n/).map(l => l.trim());
  const existingColLine = lines.find(l => l.startsWith("#columns:"));

  const metaPrompt = `You are an expert Anki flashcard configuration assistant.
Your task is to analyze the vocabulary/flashcard prompt template below and determine the exact TSV column headers for Anki import.

Prompt Template:
"""
${promptContent.trim()}
"""

INSTRUCTIONS:
1. Carefully identify all table columns or flashcard fields specified in the prompt template in their exact requested order.
2. Format the response strictly as the standard 3-line Anki TSV header:
Line 1: #separator:tab
Line 2: #html:true
Line 3: #columns:<Field1>\\t<Field2>\\t<Field3>...

CRITICAL RULES:
- Line 3 must start with "#columns:" followed immediately by the column names separated by TAB characters.
- Do NOT output markdown code blocks (no \`\`\` or \`\`\`tsv).
- Do NOT output any intro, outro, explanations, or notes.
- Output ONLY the exact 3 lines.`;

  const rawOutput = await callLlmChat({
    baseUrl: settings.apiBaseUrl,
    apiKey: settings.apiKey,
    model: settings.model,
    prompt: metaPrompt,
    signal
  });

  const parsedLines = (rawOutput || "")
    .replace(/^```[a-zA-Z]*\r?\n/gm, "")
    .replace(/```\s*$/gm, "")
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const colLine = parsedLines.find(l => l.startsWith("#columns:"));
  if (!colLine) {
    if (existingColLine) {
      return normalizeHeaderLines(["#separator:tab", "#html:true", existingColLine]).join("\n");
    }
    throw new Error("The AI response did not contain a valid #columns: header line. Please check your prompt instructions.");
  }

  return normalizeHeaderLines(parsedLines).join("\n");
}

/**
 * Generate Anki flashcards for all queued words in chunks,
 * streaming progress callbacks, and consolidating into a single TSV string.
 */
export async function generateAnkiDeck({
  words,
  settings,
  onProgress,
  signal
}) {
  if (!words || words.length === 0) {
    throw new Error("No words in queue to process.");
  }

  if (!settings?.promptTemplate || !settings.promptTemplate.trim()) {
    throw new Error("Prompt template is empty! Please go to Settings and paste your prompt first.");
  }

  const chunks = chunkArray(words, settings.chunkSize || 10);
  const totalChunks = chunks.length;
  const allRows = [];
  const errors = [];

  for (let i = 0; i < totalChunks; i++) {
    if (signal?.aborted) {
      throw new DOMException("Generation cancelled by user", "AbortError");
    }

    const chunkWords = chunks[i];
    const chunkNum = i + 1;

    if (onProgress) {
      onProgress({
        status: "processing",
        currentChunk: chunkNum,
        totalChunks,
        chunkWords,
        completedWords: allRows.length,
        totalWords: words.length
      });
    }

    try {
      const prompt = formatPromptForWords(settings.promptTemplate, chunkWords);
      const rawOutput = await callLlmChat({
        baseUrl: settings.apiBaseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
        prompt,
        signal
      });

      const parsedRows = parseTsvRows(rawOutput);
      if (parsedRows.length === 0) {
        errors.push(`Chunk ${chunkNum}: No valid TSV rows parsed from model response.`);
      } else {
        allRows.push(...parsedRows);
      }
    } catch (err) {
      if (err.name === "AbortError") throw err;
      errors.push(`Chunk ${chunkNum} failed: ${err.message}`);
    }

    if (onProgress) {
      onProgress({
        status: "chunk_finished",
        currentChunk: chunkNum,
        totalChunks,
        completedWords: allRows.length,
        totalWords: words.length
      });
    }
  }

  if (allRows.length === 0 && errors.length > 0) {
    throw new Error(`Failed to generate flashcards:\n${errors.join("\n")}`);
  }

  // Resolve headers dynamically from active prompt
  const activePrompt = (Array.isArray(settings?.prompts) ? settings.prompts.find(p => p.id === settings.activePromptId) : null) || null;
  const headerLines = extractAnkiHeaderLines(activePrompt, settings?.promptTemplate);

  // Combine into single consolidated TSV file with UTF-8 BOM
  const consolidatedTsv = [...headerLines, ...allRows].join("\n");

  return {
    tsvContent: consolidatedTsv,
    rowCount: allRows.length,
    errors
  };
}

/**
 * Triggers browser download of the consolidated Anki TSV file.
 */
export async function triggerTsvDownload(tsvContent, filename) {
  // \uFEFF is UTF-8 BOM, ensuring Windows Anki/Excel properly decodes Persian characters
  const blob = new Blob(["\uFEFF" + tsvContent], {
    type: "text/plain;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);

  let finalName = filename || `lanki_anki_deck_${getTimestampString()}.txt`;
  if (!finalName.toLowerCase().endsWith(".txt")) {
    finalName = finalName.replace(/\.[^/.]+$/, "") + ".txt";
  }

  try {
    if (chrome.downloads?.download) {
      await chrome.downloads.download({
        url,
        filename: finalName,
        saveAs: false
      });
    } else {
      // Fallback standard HTML5 anchor download
      const a = document.createElement("a");
      a.href = url;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
}

export function getTimestampString() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}
