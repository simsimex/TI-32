// chatgpt.mjs — patched for camera + Claude support (Claude-only ready)
//
// Routes:
//   GET  /gpt/ask?question=...     -> text answer
//   POST /gpt/snap   (image/jpg)   -> debug echo of upload size, no API call
//   POST /gpt/solve  (image/jpg)   -> vision answer
//
// Defaults to Claude for both /ask and /solve. Only ANTHROPIC_API_KEY is
// required. OPENAI_API_KEY is optional and only consulted when you set
// USE_OPENAI=1 (or the route-specific overrides below).
//
// Env vars:
//   ANTHROPIC_API_KEY   required for any Claude call
//   ANTHROPIC_MODEL     optional, defaults to claude-sonnet-4-5
//   OPENAI_API_KEY      optional; needed only if you opt into OpenAI
//   USE_OPENAI          "1" to route BOTH /ask and /solve to OpenAI
//   USE_OPENAI_FOR_ASK  "1" to route only /ask to OpenAI
//   USE_OPENAI_FOR_SOLVE  "1" to route only /solve to OpenAI

import express from "express";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { loadStudy, withStudy, STUDY_SYSTEM_NOTE } from "./study.mjs";

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

// Save the most recent uploaded frame (original and enhanced) for debugging.
const LAST_SNAP_PATH = path.join(process.cwd(), "last_snap.jpg");
const LAST_ENHANCED_PATH = path.join(process.cwd(), "last_enhanced.jpg");

function saveLastSnap(buf) {
  try {
    fs.writeFileSync(LAST_SNAP_PATH, buf);
  } catch (e) {
    console.warn("saveLastSnap failed:", e.message);
  }
}

// ---------------------------------------------------------------------------
//  Image orientation — set on Render, no code change or reflash needed.
//
//    IMAGE_ROTATE   0 | 90 | 180 | 270   (degrees clockwise, default 90)
//    IMAGE_FLIP_H   1 = mirror left/right
//    IMAGE_FLIP_V   1 = mirror top/bottom
//
//  Applied once on arrival, so Claude, /gpt/last and Drive all get the same
//  corrected image. With none set, the original bytes pass through untouched.
// ---------------------------------------------------------------------------
async function orientImage(buf) {
  // Default 90 deg clockwise: the camera is mounted sideways in the calc.
  // Override on Render with IMAGE_ROTATE (0 to disable, 270 for the other way).
  const rot = parseInt(process.env.IMAGE_ROTATE ?? "90", 10) || 0;
  const flipH = process.env.IMAGE_FLIP_H === "1";
  const flipV = process.env.IMAGE_FLIP_V === "1";
  if (!rot && !flipH && !flipV) return buf;
  try {
    let img = sharp(buf);
    if (rot) img = img.rotate(rot);
    if (flipH) img = img.flop();    // horizontal mirror
    if (flipV) img = img.flip();    // vertical mirror
    return await img.jpeg({ quality: 92 }).toBuffer();
  } catch (e) {
    console.warn("orientImage failed, using original:", e.message);
    return buf;
  }
}

// ---------------------------------------------------------------------------
//  Google Drive backup
//
//  Each captured photo is also sent to a Google Apps Script web app
//  (drive_upload.gs) that saves it into your Drive folder, with Claude's
//  answer as the file description. Runs as YOU, so it uses your Drive storage
//  (a Google service account can't upload into a personal Gmail Drive).
//
//  Fire-and-forget: never delays the calculator's answer, and a failure is
//  only logged. Disabled unless DRIVE_UPLOAD_URL and DRIVE_UPLOAD_SECRET are
//  set on Render.
// ---------------------------------------------------------------------------
function uploadToDrive(buf, kind, description = "") {
  const url = process.env.DRIVE_UPLOAD_URL;
  const secret = process.env.DRIVE_UPLOAD_SECRET;
  if (!url || !secret || !buf || !buf.length) return;

  const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "");
  const payload = JSON.stringify({
    secret,
    name: `ti32_${kind}_${ts}.jpg`,
    image: Buffer.from(buf).toString("base64"),
    description: String(description ?? ""),
  });

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    redirect: "follow",
  })
    .then((r) => r.text())
    .then((t) => console.log(`drive upload (${kind}): ${t.slice(0, 200)}`))
    .catch((e) => console.warn(`drive upload (${kind}) failed: ${e.message}`));
}

