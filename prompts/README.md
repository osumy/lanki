# 📂 Lanki Prompt Templates & Anki Note Types

Lanki is completely agnostic to your flashcard structure. While it ships with no mandatory hardcoded format, you can configure **custom prompt templates** to generate flashcards for any language, exam (IELTS, TOEFL, GRE, SAT), or academic discipline (Medical, Law, Programming).

This directory contains battle-tested sample templates and instructions for setting up corresponding **Note Types** in Anki Desktop.

---

## 📑 Included Sample Templates

| Template | Target Domain | Fields | Anki Header | File Link |
| :--- | :--- | :---: | :--- | :--- |
| **IELTS Vocabulary** | General / Academic IELTS (CEFR B2) | **12** | `#columns:Word	Phonetic	Audio	Part of Speech	Definition...` | [View Template](./word_ielts_12field.md) |
| **IELTS Idioms & Phrases** | IELTS Speaking (B2/C1 Fluency) | **7** | `#columns:Idiom	Register	Meaning	Origin / Imagery...` | [View Template](./idiom_ielts_7field.md) |

---

## ⚠️ Crucial: Setting Up Matching Note Types in Anki Desktop

When you import a TSV file into Anki Desktop:
* **Anki does NOT automatically create new Note Types or field names.**
* If you import a 12-field file into Anki's default `Basic` Note Type (which only has 2 fields: `Front` and `Back`), Anki will only populate the first two columns and discard the rest!

### Quick 30-Second Setup in Anki:
1. Open **Anki Desktop** and press **`Ctrl+Shift+N`** (or click **Tools -> Manage Note Types**).
2. Click **Add** -> Choose **Add: Basic** -> Name it (e.g., `Lanki - IELTS Vocabulary` or `Lanki - IELTS Idioms`).
3. Click **Fields...** on your new note type and add the column names defined in the `#columns:...` header of your template in the exact order.
4. When importing your generated `.txt` file into Anki (**`Ctrl+I`**):
   * Select your custom Note Type from the **Note Type** dropdown at the top.
   * Anki will automatically match all columns 1:1 with your fields!

---

## 🎨 How to Create Your Own Custom Prompts

You are never locked into these presets! You can create prompts for:
* **German / French / Spanish**: (e.g., Article, Gender, Plural, IPA, Conjugation, Example)
* **Medical / Pharmacology**: (e.g., Drug Name, Mechanism of Action, Indications, Side Effects)
* **Computer Science**: (e.g., Concept, Time Complexity, Code Snippet, Pitfalls)

### How to adapt with any LLM (ChatGPT / Claude / Gemini):
Send one of the sample prompt files to your LLM along with this instruction:

> *"Here is a prompt template used by the Lanki Chrome Extension. It generates multi-field TSV flashcards for Anki. Please adapt this prompt to create a new [X-field] flashcard template for [Subject / Language: e.g. B2 German Vocabulary with articles, plurals, and German definitions]. Make sure to keep the `{LIST}` placeholder, the exact 3 Anki header lines (`#separator:tab`, `#html:true`, `#columns:...`), and strict TSV formatting."*

### Rules for Valid Lanki Templates:
1. **Include `{LIST}`**: Lanki injects your queued words at this placeholder.
2. **Include Anki Header**: Must output `#separator:tab`, `#html:true`, and `#columns:<Field1>\t<Field2>...` at the top of the TSV block.
3. **Strict Delimiters**: Output must use Tab characters between fields, and `<br>` for internal line breaks (never raw newlines inside a row).
