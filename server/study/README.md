# Course study material

Anything in this folder is sent to Claude with every SOLVE, EXPLAIN, CHAT and
ASK, so answers use your course's notation, formulas and methods.

## Add material

1. Drop files in this folder: lecture notes, formula sheets, a textbook
   chapter, worked examples, the syllabus.
2. Commit + push from GitHub Desktop. Render redeploys and loads them.
3. Check https://ti-32-w-camera.onrender.com/gpt/study to confirm.

Supported: `.pdf` `.txt` `.md` `.csv` `.png` `.jpg` `.jpeg` `.gif` `.webp`
Word / PowerPoint / Google Docs: export to PDF first.

## Several classes? Use topic folders

    study/circuits/   formula-sheet.pdf, lecture-notes.pdf
    study/calc2/      integration-rules.pdf

On Render → Environment, set `STUDY_TOPIC` to the folder name
(e.g. `circuits`). Change it to switch classes; no code change needed.
With `STUDY_TOPIC` unset, only files directly in `study/` are used.

## Keep it focused

- Total limit: 20 MB. Files past that are skipped (listed at /gpt/study).
- Each PDF page costs ~1,500–3,000 tokens. A 30-page formula packet beats
  a 600-page textbook: cheaper, faster, and Claude finds the right method
  more reliably.
- Material is prompt-cached: the first question in a session pays a one-time
  write; follow-ups within 5 minutes read it back at 5–10% of normal price.
