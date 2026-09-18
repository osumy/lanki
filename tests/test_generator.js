import assert from "node:assert";
import {
  chunkArray,
  formatPromptForWords,
  parseTsvRows
} from "../src/generator.js";
import { ANKI_HEADER_LINES, SAMPLE_IELTS_PROMPT } from "../src/defaults.js";

console.log("--- Running Lanki Generator Tests ---");

// Test 1: Chunking 59 words with chunkSize = 10
const words59 = Array.from({ length: 59 }, (_, i) => `word_${i + 1}`);
const chunks = chunkArray(words59, 10);
assert.strictEqual(chunks.length, 6, "59 words should produce exactly 6 chunks");
assert.strictEqual(chunks[0].length, 10, "First chunk should have 10 words");
assert.strictEqual(chunks[4].length, 10, "Fifth chunk should have 10 words");
assert.strictEqual(chunks[5].length, 9, "Sixth chunk should have remaining 9 words");
console.log("✓ Test 1: Chunking works as expected (6 chunks: 10,10,10,10,10,9)");

// Test 2: Chunking small queue (7 words with chunk size 10)
const words7 = ["apple", "banana", "cherry", "date", "elderberry", "fig", "grape"];
const chunks7 = chunkArray(words7, 10);
assert.strictEqual(chunks7.length, 1, "7 words with chunk size 10 should produce 1 chunk");
assert.strictEqual(chunks7[0].length, 7, "Chunk should contain all 7 words");
console.log("✓ Test 2: Sub-chunk handling works (7 words -> 1 chunk)");

// Test 3: Prompt formatting with {LIST} placeholder (and legacy {WORDS_LIST})
const templateWithList = "Custom prompt prefix.\n{LIST}\nCustom prompt suffix.";
const prompt1 = formatPromptForWords(templateWithList, ["apple", "banana"]);
assert(prompt1.includes("1. apple"), "Prompt should contain numbered word 1");
assert(prompt1.includes("2. banana"), "Prompt should contain numbered word 2");

const templateWithWordsList = "Prefix.\n{WORDS_LIST}\nSuffix.";
const promptLegacy = formatPromptForWords(templateWithWordsList, ["cat", "dog"]);
assert(promptLegacy.includes("1. cat") && promptLegacy.includes("2. dog"), "Legacy {WORDS_LIST} placeholder should still work");
console.log("✓ Test 3: Prompt formatting with {LIST} (and legacy {WORDS_LIST}) placeholder works");

// Test 4: Prompt formatting without placeholder (appends list)
const templateWithoutPlaceholder = "Act as lexicographer and generate TSV.";
const prompt2 = formatPromptForWords(templateWithoutPlaceholder, ["apple", "banana"]);
assert(prompt2.startsWith("Act as lexicographer"), "Should preserve prompt");
assert(prompt2.includes("Here is the list of words:\n1. apple\n2. banana"), "Should append words list at end");
console.log("✓ Test 4: Prompt formatting without placeholder appends words at end");

// Test 5: Empty prompt error throw
assert.throws(() => {
  formatPromptForWords("", ["apple"]);
}, /Prompt template is empty/, "Should throw error when prompt template is empty");
assert.throws(() => {
  formatPromptForWords("   ", ["apple"]);
}, /Prompt template is empty/, "Should throw error when prompt template is whitespace");
console.log("✓ Test 5: Empty prompt properly throws descriptive error");

// Test 6: TSV Parsing and Header stripping
const mockLlmChunk1 = `\`\`\`tsv
#separator:tab
#html:true
#columns:Word\tPhonetic\tAudio\tPart of Speech\tDefinition\tSynonyms\tAntonyms\tCollocations\tWord Family\tExamples\tPersian Meaning\tPersian Example Translations
inevitable\t/ɪnˈevɪtəbl/\t\tadjective\tCertain to happen and impossible to avoid.\tunavoidable\tpreventable\talmost inevitable\tinevitability\t1. [B1] Tired.<br>2. [B2] Urbanization.\tاجتنابناپذیر\t۱. [B1] خستگی.<br>۲. [B2] شهرنشینی.
arbitrary\t/ˈɑːrbɪtreri/\t\tadjective\tDecided without plan.\trandom\trational\tarbitrary choice\tarbitrariness\t1. [B1] Grade.<br>2. [B2] Admissions.\tدلبخواهی\t۱. [B1] نمره.<br>۲. [B2] پذیرش.
\`\`\``;

const parsedChunk1 = parseTsvRows(mockLlmChunk1);
assert.strictEqual(parsedChunk1.length, 2, "Should parse 2 word rows and strip headers");
assert(!parsedChunk1[0].startsWith("#"), "Header should not be in parsed rows");
assert(parsedChunk1[0].startsWith("inevitable\t"), "Row 1 should start with inevitable");
assert(parsedChunk1[1].startsWith("arbitrary\t"), "Row 2 should start with arbitrary");

