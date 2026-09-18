import {
  getSettings,
  saveSettings,
  getQueue,
  saveQueue,
  updateBadge,
  getActivePrompt,
  normalizeWord,
  normalizeQueueItem
} from "../src/defaults.js";

import { transcribeImageContext } from "../src/generator.js";

const CONTEXT_MENU_SELECTION_ID = "lanki-add-word";
const CONTEXT_MENU_SNIP_ID = "lanki-snip-screen";

// Setup context menus and default state on install
chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.removeAll(() => {
    // 1. Right click on selected text: add with auto sentence extraction
    chrome.contextMenus.create({
      id: CONTEXT_MENU_SELECTION_ID,
      title: 'Add "%s" to Lanki Queue',
      contexts: ["selection"]
    });

    // 2. Right click on page/media: trigger visual screen snip
    chrome.contextMenus.create({
      id: CONTEXT_MENU_SNIP_ID,
      title: "📷 Snip Screen Context (Lanki)",
      contexts: ["page", "video", "image"]
    });
  });

  // Ensure default settings exist
  const currentSettings = await getSettings();
  await saveSettings(currentSettings);

  // Sync badge with existing queue
  const queue = await getQueue();
  await updateBadge(queue.length);
});

// Update badge when storage changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.wordsQueue) {
    const newQueue = changes.wordsQueue.newValue || [];
    updateBadge(newQueue.length);
  }
});

// Handle keyboard command shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "capture-screen-context") {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && isTabInjectable(tab.url)) {
      triggerSnipperOnTab(tab.id);
    }
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_SNIP_ID) {
    if (tab?.id && isTabInjectable(tab.url)) {
      triggerSnipperOnTab(tab.id);
    }
    return;
  }

  if (info.menuItemId !== CONTEXT_MENU_SELECTION_ID) return;

  const rawSelection = info.selectionText || "";
  let word = normalizeWord(rawSelection);
  let contextSentence = "";

  // Attempt DOM-level enclosing sentence extraction from the active tab
  if (tab?.id && isTabInjectable(tab.url)) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractWordAndSentence
      });

      if (results && results[0]?.result) {
        const res = results[0].result;
        if (res.word) word = normalizeWord(res.word);
        if (res.sentence) contextSentence = res.sentence.trim();
      }
    } catch (err) {
      console.warn("Lanki: Could not run sentence extractor on page:", err);
    }
  }

  if (!word) return;

  const settings = await getSettings();
  const activePrompt = getActivePrompt(settings);
  const promptId = activePrompt?.id || "";
  const promptTitle = activePrompt?.title || "";

  const queue = await getQueue(promptId);
  const alreadyExists = queue.some(item => (item.promptId || "") === promptId && item.word.toLowerCase() === word.toLowerCase());

  let status = "added";
  if (alreadyExists) {
    status = "duplicate";
  } else {
    queue.push({
      id: "w_" + Math.random().toString(36).slice(2, 9),
      word,
      context: contextSentence,
      promptId,
      timestamp: Date.now()
    });
    await saveQueue(queue);
  }

  const promptQueueCount = queue.filter(item => (item.promptId || "") === promptId).length;

  // Inject toast notification into active tab
  if (tab?.id && isTabInjectable(tab.url)) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: displayInPageToast,
        args: [word, status, promptQueueCount, contextSentence, promptTitle]
      });
    } catch (err) {
      console.warn("Could not inject toast notification:", err);
    }
  }
});

const OFFSCREEN_DOCUMENT_PATH = "offscreen/ocr-offscreen.html";
let creatingOffscreenDoc = null;

async function hasOffscreenDocument() {
  if (chrome.runtime?.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
    });
    return Boolean(contexts && contexts.length > 0);
  }
  return false;
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  if (creatingOffscreenDoc) {
    await creatingOffscreenDoc;
    return;
  }
  creatingOffscreenDoc = (async () => {
    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: ["WORKERS"],
        justification: "Local PP-OCR inference and model cache management"
      });
    } catch (err) {
      if (!err.message?.includes("Only a single offscreen document may be created")) {
        console.warn("Could not create offscreen document:", err);
      }
    } finally {
      creatingOffscreenDoc = null;
    }
  })();
  await creatingOffscreenDoc;
}

