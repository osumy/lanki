# Lanki - Anki Vocabulary Generator (Chrome Extension)

**Lanki** (v1.2.6) is a high-performance Chrome Extension designed to streamline the creation of structured Anki flashcards with custom prompts (or using the 12-field IELTS preset).

It connects to your local **LiteLLM proxy**, **LM Studio** (`http://localhost:1234/v1`), **Ollama** (`http://localhost:11434/v1`), or any OpenAI-compatible API. It collects words with optional context via right-click, manual input, or **screen area snipping (YouTube subtitles/videos)**, automatically splits queues into chunks (e.g., 10 words per batch), and consolidates all results into a **single clean `.txt` / `.tsv` file** ready for 1-click import into Anki.

---

## 🌟 Key Features (v1.2.6)

1. **Isolated Prompt-Aware Queues (v1.2.4)**:
   - Each prompt template maintains its own completely isolated vocabulary queue (e.g., 12-field *IELTS Vocabulary* vs 7-field *IELTS Idioms*).
   - Words and idioms captured via right-click, screen snip, or popup are tagged to the active template.
   - Switching templates dynamically switches your queue view, displaying live item count badges in dropdowns.
   - Generating a deck exports only items belonging to the active template with its exact column headers, avoiding column mismatches in Anki.
   - Auto-clear on export or "Clear All" only clears items of the active template, leaving items in other prompt queues completely safe.
2. **Dynamic Anki Headers & AI Header Generator (v1.2.2)**:
   - Each prompt template can define its own custom Anki TSV column headers (e.g. 7-field Idioms vs 12-field IELTS vocabulary).
   - Features **`✨ AI Generate`** to automatically analyze prompt instructions with LLM and create compliant `#columns:...` headers, as well as **`🔍 Quick Detect`** to parse embedded headers.
   - Automatically exports flashcard files matching the active template's exact column headers for flawless 1-click Anki import.
2. **Context-Aware Vocabulary Capture**:
   - Polysemous words (e.g., *get on*, *put off*, *run out*) are disambiguated using contextual clues.
   - Enter context sentences manually in the popup or let Lanki capture them automatically.
   - Generates flashcards with definitions, Persian meanings, and examples tailored to that exact context.
3. **Smart Sentence Auto-Capture on Right-Click**:
   - Highlight any word or idiom on a webpage and right-click **`Add "<word>" to Lanki Queue`**.
   - Lanki automatically analyzes the DOM to extract the entire enclosing sentence as context without any extra clicks!
4. **Screen Snipping Tool for YouTube & Videos**:
   - Press **`Alt+C`**, click **📷 Snip** in the popup, or right-click any video/page.
   - Drag a rectangular box around video subtitles or visual scenes.
   - Lanki crops the image, transcribes the sentence using your Vision model (**LM Studio**, **Ollama**, or **LiteLLM**), and presents an in-page editable review modal before saving text-only context to your queue.
5. **Dual OCR Options: Local Offline PP-OCRv6 & Vision API**:
   - **Local Offline Engine (PP-OCRv6 ONNX)**: Runs 100% locally in-browser via WebAssembly. Zero internet connection or external server needed. Features 1-click on-demand model download and CacheStorage management.
   - **Dedicated Vision / API Provider**: Or connect directly to **LM Studio** (port 1234, e.g. `qwen2-vl`, `moondream`), **Ollama** (port 11434), or **LiteLLM**.
6. **Smart Batching (Chunking)**: Large queues (e.g. 59 words) are automatically divided into manageable chunks (e.g., 10, 10, 10, 10, 10, 9 words) to prevent LLM token degradation or format drift.
7. **Single Consolidated Export**: Combines all batches into **one single download** with UTF-8 BOM encoding for flawless Persian/English display in Anki on Windows.
8. **Prompt Templates Management**: Create, edit, duplicate, and organize multiple prompt templates with titles and tags. Select your active template directly from the Queue tab or Settings tab with an interactive preview.
9. **LiteLLM, LM Studio, Ollama & OpenAI Compatible**: Works with local models (Qwen, Llama, Moondream, Mistral) or cloud models (GPT-4o-mini, Gemini Flash, Claude).

---

## 🚀 Installation Guide