// ---------------------------------------------------------------------------
//  TI-84 Plus screen fitting
//
//  The TI-84 Plus home screen is 96x64 pixels = exactly 16 characters wide
//  by 8 rows (6x8 px per character cell). The CAMERA program uses rows 1-6
//  for text and reserves row 8 for the nav hint, so one page is
//  6 rows x 16 cols = 96 characters.
//
//  We word-wrap here on the server and pad every line to exactly 16 chars.
//  That way the calculator can slice the string into fixed 16-char rows with
//  sub() and nothing ever breaks mid-word or runs off the right edge.
// ---------------------------------------------------------------------------
const CALC_COLS = 16;
const CALC_TEXT_ROWS = 6;
export const CALC_PAGE_CHARS = CALC_COLS * CALC_TEXT_ROWS; // 96

function wrapForCalc(text) {
  const words = String(text ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  const lines = [];
  let cur = "";

  for (const w of words) {
    if (w.length > CALC_COLS) {
      // A single token too long for one row — hard-break it.
      if (cur) { lines.push(cur); cur = ""; }
      let rest = w;
      while (rest.length > CALC_COLS) {
        lines.push(rest.slice(0, CALC_COLS));
        rest = rest.slice(CALC_COLS);
      }
      cur = rest;
      continue;
    }
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= CALC_COLS) cur += " " + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);

  // Pad every line to exactly CALC_COLS so the calculator's fixed-width
  // slicing lines up, then concatenate with no separators.
  return lines.map((l) => l.padEnd(CALC_COLS, " ")).join("");
}

