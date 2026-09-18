# 🗣️ IELTS Idioms & Phrasal Verbs Prompt Template (7 Fields)

A specialized prompt template designed for IELTS Speaking candidates targeting **CEFR B2/C1** natural fluency. Focuses on idiomatic register guidelines (avoiding informal idioms in Task 2 Academic Writing), figurative imagery/mnemonics, spoken discourse examples, and Persian colloquial equivalents.

---

## 📋 Anki Note Type Setup (Required Before First Import)

In Anki Desktop, you must have a Note Type that contains matching fields. If you do not have one yet, follow these quick steps (takes ~30 seconds):

1. Open Anki Desktop and press **`Ctrl+Shift+N`** (or navigate to **Tools -> Manage Note Types**).
2. Click **Add** -> select **Add: Basic** -> name it **`Lanki - IELTS Idioms`**.
3. Select your new Note Type and click **Fields...**.
4. Add the following **7 fields** (in this exact order):
   1. `Idiom`
   2. `Register`
   3. `Meaning`
   4. `Origin / Imagery`
   5. `Examples`
   6. `Persian Meaning`
   7. `Persian Example Translations`
5. *(Optional)* Click **Cards...** to design your front/back styling with these fields.
6. When importing the generated `.txt` file (**`Ctrl+I`**), set the **Note Type** dropdown at the top to **`Lanki - IELTS Idioms`**.

---

## 🏷️ Anki TSV Header

```tsv
#separator:tab
#html:true
#columns:Idiom	Register	Meaning	Origin / Imagery	Examples	Persian Meaning	Persian Example Translations
```

---

## 📝 The Prompt Template

Copy and paste the text below into **Lanki -> Settings -> Prompt Templates -> New**:

```markdown
Act as a senior IELTS examiner and expert English lexicographer specializing in idiomatic expressions and CEFR leveling (targeting B2/C1 Speaking proficiency).

I will provide a list of English idioms, phrasal verbs, or fixed expressions. For each item, generate a complete entry strictly matching my exact 7-field Anki structure.

CRITICAL CONTENT & LEXICOGRAPHICAL RULES:
1. Canonical Citation Form (Crucial):
   - In the "Idiom" column, output ONLY the standard dictionary citation form (lemma).
   - NEVER include any "(Context: ...)" note, brackets, or sentence snippets in the "Idiom" column.
   - Use standard dictionary placeholders:
     * "sb" for people (e.g., "get on with sb", "look down on sb")
     * "sth" for objects or abstract concepts (e.g., "cut down on sth", "brush up on sth")
     * "one's" for possessives (e.g., "make up one's mind", "lose one's temper")
     * Parentheses "()" for optional elements (e.g., "get on (well) with sb")
   - Output the idiom in strictly LOWERCASE characters unless it contains an inherent proper noun (e.g., "Achilles' heel").

2. Context-Driven Sense Disambiguation (Crucial):
   - Items in the input list may arrive in two formats:
     a) With context: <number>. <phrase> (Context: "<enclosing sentence>")
     b) Without context: <number>. <phrase>
   - If a '(Context: "...")' note is present:
     * You MUST analyze that exact sentence and extract/define ONLY the specific figurative sense intended in that context.
     * Do NOT default to a literal or alternate dictionary sense if the context implies a specific idiomatic nuance.
   - If NO context is provided:
     * Disambiguate polysemous phrases by selecting the single most high-utility, natural idiomatic sense for IELTS Speaking (e.g., for "turn down", select "turn sth down [reject an offer]" rather than physical volume).

3. Register (Strict Enum): You MUST choose EXACTLY one of these three predefined labels for the Register field (do not alter the wording):
   - "Speaking Only ⚠️ Avoid in Task 2" (for informal idioms/phrasal verbs suitable only for the Speaking interview)
   - "Neutral (Speaking & Writing)" (for idioms/expressions accepted across both speaking and general/academic writing)
   - "Academic (Writing & Speaking)" (for formal or analytical idiomatic structures)

4. Meaning: Provide a clear, concise English definition of the figurative meaning suitable for a B2 learner (avoid overly academic jargon or circular phrasing).

5. Origin / Imagery: Provide a short, vivid 1-sentence mental picture or historical origin that acts as a mnemonic hook to anchor the meaning in memory.

6. Examples (Crucial):
   - Example 1 must be CEFR B1 level: Simple, natural everyday situation using accessible conversational grammar.
   - Example 2 must be CEFR B2/C1 level: Modeled as a natural, high-scoring IELTS Speaking answer (Part 1 or Part 2) with rich lexical context and authentic discourse markers.
   - If a context sentence was provided in the input, you may adapt its scenario for Example 2 so long as it sounds completely natural.
   - Format: "1. [B1] <sentence><br>2. [B2] <sentence>"

7. Persian Meaning: Accurate, colloquial, or proverb-equivalent Persian expressions (separated by comma/ویرگول).

8. Persian Translations: Fluent Persian translations of both examples: "۱. [B1] <ترجمه><br>۲. [B2] <ترجمه>".

STRICT OUTPUT FORMAT RULES:
- Output MUST be a single raw code block formatted as TSV (Tab-Separated Values).
- Always include these exact 3 header lines at the very top:
#separator:tab
#html:true
#columns:Idiom	Register	Meaning	Origin / Imagery	Examples	Persian Meaning	Persian Example Translations

- Exactly 6 TAB characters per row (creating exactly 7 fields). Never insert actual tabs inside field content.
- Do NOT insert actual line breaks within a row; use "<br>" for all line breaks.
- Do not write any conversational greeting, introduction, or concluding remarks. Output ONLY the raw TSV code block.

Here is the list of idioms:
{LIST}
```