### 1. Load the Extension in Google Chrome
1. Clone this repository or download and extract the ZIP archive:
   ```bash
   git clone https://github.com/osumy/lanki.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** using the toggle switch in the top right corner.
4. Click the **Load unpacked** button in the top left.
5. Select the repository root folder.
6. Pin the **Lanki** icon to your Chrome toolbar for easy access.

---

## ⚙️ Setting Up LiteLLM Proxy

LiteLLM lets you route requests to 100+ LLMs (OpenAI, Gemini, Claude, DeepSeek, Ollama, etc.) while exposing a standard OpenAI endpoint.

### Install & Start LiteLLM
```bash
# Install litellm with proxy support
pip install "litellm[proxy]"

# Example: Run with your OpenAI API key
export OPENAI_API_KEY="your-api-key"
litellm --model gpt-4o-mini --port 4000

# Or run with Gemini:
export GEMINI_API_KEY="your-gemini-key"
litellm --model gemini/gemini-1.5-flash --port 4000
```
By default, LiteLLM proxy listens on `http://localhost:4000`.

---

## 📖 How to Use

### 1. Configure Settings & Prompts (First-time setup)
1. Click the **Lanki** icon in your Chrome toolbar.
2. Go to the **Settings** tab.
3. Verify the **API Base URL** (default is `http://localhost:4000/v1`).
4. Set the **Model Name** (e.g., `gpt-4o-mini`, `gemini/gemini-1.5-flash`, etc.).
5. Set your desired **Chunk Size** (default: `10`).
6. **Prompt Templates**:
   - Choose an active template from the dropdown (e.g., *IELTS Lexicographer (12 Fields)* or *Concise Definitions*).
   - Click **Manage** or **New** to create, edit, duplicate, or delete templates.
   - Use `{LIST}` inside your prompt where words will be injected.
7. Click **"Test Connection"** to verify LiteLLM connectivity, then click **"Save Settings"**.

### 2. Collect Words
- **From Web Pages**: Highlight a word -> Right-click -> **"Add to Lanki Queue"**.
- **From Popup**: Type a word in the input field and press `Enter` or click `+ Add`.
- You can remove individual words by clicking `×` or clear the entire queue with `Clear All`.

### 3. Generate & Download
1. Click **"Generate Anki Deck (X words)"**.
2. Watch the live progress bar as it batches requests through your LLM.
3. Once completed, a single `.txt` file (e.g., `lanki_anki_deck_20260917_0400.txt`) will download automatically!

### 4. Import into Anki
1. Open Anki Desktop.
2. Click **File -> Import** (or press `Ctrl+I`).
3. Select the downloaded `.txt` file.
4. Anki will automatically recognize:
   - Field Separator: `Tab`
   - Allow HTML in fields: `Checked`
   - 12 Fields mapped directly to your note type.
5. Click **Import** — all cards are added in one second!

---

## 📁 Project Structure

```
lanki/
├── manifest.json              # Chrome Extension Manifest V3
├── icons/                     # Crisp icons (16, 32, 48, 128 px)
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
├── background/
│   └── service-worker.js     # Context menu handler, badge sync, in-page toast injection
├── offscreen/                 # In-browser offline OCR (PP-OCRv6 via ONNX Runtime Web)
│   ├── ocr-offscreen.html
│   ├── ocr-engine.js
│   ├── ort.min.js
│   ├── ort-wasm.wasm
│   ├── ort-wasm-simd.wasm
│   ├── dict.json             # Tiny model dictionary
│   └── dict_small.json       # Full 18k character dictionary for Small model
├── src/
│   ├── defaults.js           # Settings defaults, presets, isolated queues, storage
│   ├── generator.js          # Chunker, prompt formatter, LLM client, TSV parser, exporter
│   └── snipper.js            # In-page rectangle selection & clean screenshot crop tool
├── popup/
│   ├── popup.html            # Main popup UI (Queue view & Settings view)
│   ├── popup.css             # Polished modern dark UI styling
│   └── popup.js              # Popup interactions, queue management, live batch generation
├── options/
│   ├── options.html          # Full-page options fallback
│   ├── options.css
│   └── options.js
├── tests/
│   ├── test_generator.js     # LLM batch generator test suite
│   └── test_ocr_engine.js    # Local OCR engine & CTC decoder test suite
└── README.md                 # Documentation
```