// Server-side enhancement pipeline for OV2640 frames before they go to Claude.
// The OV2640 + tiny aperture + handheld setup produces images that are dark,
// soft, and grainy in typical indoor light. Sharp can recover a lot of that:
//   - linear() applies a contrast stretch / brightness boost
//   - normalise() auto-levels the histogram (rescues underexposed text)
//   - sharpen() puts edge definition back into soft images
//   - greyscale() removes color noise, makes text easier for vision models
//   - median() small denoise pass
// Returns a Buffer of the enhanced JPEG.
async function enhanceForVision(inputBuf) {
  return sharp(inputBuf)
    .rotate()                          // honor EXIF orientation if any
    .greyscale()
    .normalise()                       // auto-levels (this is the big one)
    .linear(1.15, -8)                  // mild brightness/contrast push
    .median(1)                         // 1-pixel median = gentle denoise
    .sharpen({ sigma: 1.2, m1: 0.5, m2: 2.0 }) // unsharp mask, edge-preserving
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

const SYSTEM_PROMPT_ASK =
  "You are answering a question shown on a TI-84 calculator screen. " +
  "The screen shows 16 characters per line and 6 lines at a time, so aim for " +
  "under 90 characters total. Plain ASCII only - no emojis, no markdown, no " +
  "special symbols. Be direct: give the answer, not a preamble. " +
  "CHARACTER RULES: the calculator can only show letters, digits, spaces and " +
  "these symbols: ! \" ' ( ) * + , - . / : < = > ? [ ] ^ . Never use any other " +
  "symbol. Write ohm, pi, sqrt(), x^2, >=, and // for parallel resistors. " +
  "No bullet lists or line breaks - write in plain sentences.";

const SYSTEM_PROMPT_SOLVE =
  "You are a math/science tutor answering a question shown in a photo. " +
  "Your answer is displayed on a TI-84 calculator: 16 characters per line, " +
  "6 lines visible at a time. Keep the whole reply under 90 characters if you " +
  "possibly can. If the question is multiple choice, reply with just the letter. " +
  "Otherwise give the final answer, plus at most one very short sentence of work. " +
  "Plain ASCII only - no emojis, no markdown, no special symbols. " +
  "CHARACTER RULES: the calculator can only show letters, digits, spaces and " +
  "these symbols: ! \" ' ( ) * + , - . / : < = > ? [ ] ^ . Never use any other " +
  "symbol. Write ohm, pi, sqrt(), x^2, >=, and // for parallel resistors. " +
  "No bullet lists or line breaks - write in plain sentences.";

const SYSTEM_PROMPT_CHAT =
  "You are a math/science tutor having a follow-up conversation about a " +
  "question the user photographed earlier (the photo is the first message). " +
  "Your reply is shown on a TI-84 calculator: 16 characters per line, 6 lines " +
  "per screen. Be brief and direct - aim for under 90 characters unless the " +
  "user explicitly asks for more detail. Plain ASCII only: no emojis, no " +
  "markdown, no special symbols (write x^2, sqrt, pi, >= instead). " +
  "The user types on a calculator keypad, so their questions may be in all " +
  "caps and tersely worded. " +
  "CHARACTER RULES: the calculator can only show letters, digits, spaces and " +
  "these symbols: ! \" ' ( ) * + , - . / : < = > ? [ ] ^ . Never use any other " +
  "symbol. Write ohm, pi, sqrt(), x^2, >=, and // for parallel resistors. " +
  "No bullet lists or line breaks - write in plain sentences.";

const SYSTEM_PROMPT_EXPLAIN =
  "You are a math/science tutor. The user photographed a problem (first " +
  "message) and got a short answer. Now give a complete worked solution: " +
  "identify what the problem is asking, state the method, and show each step " +
  "with the numbers, ending with the final answer. If the short answer was " +
  "wrong, say so and correct it. Your reply is read on a TI-84 calculator, " +
  "16 characters per line, paged 6 lines at a time, so be thorough but " +
  "economical: aim for 300-700 characters. Plain sentences, no markdown, no " +
  "bullet lists, no line breaks. " +
  "CHARACTER RULES: the calculator can only show letters, digits, spaces and " +
  "these symbols: ! \" ' ( ) * + , - . / : < = > ? [ ] ^ . Never use any other " +
  "symbol. Write ohm, pi, sqrt(), x^2, >=, e^(-t/2), and // for parallel resistors.";

// Conversation memory for CHAT. Reset every time a new photo is solved, so
// follow-ups always refer to the most recent question. Lives in process
// memory only (clears on a Render restart — fine for this use).
let chatHistory = [];          // Anthropic messages array
const CHAT_MAX_TURNS = 6;      // follow-up exchanges kept after the photo turn

const USE_OPENAI_ASK = process.env.USE_OPENAI === "1" || process.env.USE_OPENAI_FOR_ASK === "1";
const USE_OPENAI_SOLVE = process.env.USE_OPENAI === "1" || process.env.USE_OPENAI_FOR_SOLVE === "1";

// Pull the text out of a Claude response. Current models think before they
// answer (adaptive thinking) and that thinking counts against max_tokens, so
// a too-small budget can yield thinking blocks and NO text. When that
// happens, say why instead of a bare "no response".
function textFrom(result) {
  const blocks = result?.content ?? [];
  const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
  console.log(`claude: stop=${result?.stop_reason} blocks=[${blocks.map((b) => b.type).join(",")}] ` +
              `in=${result?.usage?.input_tokens} out=${result?.usage?.output_tokens} ` +
              `cache_write=${result?.usage?.cache_creation_input_tokens ?? 0} cache_read=${result?.usage?.cache_read_input_tokens ?? 0}`);
  if (text) return text;
  return `No answer from Claude (stop reason: ${result?.stop_reason ?? "unknown"}).`;
}

export async function chatgpt() {
  const routes = express.Router();

  // Lazily build clients so a missing key for the provider you're NOT using
  // doesn't crash the whole server at startup.
  let _openai = null;
  let _anthropic = null;

  async function getOpenAI() {
    if (_openai) return _openai;
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    const openai = await import("openai");
    _openai = new openai.default.OpenAI();
    return _openai;
  }

  async function getAnthropic() {
    if (_anthropic) return _anthropic;
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    const Anthropic = await import("@anthropic-ai/sdk");
    _anthropic = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    return _anthropic;
  }

  // --------------------------------------------------------------------------
  // GET /gpt/ask — text question, plain answer
  // --------------------------------------------------------------------------
  routes.get("/ask", async (req, res) => {
    const question = req.query.question ?? "";
    if (Array.isArray(question)) {
      res.sendStatus(400);
      return;
    }
    try {
      let answer;
      if (USE_OPENAI_ASK) {
        const gpt = await getOpenAI();
        const result = await gpt.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: SYSTEM_PROMPT_ASK },
            { role: "user", content: String(question) },
          ],
        });
        answer = result.choices[0]?.message?.content ?? "no response";
      } else {
        const client = await getAnthropic();
        const result = await client.messages.create({
          model: ANTHROPIC_MODEL,
          max_tokens: 8000,
          system: SYSTEM_PROMPT_ASK + STUDY_SYSTEM_NOTE,
          messages: withStudy([{ role: "user", content: String(question) }]),
        });
        answer = textFrom(result);
      }
      res.send(wrapForCalc(answer));
    } catch (e) {
      console.error(e);
      res.status(500).send(String(e?.message ?? e));
    }
  });

  // --------------------------------------------------------------------------
  // POST /gpt/snap — debug, no API call
  // --------------------------------------------------------------------------
  routes.post("/snap", async (req, res) => {
    const ct = req.headers["content-type"];
    const bodyLen = req.body?.length ?? 0;
    const bodyType = Buffer.isBuffer(req.body) ? "Buffer" : typeof req.body;
    console.log(`/snap hit  ct="${ct}"  bodyType=${bodyType}  bodyLen=${bodyLen}`);

    const ctLower = (ct || "").toLowerCase();
    if (!ctLower.startsWith("image/") && ctLower !== "application/octet-stream") {
      console.log("/snap reject: bad content-type");
      res.status(400).send(`bad content-type: ${ct}`);
      return;
    }
    if (!req.body || !req.body.length) {
      console.log("/snap reject: empty body");
      res.status(400).send("no image body");
      return;
    }
    const img = await orientImage(req.body);
    saveLastSnap(img);
    console.log(`/snap ok ${bodyLen} bytes (saved to ${LAST_SNAP_PATH})`);
    uploadToDrive(img, "snap");
    res.send(`snap ok: ${bodyLen} bytes`);
  });

  // --------------------------------------------------------------------------
  // GET /gpt/last  — serve back the most recent uploaded frame as a JPEG.
  // Open https://YOUR-RENDER-URL/gpt/last in a browser to see what the
  // camera last captured. Useful for sanity-checking lens orientation,
  // focus, and whether the image is what Claude is being asked to read.
  // --------------------------------------------------------------------------
  routes.get("/last", (req, res) => {
    if (!fs.existsSync(LAST_SNAP_PATH)) {
      res.status(404).send("no snap yet");
      return;
    }
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(LAST_SNAP_PATH);
  });

  // Same idea, but the post-processed version sent to Claude.
  routes.get("/last-enhanced", (req, res) => {
    if (!fs.existsSync(LAST_ENHANCED_PATH)) {
      res.status(404).send("no enhanced snap yet (run /solve first)");
      return;
    }
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(LAST_ENHANCED_PATH);
  });

  // --------------------------------------------------------------------------
  // POST /gpt/solve — image -> vision answer
  // --------------------------------------------------------------------------
  routes.post("/solve", async (req, res) => {
    try {
      const ct = req.headers["content-type"];
      console.log("content-type:", ct);
      // Accept image/jpg, image/jpeg, or application/octet-stream — proxies
      // and clients label JPEGs inconsistently.
      const ctLower = (ct || "").toLowerCase();
      if (!ctLower.startsWith("image/") && ctLower !== "application/octet-stream") {
        res.status(400).send(`bad content-type: ${ct}`);
        return;
      }
      if (!req.body || !req.body.length) {
        res.status(400).send("no image body");
        return;
      }

      const questionNumber = req.query.n;
      const userText = questionNumber
        ? `What is the answer to question ${questionNumber}?`
        : "What is the answer to this question?";

      const img = await orientImage(req.body);
      saveLastSnap(img);
      const base64Image = Buffer.from(img).toString("base64");
      console.log(`/solve got ${req.body.length} bytes, base64=${base64Image.length}`);

      let answer;
      if (USE_OPENAI_SOLVE) {
        const gpt = await getOpenAI();
        const result = await gpt.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: SYSTEM_PROMPT_SOLVE },
            {
              role: "user",
              content: [
                { type: "text", text: userText },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`,
                    detail: "high",
                  },
                },
              ],
            },
          ],
        });
        answer = result.choices[0]?.message?.content ?? "no response";
      } else {
        const client = await getAnthropic();
        const result = await client.messages.create({
          model: ANTHROPIC_MODEL,
          max_tokens: 8000,
          system: SYSTEM_PROMPT_SOLVE + STUDY_SYSTEM_NOTE,
          messages: withStudy([
            {
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/jpeg",
                    data: base64Image,
                  },
                },
                { type: "text", text: userText },
              ],
            },
          ]),
        });
        answer = textFrom(result);
      }

      console.log("answer:", answer);
      uploadToDrive(img, "solve", `Q: ${userText}\n\nA: ${answer}`);

      // Seed CHAT with this photo and answer so follow-ups have context.
      chatHistory = [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Image } },
            { type: "text", text: userText },
          ],
        },
        { role: "assistant", content: answer },
      ];

      res.send(wrapForCalc(answer));
    } catch (e) {
      uploadToDrive(req.body, "solve-error", `error: ${e?.message ?? e}`);
      console.error(e);
      res.status(500).send(String(e?.message ?? e));
    }
  });

  // --------------------------------------------------------------------------
  // GET /gpt/chat?question=...  — follow-up about the most recent photo.
  // Claude sees the original image, its first answer, and prior follow-ups.
  // If nothing has been solved yet, it just answers the question directly.
  // --------------------------------------------------------------------------
  routes.get("/chat", async (req, res) => {
    const question = String(req.query.question ?? "").trim();
    if (!question) {
      res.send(wrapForCalc("Type a question first."));
      return;
    }
    try {
      const client = await getAnthropic();
      const hasPhoto = chatHistory.length > 0;
      const messages = hasPhoto
        ? [...chatHistory, { role: "user", content: question }]
        : [{ role: "user", content: question }];

      const result = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 8000,
        system: (hasPhoto ? SYSTEM_PROMPT_CHAT : SYSTEM_PROMPT_ASK) + STUDY_SYSTEM_NOTE,
        messages: withStudy(messages),
      });
      const answer = textFrom(result);

      if (hasPhoto) {
        chatHistory.push({ role: "user", content: question });
        chatHistory.push({ role: "assistant", content: answer });
        // Keep the photo turn (first 2 messages) + the most recent follow-ups.
        const tail = chatHistory.slice(2).slice(-CHAT_MAX_TURNS * 2);
        chatHistory = [...chatHistory.slice(0, 2), ...tail];
      }

      console.log(`/chat q="${question}" -> ${answer}`);
      res.send(wrapForCalc(answer));
    } catch (e) {
      console.error(e);
      res.status(500).send(String(e?.message ?? e));
    }
  });

  // --------------------------------------------------------------------------
  // GET /gpt/explain — full worked solution for the most recent photo.
  // Reuses the photo + short answer from the last /solve (same memory CHAT
  // uses), and appends the explanation so CHAT follow-ups can refer to it.
  // --------------------------------------------------------------------------
  routes.get("/explain", async (req, res) => {
    if (chatHistory.length === 0) {
      res.send(wrapForCalc("Solve a problem first, then pick EXPLAIN."));
      return;
    }
    try {
      const client = await getAnthropic();
      const ask = "Explain the full solution step by step.";
      const result = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT_EXPLAIN + STUDY_SYSTEM_NOTE,
        messages: withStudy([...chatHistory, { role: "user", content: ask }]),
      });
      const answer = textFrom(result);

      chatHistory.push({ role: "user", content: ask });
      chatHistory.push({ role: "assistant", content: answer });
      const tail = chatHistory.slice(2).slice(-CHAT_MAX_TURNS * 2);
      chatHistory = [...chatHistory.slice(0, 2), ...tail];

      console.log(`/explain -> ${answer.length} chars: ${answer}`);
      res.send(wrapForCalc(answer));
    } catch (e) {
      console.error(e);
      res.status(500).send(String(e?.message ?? e));
    }
  });

  // --------------------------------------------------------------------------
  // GET /gpt/study — what course material is loaded (open in a browser)
  // --------------------------------------------------------------------------
  routes.get("/study", (req, res) => {
    const st = loadStudy();
    res.json({
      topic: st.topic,
      folder: st.dir,
      totalKB: Math.round(st.totalBytes / 1024),
      files: st.files.map((f) => ({ name: f.name, KB: Math.round(f.size / 1024), ...(f.skipped ? { skipped: f.skipped } : {}) })),
    });
  });

  return routes;
}