const mockLlmChunk2 = `#separator:tab
#html:true
#columns:Word\tPhonetic\tAudio\tPart of Speech\tDefinition\tSynonyms\tAntonyms\tCollocations\tWord Family\tExamples\tPersian Meaning\tPersian Example Translations
coherent\t/koʊˈhɪrənt/\t\tadjective\tClear and logical.\tlogical\tincoherent\tcoherent argument\tcoherence\t1. [B1] Simple.<br>2. [B2] Advanced.\tمنسجم\t۱. [B1] ساده.<br>۲. [B2] پیشرفته.
`;

const parsedChunk2 = parseTsvRows(mockLlmChunk2);
assert.strictEqual(parsedChunk2.length, 1, "Should parse 1 word row from chunk 2");

// Test 7: Consolidated single TSV output
const consolidatedAll = [...ANKI_HEADER_LINES, ...parsedChunk1, ...parsedChunk2].join("\n");
const totalLines = consolidatedAll.split("\n");
assert.strictEqual(totalLines.length, 3 + 3, "Total file should have 3 header lines + 3 data lines");
assert.strictEqual(totalLines[0], "#separator:tab");
assert.strictEqual(totalLines[1], "#html:true");
assert(totalLines[2].startsWith("#columns:Word\t"));
assert(totalLines[3].startsWith("inevitable\t"));
assert(totalLines[4].startsWith("arbitrary\t"));
assert(totalLines[5].startsWith("coherent\t"));
console.log("✓ Test 6 & 7: TSV row parser & consolidation works flawlessly");

// Test 8: Prompt Templates & getActivePrompt helper (starts completely empty by default)
import { DEFAULT_PROMPTS, DEFAULT_SETTINGS, getActivePrompt } from "../src/defaults.js";

assert(Array.isArray(DEFAULT_PROMPTS), "DEFAULT_PROMPTS should be an array");
assert.strictEqual(DEFAULT_PROMPTS.length, 0, "DEFAULT_PROMPTS should be empty by default as requested");

const defaultActive = getActivePrompt(DEFAULT_SETTINGS);
assert.strictEqual(defaultActive, null, "Default active prompt should be null when no prompts are configured");

// Custom settings with user-defined prompt
const customSettings = {
  ...DEFAULT_SETTINGS,
  prompts: [
    {
      id: "custom-ielts",
      title: "IELTS Lexicographer",
      content: "Generate Anki cards for:\n{LIST}",
      createdAt: Date.now()
    }
  ],
  activePromptId: "custom-ielts"
};
const customActive = getActivePrompt(customSettings);
assert.strictEqual(customActive.id, "custom-ielts", "Should retrieve custom active prompt");
console.log("✓ Test 8: Empty prompt default & custom prompt management work as expected");

// Test 9: formatPromptForWords with custom active prompt
const formatted = formatPromptForWords(customActive.content, ["ubiquitous", "resilience"]);
assert(formatted.includes("1. ubiquitous"), "Formatted prompt should contain word 1");
assert(formatted.includes("2. resilience"), "Formatted prompt should contain word 2");
// Test 10: formatPromptForWords with contextual items
const mixedItems = [
  { word: "get on", context: "I get on really well with my colleagues." },
  { word: "ubiquitous", context: "" },
  "resilience"
];
const formattedContextual = formatPromptForWords("Words:\n{LIST}", mixedItems);
assert(formattedContextual.includes('1. get on (Context: "I get on really well with my colleagues.")'), "Should include context tag");
assert(formattedContextual.includes("2. ubiquitous"), "Should format word without context");
assert(!formattedContextual.includes('2. ubiquitous (Context:'), "Should not include context tag if empty");
assert(formattedContextual.includes("3. resilience"), "Should format string word");
console.log("✓ Test 10: formatPromptForWords properly injects (Context: '...') tags for disambiguation");

// Test 11: Header extraction from explicit promptObj.headers (7-field Idioms template)
import { extractAnkiHeaderLines, getColumnNamesFromHeader, normalizeHeaderLines } from "../src/defaults.js";

const idiomPromptObj = {
  id: "idioms-7col",
  title: "IELTS Idioms",
  content: "Generate 7 fields for:\n{LIST}",
  headers: "#separator:tab\n#html:true\n#columns:Idiom\tRegister\tMeaning\tOrigin / Imagery\tExamples\tPersian Meaning\tPersian Example Translations"
};

const extractedFromObj = extractAnkiHeaderLines(idiomPromptObj);
assert.strictEqual(extractedFromObj.length, 3, "Headers should have exactly 3 lines");
assert.strictEqual(extractedFromObj[0], "#separator:tab");
assert.strictEqual(extractedFromObj[1], "#html:true");
assert(extractedFromObj[2].startsWith("#columns:Idiom\t"), "Columns line should start with Idiom");

const idiomCols = getColumnNamesFromHeader(extractedFromObj);
assert.strictEqual(idiomCols.length, 7, "Should extract exactly 7 column names");
assert.strictEqual(idiomCols[0], "Idiom");
assert.strictEqual(idiomCols[1], "Register");
assert.strictEqual(idiomCols[6], "Persian Example Translations");
console.log("✓ Test 11: extractAnkiHeaderLines from explicit promptObj.headers works (7 columns)");