// Runtime messages (from snipper content script or popup)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target && message.target !== "background") {
    return;
  }

  if (message.action === "TRIGGER_SNIP_ACTIVE_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.id && isTabInjectable(tab.url)) {
        triggerSnipperOnTab(tab.id);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: "Cannot snip on this restricted page." });
      }
    });
    return true; // Keep message channel open for async response
  }

  if (message.action === "CAPTURE_TAB_SCREENSHOT") {
    chrome.tabs.captureVisibleTab(null, { format: "png" })
      .then((dataUrl) => sendResponse({ dataUrl }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.action === "TRANSCRIBE_SNIPPET") {
    (async () => {
      try {
        const settings = await getSettings();

        // 1. Local Offline Engine (PP-OCRv6)
        if (settings.ocrEngine === "local") {
          await ensureOffscreenDocument();
          const customUrls = settings.localOcr || {};
          const status = await chrome.runtime.sendMessage({
            target: "ocr-offscreen",
            action: "CHECK_LOCAL_OCR_STATUS",
            customUrls
          });

          if (!status?.isReady) {
            throw new Error("Local OCR models are not downloaded. Please open Lanki Settings and download them.");
          }

          const ocrRes = await chrome.runtime.sendMessage({
            target: "ocr-offscreen",
            action: "RUN_LOCAL_OCR",
            imageBase64: message.imageBase64,
            customUrls
          });

          if (ocrRes?.error) {
            throw new Error(ocrRes.error);
          }

          sendResponse({ text: ocrRes?.text || "" });
          return;
        }

        // 2. Remote / Local API Endpoint (LM Studio, Ollama, LiteLLM)
        const baseUrl = settings.useDedicatedVision && settings.visionBaseUrl ? settings.visionBaseUrl : settings.apiBaseUrl;
        const apiKey = settings.useDedicatedVision ? settings.visionApiKey : settings.apiKey;
        const model = settings.useDedicatedVision && settings.visionModel ? settings.visionModel : settings.model;

        const transcribed = await transcribeImageContext({
          baseUrl,
          apiKey,
          model,
          imageBase64: message.imageBase64
        });
        sendResponse({ text: transcribed });
      } catch (err) {
        console.warn("Vision transcription error:", err);
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }

  if (message.action === "GET_LOCAL_OCR_STATUS") {
    (async () => {
      try {
        await ensureOffscreenDocument();
        const settings = await getSettings();
        const customUrls = message.customUrls || settings.localOcr || {};
        const status = await chrome.runtime.sendMessage({
          target: "ocr-offscreen",
          action: "CHECK_LOCAL_OCR_STATUS",
          customUrls
        });
        sendResponse(status);
      } catch (err) {
        sendResponse({ isReady: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.action === "START_LOCAL_OCR_DOWNLOAD") {
    (async () => {
      try {
        await ensureOffscreenDocument();
        const settings = await getSettings();
        const customUrls = message.customUrls || settings.localOcr || {};
        const res = await chrome.runtime.sendMessage({
          target: "ocr-offscreen",
          action: "DOWNLOAD_LOCAL_OCR_MODELS",
          customUrls
        });
        sendResponse(res);
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.action === "CLEAR_LOCAL_OCR_CACHE") {
    (async () => {
      try {
        await ensureOffscreenDocument();
        const res = await chrome.runtime.sendMessage({
          target: "ocr-offscreen",
          action: "CLEAR_LOCAL_OCR_CACHE"
        });
        sendResponse(res);
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.action === "TEST_LOCAL_OCR") {
    (async () => {
      try {
        await ensureOffscreenDocument();
        const settings = await getSettings();
        const customUrls = message.customUrls || settings.localOcr || {};
        const res = await chrome.runtime.sendMessage({
          target: "ocr-offscreen",
          action: "TEST_LOCAL_OCR",
          customUrls
        });
        sendResponse(res);
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }

  if (message.action === "ADD_TO_QUEUE") {
    (async () => {
      try {
        const item = message.item;
        if (!item || !item.word) {
          sendResponse({ success: false, error: "Empty word" });
          return;
        }

        const settings = await getSettings();
        const activePrompt = getActivePrompt(settings);
        const promptId = item.promptId || activePrompt?.id || "";
        const promptTitle = activePrompt?.title || "";

        const queue = await getQueue(promptId);
        const norm = normalizeQueueItem(item, promptId);
        if (!norm) {
          sendResponse({ success: false, error: "Invalid item" });
          return;
        }

        const alreadyIndex = queue.findIndex(q => (q.promptId || "") === promptId && q.word.toLowerCase() === norm.word.toLowerCase());
        if (alreadyIndex !== -1) {
          // If already exists in this prompt, update its context if the new one has context
          if (norm.context && !queue[alreadyIndex].context) {
            queue[alreadyIndex].context = norm.context;
            await saveQueue(queue);
          }
        } else {
          queue.push(norm);
          await saveQueue(queue);
        }

        const promptQueueCount = queue.filter(q => (q.promptId || "") === promptId).length;

        // Show toast in tab if possible
        const tabId = sender.tab?.id;
        if (tabId && sender.tab?.url && isTabInjectable(sender.tab.url)) {
          await chrome.scripting.executeScript({
            target: { tabId },
            func: displayInPageToast,
            args: [norm.word, alreadyIndex !== -1 ? "duplicate" : "added", promptQueueCount, norm.context, promptTitle]
          });
        }

        sendResponse({ success: true, count: promptQueueCount, totalCount: queue.length });
      } catch (err) {
        console.error("Failed to add to queue:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});

function isTabInjectable(url) {
  if (!url) return false;
  return !url.startsWith("chrome://") &&
         !url.startsWith("edge://") &&
         !url.startsWith("chrome-extension://") &&
         !url.startsWith("view-source:") &&
         !url.startsWith("devtools://") &&
         !url.includes("chromewebstore.google.com") &&
         !url.includes("chrome.google.com/webstore");
}

async function triggerSnipperOnTab(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/snipper.js"]
    });
  } catch (err) {
    console.warn("Could not inject snipper script:", err);
  }
}

/**
 * Script executed inside the target web page to extract both selected text
 * and the enclosing sentence context using DOM traversal.
 */
function extractWordAndSentence() {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return { word: "", sentence: "" };

  const word = sel.toString().trim();
  if (!word) return { word: "", sentence: "" };

  try {
    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    let block = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;

    // Traverse up inline tags to get the enclosing block element for full sentence context
    const inlineTags = new Set(["SPAN", "B", "STRONG", "I", "EM", "A", "U", "CODE", "MARK", "SMALL", "SUB", "SUP"]);
    while (
      block &&
      block.parentElement &&
      block.tagName !== "BODY" &&
      block.tagName !== "HTML" &&
      (inlineTags.has(block.tagName) || (block.innerText || block.textContent || "").length < word.length + 20)
    ) {
      block = block.parentElement;
    }

    let fullText = (block?.innerText || block?.textContent || container.textContent || "").replace(/\s+/g, " ");
    const wordIndex = fullText.toLowerCase().indexOf(word.toLowerCase());

    if (wordIndex !== -1) {
      // Look backwards for sentence start
      const before = fullText.slice(0, wordIndex);
      const startMatches = [...before.matchAll(/[.!?\n]\s+/g)];
      const startIdx = startMatches.length > 0
        ? startMatches[startMatches.length - 1].index + startMatches[startMatches.length - 1][0].length
        : 0;

      // Look forwards for sentence end
      const after = fullText.slice(wordIndex + word.length);
      const endMatch = after.match(/[.!?\n]/);
      const endIdx = endMatch
        ? (wordIndex + word.length + endMatch.index + 1)
        : fullText.length;

      let sentence = fullText.slice(startIdx, endIdx).trim();
      if (sentence.length > 250) {
        sentence = sentence.slice(0, 247) + "...";
      }
      return { word, sentence };
    }
  } catch (err) {
    console.warn("Lanki: Error extracting sentence context:", err);
  }

  return { word, sentence: "" };
}

/**
 * In-page Toast notification injected into active tab.
 */
function displayInPageToast(word, status, totalCount, contextSentence, promptTitle) {
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
  const isAdded = status === "added";
  const icon = isAdded ? "✓" : "ℹ";
  const targetName = promptTitle ? promptTitle : "Lanki";
  const title = isAdded ? `Added "${word}" to ${targetName}` : `"${word}" is in ${targetName}`;
  let subtext = isAdded ? `${totalCount} item${totalCount === 1 ? "" : "s"} in ${targetName}` : "Already in this queue";
  
  if (contextSentence && contextSentence.trim()) {
    const trimmedCtx = contextSentence.length > 55 ? contextSentence.slice(0, 52) + "..." : contextSentence;
    subtext = `Context: "${trimmedCtx}"`;
  }

  const bgColor = isAdded ? "#1e1b4b" : "#312e81";
  const borderColor = isAdded ? "#6366f1" : "#818cf8";

  Object.assign(toast.style, {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 18px",
    background: bgColor,
    color: "#ffffff",
    border: `1px solid ${borderColor}`,
    borderRadius: "10px",
    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)",
    fontSize: "13px",
    opacity: "0",
    transform: "translateY(16px) scale(0.95)",
    transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
    pointerEvents: "auto",
    maxWidth: "380px",
    backdropFilter: "blur(8px)"
  });

  toast.innerHTML = `
    <div style="
      display: flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: ${isAdded ? "#4f46e5" : "#4338ca"};
      color: #fff;
      font-weight: bold;
      font-size: 14px;
      flex-shrink: 0;
    ">${icon}</div>
    <div style="display: flex; flex-direction: column; overflow: hidden;">
      <div style="font-weight: 600; color: #f8fafc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        ${title}
      </div>
      <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
        ${subtext}
      </div>
    </div>
  `;

  host.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0) scale(1)";
  });

  // Remove toast after 3.2 seconds
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px) scale(0.95)";
    setTimeout(() => {
      toast.remove();
      if (host.children.length === 0) {
        host.remove();
      }
    }, 300);
  }, 3200);
}
