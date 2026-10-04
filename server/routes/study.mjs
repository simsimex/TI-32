// study.mjs — course reference material for Claude
//
// Drop files into  server/study/  (or a topic subfolder) and they are sent to
// Claude at the start of every SOLVE / EXPLAIN / CHAT / ASK request, so
// answers follow YOUR course's notation, formulas and methods.
//
//   server/study/                 files here are used when STUDY_TOPIC is unset
//   server/study/circuits/        used when STUDY_TOPIC=circuits (set on Render)
//   server/study/calc2/           used when STUDY_TOPIC=calc2
//
// Supported: .pdf  .txt  .md  .csv  .png  .jpg  .jpeg  .gif  .webp
// (Word/PowerPoint: export to PDF first.)
//
// Cost: the material is marked for prompt caching. The first request in a
// session pays a one-time cache write (1.25x normal input price); follow-up
// requests within 5 minutes read it back at 5-10% of the normal price, and
// each read resets the 5-minute timer. Very small material (< ~1-4K tokens,
// model-dependent) is below the caching minimum and is just sent normally.

import fs from "fs";
import path from "path";

const STUDY_ROOT = path.join(process.cwd(), "study");

// Claude's request cap is 32 MB *after* base64 encoding (+33%), and the photo
// rides along too. Cap raw study material at 20 MB to stay safely under.
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

const IMAGE_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
const TEXT_TYPES = new Set([".txt", ".md", ".csv"]);

let cached = null; // loaded once per server start (every deploy restarts it)

export function loadStudy() {
  if (cached) return cached;

  const topic = (process.env.STUDY_TOPIC || "").trim();
  const dir = topic ? path.join(STUDY_ROOT, topic) : STUDY_ROOT;

  let names = [];
  try {
    names = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .filter((n) => !n.startsWith(".") && n.toLowerCase() !== "readme.md")
      .sort();
  } catch {
    names = [];
  }

  const blocks = [];
  const files = [];
  let total = 0;

  for (const name of names) {
    const full = path.join(dir, name);
    const ext = path.extname(name).toLowerCase();
    const size = fs.statSync(full).size;

    if (total + size > MAX_TOTAL_BYTES) {
      files.push({ name, size, skipped: "over the 20 MB total limit" });
      continue;
    }

    if (ext === ".pdf") {
      blocks.push({ type: "text", text: `=== ${name} ===` });
      blocks.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: fs.readFileSync(full).toString("base64"),
        },
      });
    } else if (TEXT_TYPES.has(ext)) {
      blocks.push({ type: "text", text: `=== ${name} ===\n${fs.readFileSync(full, "utf8")}` });
    } else if (IMAGE_TYPES[ext]) {
      blocks.push({ type: "text", text: `=== ${name} ===` });
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: IMAGE_TYPES[ext],
          data: fs.readFileSync(full).toString("base64"),
        },
      });
    } else {
      files.push({ name, size, skipped: "unsupported file type (export to PDF)" });
      continue;
    }
    total += size;
    files.push({ name, size });
  }

  if (blocks.length) {
    blocks.unshift({
      type: "text",
      text:
        "COURSE REFERENCE MATERIAL uploaded by the student. Treat it as the " +
        "authority for notation, definitions, formulas and solution methods.",
    });
    // One cache breakpoint on the last study block: everything up to here
    // (system prompt + material) is cached and reused across requests.
    const last = blocks.length - 1;
    blocks[last] = { ...blocks[last], cache_control: { type: "ephemeral" } };
  }

  cached = { topic: topic || "(none)", dir, blocks, files, totalBytes: total };
  const used = files.filter((f) => !f.skipped).length;
  console.log(`study: ${used} file(s) loaded from ${dir} (${Math.round(total / 1024)} KB)`);
  for (const f of files.filter((f) => f.skipped)) console.log(`study: skipped ${f.name} — ${f.skipped}`);
  return cached;
}

// Prepend the study material to the first user message. Leaves the stored
// chat history untouched (material is added fresh on every request, and the
// cache makes that cheap).
export function withStudy(messages) {
  const { blocks } = loadStudy();
  if (!blocks.length || !messages.length) return messages;
  const [first, ...rest] = messages;
  const content =
    typeof first.content === "string" ? [{ type: "text", text: first.content }] : first.content;
  return [{ ...first, content: [...blocks, ...content] }, ...rest];
}

export const STUDY_SYSTEM_NOTE =
  " If course reference material is included at the start of the conversation, " +
  "follow its notation, definitions, formulas and methods, and prefer its approach " +
  "over a generic one.";