// Test 12: Header extraction directly from prompt text instructions
const promptWithEmbeddedHeader = `Act as lexicographer.
Always include these 3 header lines:
#separator:tab
#html:true
#columns:Phrase\tContext\tDefinition\tPersian Translation

Here are the words:
{LIST}`;

const extractedFromText = extractAnkiHeaderLines(null, promptWithEmbeddedHeader);
assert.strictEqual(extractedFromText.length, 3);
const detectedCols = getColumnNamesFromHeader(extractedFromText);
assert.strictEqual(detectedCols.length, 4, "Should detect 4 columns from prompt text");
assert.strictEqual(detectedCols[0], "Phrase");
assert.strictEqual(detectedCols[3], "Persian Translation");
console.log("✓ Test 12: extractAnkiHeaderLines auto-detects embedded #columns from prompt text");

// Test 13: Fallback to default 12-field vocabulary headers
const promptWithoutHeader = "Just give me words: {LIST}";
const fallbackHeaders = extractAnkiHeaderLines(null, promptWithoutHeader);
assert.strictEqual(fallbackHeaders.length, 3);
const fallbackCols = getColumnNamesFromHeader(fallbackHeaders);
assert.strictEqual(fallbackCols.length, 12, "Fallback should provide the 12 default IELTS columns");
console.log("✓ Test 13: extractAnkiHeaderLines correctly falls back to default 12-column header");

// Test 14: Prompt-Aware Queue item normalization and legacy migration
import { normalizeQueueItem, getItemsForPrompt, getPromptCounts } from "../src/defaults.js";

const rawLegacyString = "  ubiquitous  ";
const normalizedLegacy = normalizeQueueItem(rawLegacyString, "prompt_vocab");
assert.strictEqual(normalizedLegacy.word, "ubiquitous");
assert.strictEqual(normalizedLegacy.promptId, "prompt_vocab", "Legacy string should receive active prompt ID fallback");

const rawItemWithPrompt = { word: "bite the bullet", promptId: "prompt_idioms", context: "I had to bite the bullet." };
const normalizedWithPrompt = normalizeQueueItem(rawItemWithPrompt, "prompt_vocab");
assert.strictEqual(normalizedWithPrompt.word, "bite the bullet");
assert.strictEqual(normalizedWithPrompt.promptId, "prompt_idioms", "Explicit promptId must be preserved");
console.log("✓ Test 14: normalizeQueueItem preserves explicit promptId and migrates legacy items");

// Test 15: getItemsForPrompt isolates queues between multiple templates
const multiQueue = [
  { id: "1", word: "resilience", promptId: "prompt_vocab" },
  { id: "2", word: "ubiquitous", promptId: "prompt_vocab" },
  { id: "3", word: "bite the bullet", promptId: "prompt_idioms" },
  { id: "4", word: "cut corners", promptId: "prompt_idioms" },
  { id: "5", word: "spill the beans", promptId: "prompt_idioms" }
];

const vocabItems = getItemsForPrompt(multiQueue, "prompt_vocab");
const idiomItems = getItemsForPrompt(multiQueue, "prompt_idioms");

assert.strictEqual(vocabItems.length, 2, "Vocab queue must contain exactly 2 items");
assert.strictEqual(vocabItems[0].word, "resilience");
assert.strictEqual(vocabItems[1].word, "ubiquitous");

assert.strictEqual(idiomItems.length, 3, "Idiom queue must contain exactly 3 items");
assert.strictEqual(idiomItems[0].word, "bite the bullet");
assert.strictEqual(idiomItems[1].word, "cut corners");
assert.strictEqual(idiomItems[2].word, "spill the beans");
console.log("✓ Test 15: getItemsForPrompt cleanly isolates queues between templates");

// Test 16: getPromptCounts returns accurate per-template counts
const counts = getPromptCounts(multiQueue);
assert.strictEqual(counts["prompt_vocab"], 2, "prompt_vocab count should be 2");
assert.strictEqual(counts["prompt_idioms"], 3, "prompt_idioms count should be 3");
console.log("✓ Test 16: getPromptCounts computes accurate counts per template");

// Test 17: Per-prompt export auto-clear simulation (preserves other prompt queues)
let stateQueue = [...multiQueue];
const activeToExport = "prompt_idioms";

// Simulate export of prompt_idioms
stateQueue = stateQueue.filter(item => item.promptId !== activeToExport);
assert.strictEqual(stateQueue.length, 2, "Exporting idioms must only remove the 3 idiom items");
assert.strictEqual(stateQueue[0].word, "resilience", "Vocab items must be completely preserved");
assert.strictEqual(stateQueue[1].word, "ubiquitous", "Vocab items must be completely preserved");

const remainingIdioms = getItemsForPrompt(stateQueue, "prompt_idioms");
assert.strictEqual(remainingIdioms.length, 0, "Idioms queue is now empty");
console.log("✓ Test 17: Per-prompt auto-clear clears exported prompt while preserving all others");

console.log("--- All 17 tests passed successfully! ---");
