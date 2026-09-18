# 📘 IELTS Vocabulary Prompt Template (12 Fields)

A prompt template designed for advanced English learners and IELTS candidates targeting **CEFR B2/C1** proficiency. Generates rich, multi-field lexicographical flashcards with contextual disambiguation, CEFR-graded dual examples, collocations, word family derivatives, and Persian translations.

---

## 📋 Anki Note Type Setup (Required Before First Import)

In Anki Desktop, you must have a Note Type that contains matching fields. If you do not have one yet, follow these quick steps (takes ~30 seconds):

1. Open Anki Desktop and press **`Ctrl+Shift+N`** (or navigate to **Tools -> Manage Note Types**).
2. Click **Add** -> select **Add: Basic** -> name it **`Lanki - IELTS Vocabulary`**.
3. Select your new Note Type and click **Fields...**.
4. Add the following **12 fields** (in this exact order):
   1. `Word`
   2. `Phonetic`
   3. `Audio`
   4. `Part of Speech`
   5. `Definition`
   6. `Synonyms`
   7. `Antonyms`
   8. `Collocations`
   9. `Word Family`
   10. `Examples`
   11. `Persian Meaning`
   12. `Persian Example Translations`
5. *(Optional)* Click **Cards...** to design your front/back styling with these fields.
6. When importing the generated `.txt` file (**`Ctrl+I`**), set the **Note Type** dropdown at the top to **`Lanki - IELTS Vocabulary`**.

---

## 🏷️ Anki TSV Header

```tsv
#separator:tab
#html:true
#columns:Word	Phonetic	Audio	Part of Speech	Definition	Synonyms	Antonyms	Collocations	Word Family	Examples	Persian Meaning	Persian Example Translations
```

---

## 📝 The Prompt Template

Copy and paste the text below into **Lanki -> Settings -> Prompt Templates -> New**:

```markdown
Act as an expert English lexicographer and IELTS vocabulary instructor specializing in CEFR leveling (targeting B2 proficiency).

I will provide a list of English words. For each word, generate a complete entry strictly matching my exact 12-field Anki structure.

CRITICAL CONTENT & LEXICOGRAPHICAL RULES:
1. Clean Word Column (Crucial):
   - In the "Word" column, output ONLY the clean, standard dictionary citation form (lemma).
   - NEVER include any "(Context: ...)" note, brackets, or sentence snippets in the "Word" column.
   - Always output the word itself in strictly LOWERCASE characters (e.g., "inevitable", "produce", "justify") unless it is a proper noun that inherently requires capitalization.

2. Context-Driven Sense Disambiguation (Crucial):
   - Items in the input list may arrive in two formats:
     a) With context: <number>. <word> (Context: "<enclosing sentence>")
     b) Without context: <number>. <word>
   - If a '(Context: "...")' note is present:
     * Analyze that exact sentence to determine the precise Part of Speech, nuanced definition, synonyms, and Persian translation used in that specific context (e.g., disambiguating polysemous words like "address", "novel", "run", "produce").
     * Do NOT default to an unrelated primary dictionary definition if the context demands a specific secondary sense.
   - If NO context is provided:
     * Select the single most high-utility, academic/general sense targeting IELTS B2 proficiency.

3. Phonetic: Accurate IPA phonetic transcription enclosed in slashes (e.g., /ɪnˈevɪtəbl/).

4. Audio: Leave this column completely empty (just the tab space) as it will be populated locally via TTS.

5. Part of Speech: Standard lowercase abbreviation (e.g., "noun", "verb", "adjective", "adverb").

6. Definition: Provide a clear, natural English definition suitable for a B1–B2 learner (avoid overly archaic or obscure vocabulary).

7. Synonyms & Antonyms:
   - Synonyms: 2-3 high-utility synonyms that fit the selected sense, separated by " | ".
   - Antonyms: 1-2 direct antonyms separated by " | " (use "-" if no natural antonym exists).

8. Collocations: Provide 3-4 high-utility academic/natural collocations separated by " | ".

9. Word Family: List the most common derivatives (noun, verb, adj, adv) separated by " | " (e.g., "inevitability (n) | inevitably (adv)").

10. Examples (Crucial):
   - Example 1 must be at CEFR B1 level: Simple, clear, everyday or straightforward academic context using accessible conversational grammar.
   - Example 2 must be at CEFR B2 level: More sophisticated sentence structure with natural collocation usage, typical of IELTS General/Academic contexts. If context was provided in the input, you may adapt its scenario for Example 2.
   - Format: "1. [B1] <sentence><br>2. [B2] <sentence>"

11. Persian Meaning: Accurate, natural Persian equivalents matching the chosen context-specific sense (separated by ،).

12. Persian Translations: Accurate Persian translations of both examples: "۱. [B1] <ترجمه><br>۲. [B2] <ترجمه>".

STRICT OUTPUT FORMAT RULES:
- Output MUST be a single raw code block formatted as TSV (Tab-Separated Values).
- Always include these exact 3 header lines at the very top:
#separator:tab
#html:true
#columns:Word	Phonetic	Audio	Part of Speech	Definition	Synonyms	Antonyms	Collocations	Word Family	Examples	Persian Meaning	Persian Example Translations

- Exactly 11 TAB characters per row (creating exactly 12 fields). Never insert actual tabs inside field content.
- Do NOT insert actual line breaks within a row; use "<br>" for all line breaks.
- Do not write any conversational intro or outro. Output only the TSV code block.

Here is the list of words:
{LIST}
```
