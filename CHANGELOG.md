# Changelog

All notable changes to the **Lanki** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.6] - 2026-09-18

### Added
- Comprehensive automated test suites for batch generation, chunking logic, and local CTC decoder.
- High-resolution extension icons (16px, 32px, 48px, 128px) with crisp geometric branding.
- Enhanced offline OCR model error handling and CacheStorage persistence checks.

### Changed
- Improved TSV export structure to enforce UTF-8 BOM encoding for flawless multi-lingual (Persian, Arabic, English phonetics) rendering in Anki Desktop across Windows, macOS, and Linux.
- Optimized DOM sentence extraction to intelligently handle complex sentence boundaries, dialogue quotes, and inline markup.

### Fixed
- Fixed column count misalignment when switching between templates with different column schemas.
- Fixed Chrome offscreen document lifecycle management in service worker during browser suspensions.

## [1.2.4] - 2026-09-17

### Added
- **Isolated Prompt-Aware Queues**: Each prompt template maintains its own independent vocabulary queue (e.g., 12-field IELTS Vocabulary vs 7-field Idioms & Expressions).
- Live item count badges displayed on template dropdowns across both Queue and Settings tabs.
- Template-isolated deck generation and queue clearing, ensuring items in other queues are completely protected.

### Changed
- Standardized storage schema to tag each word item with unique `id`, `promptId`, `context`, and `timestamp`.

## [1.2.2] - 2026-09-15

### Added
- **Dynamic Anki TSV Headers**: Customizable `#separator:tab`, `#html:true`, and `#columns:...` headers configured per prompt template.
- **`✨ AI Generate`**: Automatically prompts the active LLM to analyze prompt instructions and generate compliant Anki column headers.
- **`🔍 Quick Detect`**: Instant parser to discover embedded Anki column headers directly from prompt text.

### Fixed
- Eliminated Anki import field count mismatch warnings when importing cards generated from different custom templates.

## [1.2.0] - 2026-09-10

### Added
- **Local Offline OCR Engine**: In-browser text detection and recognition running PP-OCRv6 via ONNX Runtime WebAssembly (`ort-wasm-simd.wasm`) inside a Chrome offscreen document.
- Model presets for `v6-tiny` (~6 MB) and `v6-small` (~30 MB) with 1-click on-demand download and local browser caching.
- Zero-latency, 100% private OCR requiring zero internet connectivity or third-party API keys.

## [1.1.0] - 2026-09-02

### Added
- **Screen Snipping Tool (`Alt+C`)**: Snip any rectangular area on screen—web pages, PDFs, diagrams, canvas, or video subtitles (YouTube, Coursera, Netflix).
- **In-Page Review Modal**: Interactive overlay to preview cropped snippets, review OCR transcription, and refine words and context before saving.
- Dedicated Vision / Multimodal model routing (LM Studio, Ollama, LiteLLM) independent of the text generation model.

## [1.0.0] - 2026-08-20

### Added
- Initial release of Lanki Chrome Extension (Manifest V3).
- Context-aware vocabulary capture with DOM-level automatic enclosing sentence extraction.
- Smart batch generation (chunking) to prevent LLM token degradation and format drift.
- Multi-provider compatibility (LiteLLM, LM Studio, Ollama, OpenAI-compatible APIs).
- Single consolidated TSV export with 1-click import into Anki Desktop.
- Built-in 12-field CEFR B1/B2 IELTS lexicographer prompt template.
