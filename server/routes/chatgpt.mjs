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

// ---- Kimi (Moonshot AI) as a second SOLVE option ----------------------------
// Kimi offers an Anthropic-compatible endpoint, so the same request format
// (system prompt + photo + text) works with only a different base URL and key.
// Set KIMI_API_KEY on Render. Optional: KIMI_MODEL, KIMI_EFFORT, KIMI_BASE_URL.
//   KIMI_MODEL   pin one model; otherwise the server tries KIMI_MODELS in order
//                and keeps the first one this account is allowed to use
//                (free-tier accounts can't use every model).
//   KIMI_EFFORT  low (default, fastest) | high | max  (how long Kimi reasons)
const KIMI_MODELS = process.env.KIMI_MODEL
  ? [process.env.KIMI_MODEL]
  : ["kimi-k3", "kimi-k3.1-pro", "kimi-k3.1-pro-highspeed"];
let kimiModel = null;          // the model that worked, remembered after the first success
const KIMI_EFFORT = process.env.KIMI_EFFORT ?? "low";
const KIMI_BASE_URL = process.env.KIMI_BASE_URL ?? "https://api.moonshot.ai/anthropic";

// Kimi's Anthropic-compatible API takes text and image blocks but not PDF
// "document" blocks, and ignores cache_control inside messages. Swap any PDF
// study files for a short note and drop the cache markers.
function forKimi(messages) {
  return messages.map((m) => {
    if (typeof m.content === "string") return m;
    const content = m.content.map((b) => {
      if (b.type === "document") {
        return { type: "text", text: "[A PDF study file is attached for Claude but cannot be read by Kimi.]" };
      }
      const { cache_control, ...rest } = b;
      return rest;
    });
    return { ...m, content };
  });
}

// Send a request to Kimi, trying each model in KIMI_MODELS until one is
// allowed for this account ("Not found the model ... or Permission denied"
// = 404). The model that works is remembered for later requests.
async function kimiCreate(kimi, params) {
  const order = kimiModel ? [kimiModel, ...KIMI_MODELS.filter((m) => m !== kimiModel)] : KIMI_MODELS;
  let lastErr;
  for (const model of order) {
    try {
      const result = await kimi.messages.create({ ...params, model });
      if (kimiModel !== model) console.log(`kimi: using model ${model}`);
      kimiModel = model;
      return result;
    } catch (e) {
      const notAllowed = e?.status === 404 || /not found the model|permission denied/i.test(String(e?.message));
      if (!notAllowed) throw e;
      console.log(`kimi: model ${model} not available for this account, trying next`);
      lastErr = e;
    }
  }
  throw new Error(`No Kimi model available for this account (tried ${order.join(", ")}). ` +
                  `Check the Kimi console for which models your plan allows. ${lastErr?.message ?? ""}`);
}

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
//    IMAGE_ROTATE   0 | 90 | 180 | 270   (degrees clockwise, default 270)
//    IMAGE_FLIP_H   1 = mirror left/right
//    IMAGE_FLIP_V   1 = mirror top/bottom
//    IMAGE_ZOOM     extra centre crop for >=2000px photos (default 1 = off; zoom now happens in the camera firmware)
//
//  Applied once on arrival, so Claude, /gpt/last and Drive all get the same
//  corrected image. With none set, the original bytes pass through untouched.
// ---------------------------------------------------------------------------
async function orientImage(buf) {
  // Default 270 deg clockwise: the camera is mounted sideways in the calc.
  // Override on Render with IMAGE_ROTATE (0 to disable, 90 for the other way).
  const rot = parseInt(process.env.IMAGE_ROTATE ?? "270", 10) || 0;
  const flipH = process.env.IMAGE_FLIP_H === "1";
  const flipV = process.env.IMAGE_FLIP_V === "1";
  // Digital zoom for the 5 MP wide-angle camera: keep the centre 1/ZOOM of
  // the frame. Only applied to high-res photos (long edge >= IMAGE_ZOOM_MIN,
  // default 2000 px) so lower-res calculators (e.g. TWO at 1280x1024) are
  // never cropped. 1.6 turns 2560x1920 into 1600x1200, about the largest
  // image Claude reads without shrinking it.
  const zoom = parseFloat(process.env.IMAGE_ZOOM ?? "1") || 1;
  const zoomMin = parseInt(process.env.IMAGE_ZOOM_MIN ?? "2000", 10) || 2000;
  try {
    let out = buf;
    if (rot || flipH || flipV) {
      let img = sharp(buf);
      if (rot) img = img.rotate(rot);
      if (flipH) img = img.flop();    // horizontal mirror
      if (flipV) img = img.flip();    // vertical mirror
      out = await img.jpeg({ quality: 92 }).toBuffer();
    }
    if (zoom > 1) {
      const { width, height } = await sharp(out).metadata();
      if (Math.max(width, height) >= zoomMin) {
        const w = Math.round(width / zoom);
        const h = Math.round(height / zoom);
        const left = Math.round((width - w) / 2);
        const top = Math.round((height - h) / 2);
        out = await sharp(out).extract({ left, top, width: w, height: h }).jpeg({ quality: 92 }).toBuffer();
        console.log(`zoom ${zoom}x: ${width}x${height} -> ${w}x${h}`);
      }
    }
    return out;
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
  "6 lines visible at a time, paged. Start with the final answer, then give the " +
  "key working: the method and the main steps with numbers. Aim for 300-700 " +
  "characters. If the question is multiple choice, start with the letter. " +
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

// MISTAKE mode (research): generate a worked solution containing a realistic,
// typical student error at a chosen severity, ALWAYS followed by a labeled
// error key, so the samples can be studied and can't pass as a real answer.
const MISTAKE_LEVELS = {
  1: "SMALL COMPUTATION ERROR: use the correct method throughout, but make one " +
     "small slip partway through (an arithmetic error, a dropped negative sign, " +
     "a unit conversion slip, or a misread value) and carry it consistently to " +
     "a wrong final answer.",
  2: "PARTLY WRONG: set the problem up correctly, then make one realistic " +
     "method error that students commonly make in this topic (wrong formula, " +
     "misapplied rule, wrong sign convention, missing term) and carry it " +
     "consistently to a wrong final answer.",
  3: "MOSTLY WRONG: make a fundamental conceptual mistake near the start, the " +
     "kind a student who misunderstands the core idea would make, and carry it " +
     "consistently through to a wrong final answer.",
};

function mistakePrompt(level, length = "800-1500 characters for the solution plus a short ERROR KEY") {
  return (
    "You help an education research project that studies how students get " +
    "problems wrong. The user photographed a problem (first message). Write a " +
    "worked solution the way a real student would, containing exactly this " +
    "kind of error: " + MISTAKE_LEVELS[level] + " The error must be one a real " +
    "student plausibly makes, not random. Show each step with numbers. " +
    "After the solution ALWAYS end with a section that begins with the exact " +
    "words ERROR KEY: and states which step has the error, what the error is, " +
    "the error category, and the correct final answer. Never omit the ERROR KEY. " +
    "Your reply is read on a TI-84 calculator, 16 characters per line, paged " +
    "6 lines at a time. Aim for " + length + ". Plain sentences, no markdown, no bullet lists, no line " +
    "breaks. " +
    "CHARACTER RULES: the calculator can only show letters, digits, spaces and " +
    "these symbols: ! \" ' ( ) * + , - . / : < = > ? [ ] ^ . Never use any other " +
    "symbol. Write ohm, pi, sqrt(), x^2, >=, e^(-t/2), and // for parallel resistors."
  );
}

// Model for MISTAKE samples. The CHAT shortcut (1/2/3) must answer inside the
// old firmware's 30 s CHAT timeout, so default to the faster Sonnet.
// Override on Render with MISTAKE_MODEL.
const MISTAKE_MODEL = process.env.MISTAKE_MODEL ?? "claude-sonnet-5-5";

async function generateMistake(client, level, length, target) {
  const ask = target
    ? `Only do question ${target} from the photo (ignore the other questions). ` +
      "Write the student-style solution with the error, then the ERROR KEY."
    : "Write the student-style solution with the error, then the ERROR KEY.";
  const result = await client.messages.create({
    model: MISTAKE_MODEL,
    max_tokens: 16000,
    system: mistakePrompt(level, length) + STUDY_SYSTEM_NOTE,
    messages: withStudy([...chatHistory.slice(0, 2), { role: "user", content: ask }]),
  });
  let answer = textFrom(result);
  // Guarantee the key is there even if the model forgets it.
  if (!/ERROR KEY:/i.test(answer)) {
    answer += " ERROR KEY: missing from this sample. Treat this solution as containing an intentional error.";
  }
  return answer;
}

const SYSTEM_PROMPT_EXPLAIN =
  "You are a math/science tutor. The user photographed a problem (first " +
  "message) and got a short answer. Now give a complete worked solution: " +
  "identify what the problem is asking, state the method, and show each step " +
  "with the numbers, ending with the final answer. If the short answer was " +
  "wrong, say so and correct it. Your reply is read on a TI-84 calculator, " +
  "16 characters per line, paged 6 lines at a time. Be thorough: explain why " +
  "each step works, not just what it is, and mention common mistakes to avoid. " +
  "Aim for 800-1500 characters. Plain sentences, no markdown, no " +
  "bullet lists, no line breaks. " +
  "CHARACTER RULES: the calculator can only show letters, digits, spaces and " +
  "these symbols: ! \" ' ( ) * + , - . / : < = > ? [ ] ^ . Never use any other " +
  "symbol. Write ohm, pi, sqrt(), x^2, >=, e^(-t/2), and // for parallel resistors.";

// Conversation memory for CHAT. Reset every time a new photo is solved, so
// follow-ups always refer to the most recent question. Lives in process
// memory only (clears on a Render restart — fine for this use).
let chatHistory = [];          // Anthropic messages array

// ---- Latest answer, kept on the server --------------------------------------
// If the calculator times out, Claude is usually still working and the answer
// arrives on the server a bit later. The calculator's CHECK SERVER button
// (CHAT with the word LATEST) fetches it from here. Shared by all calculators.
let latest = { kind: "", text: "", at: 0 };
let job = null;                // { kind, at } while a request is in progress

function startJob(kind) { job = { kind, at: Date.now() }; }
function remember(kind, text) {
  latest = { kind, text, at: Date.now() };
  if (job && job.kind === kind) job = null;
}
function jobFailed(kind, e) {
  remember(kind, `ERROR: ${e?.message ?? e}`);
}
function agoText(ms) {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s} SEC AGO`;
  const m = Math.round(s / 60);
  return m < 90 ? `${m} MIN AGO` : `${Math.round(m / 60)} HR AGO`;
}
function latestReport() {
  if (job && job.at >= latest.at) {
    return `STILL WORKING ON ${job.kind}, STARTED ${agoText(Date.now() - job.at)}. ` +
           "CHECK AGAIN IN 15 SEC.";
  }
  if (!latest.text) {
    return "NO ANSWER ON THE SERVER YET. (IT RESETS WHEN THE SERVER RESTARTS.)";
  }
  return `LATEST ${latest.kind}, ${agoText(Date.now() - latest.at)}: ${latest.text}`;
}
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

  let _kimi = null;
  function aiPaused() {
    return process.env.AI_PAUSED ? process.env.AI_PAUSED !== "0" : false;
  }
  const PAUSED_CLIENT = {
    messages: {
      create: async () => ({
        stop_reason: "ai_paused",
        content: [{ type: "text", text: "AI PAUSED FOR TESTING. REQUEST REACHED THE SERVER OK." }],
        usage: { input_tokens: 0, output_tokens: 0 },
      }),
    },
  };

  async function getKimi() {
    if (aiPaused()) {
      console.log("AI paused: skipping Kimi call");
      return PAUSED_CLIENT;
    }
    if (_kimi) return _kimi;
    if (!process.env.KIMI_API_KEY) {
      throw new Error("KIMI_API_KEY is not set on Render");
    }
    const Anthropic = await import("@anthropic-ai/sdk");
    // Kimi's docs use "Authorization: Bearer"; the SDK sends x-api-key.
    // Send both so either works.
    _kimi = new Anthropic.default({
      apiKey: process.env.KIMI_API_KEY,
      baseURL: KIMI_BASE_URL,
      defaultHeaders: { Authorization: `Bearer ${process.env.KIMI_API_KEY}` },
    });
    return _kimi;
  }

  async function getAnthropic() {
    // TESTING SWITCH: while AI_PAUSED is true, no request goes to Claude (no
    // API cost). Every route still runs normally (photo saved, rotated,
    // uploaded to Drive, history kept) and the calculator gets a short
    // "AI PAUSED" reply. Set AI_PAUSED back to false (or set AI_PAUSED=0 on
    // Render) to turn Claude back on.
    const AI_PAUSED = process.env.AI_PAUSED
      ? process.env.AI_PAUSED !== "0"
      : false; // <-- set to true to pause Claude again for testing
    if (AI_PAUSED) {
      console.log("AI paused: skipping Claude call");
      return {
        messages: {
          create: async () => ({
            stop_reason: "ai_paused",
            content: [{ type: "text", text: "AI PAUSED FOR TESTING. REQUEST REACHED THE SERVER OK." }],
            usage: { input_tokens: 0, output_tokens: 0 },
          }),
        },
      };
    }
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

      // Which AI answers: the calculator picks CLAUDE or KIMI in the SOLVE
      // menu. Existing firmware can only send a question number, so KIMI is
      // sent as n = 1000 + question number (1000 = Kimi, no number). ?ai=kimi
      // also works.
      let n = parseInt(req.query.n ?? "0", 10) || 0;
      let provider = String(req.query.ai ?? "").toLowerCase() === "kimi" ? "kimi" : "claude";
      if (n >= 1000) { provider = "kimi"; n -= 1000; }
      const questionNumber = n > 0 ? n : null;
      const jobName = provider === "kimi" ? "SOLVE (KIMI)" : "SOLVE";
      startJob(jobName);
      const userText = questionNumber
        ? `What is the answer to question ${questionNumber}?`
        : "What is the answer to this question?";

      const img = await orientImage(req.body);
      saveLastSnap(img);
      const base64Image = Buffer.from(img).toString("base64");
      console.log(`/solve got ${req.body.length} bytes, base64=${base64Image.length}`);

      let answer;
      if (provider === "kimi") {
        const kimi = await getKimi();
        const result = await kimiCreate(kimi, {
          max_tokens: 16000,
          output_config: { effort: KIMI_EFFORT },
          system: SYSTEM_PROMPT_SOLVE + STUDY_SYSTEM_NOTE,
          messages: forKimi(withStudy([
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Image } },
                { type: "text", text: userText },
              ],
            },
          ])),
        });
        console.log(`kimi: model=${kimiModel} effort=${KIMI_EFFORT}`);
        answer = textFrom(result);
      } else if (USE_OPENAI_SOLVE) {
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
          max_tokens: 16000,
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
      uploadToDrive(img, provider === "kimi" ? "solve-kimi" : "solve", `AI: ${provider}\nQ: ${userText}\n\nA: ${answer}`);

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

      // Label Kimi answers on the calculator so you know which AI answered.
      const shown = provider === "kimi" ? `KIMI: ${answer}` : answer;
      remember(jobName, shown);
      res.send(wrapForCalc(shown));
    } catch (e) {
      uploadToDrive(req.body, "solve-error", `error: ${e?.message ?? e}`);
      jobFailed(job?.kind ?? "SOLVE", e);
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

    // CHECK SERVER: "LATEST" returns the most recent answer the server
    // finished (or says it's still working), without calling Claude.
    if (/^LATEST$/i.test(question)) {
      const report = latestReport();
      console.log(`/chat LATEST -> ${report.slice(0, 120)}`);
      res.send(wrapForCalc(report));
      return;
    }

    // MISTAKE shortcut for firmware without the MISTAKE command: typing just
    // 1, 2 or 3 in CHAT generates a research sample for the last photo.
    const SHORTCUTS = {
      "1": { level: 3, label: "MOSTLY WRONG: " },
      "2": { level: 2, label: "PARTLY WRONG: " },
      "3": { level: 1, label: "SMALL CALC ERR: " },
    };
    // Accepts "1", "1 Q10A", "1 FOR Q10A", "2 for 9b", ...
    const sc = question.match(/^([123])(?:\s+(?:FOR\s+)?(.+))?$/i);
    if (sc) {
      const { level, label: baseLabel } = SHORTCUTS[sc[1]];
      const target = sc[2] ? sc[2].trim().toUpperCase() : "";
      const label = target ? baseLabel.replace(": ", ` ${target}: `) : baseLabel;
      if (chatHistory.length === 0) {
        res.send(wrapForCalc("Solve a problem first, then send 1, 2 or 3 (optionally + question, e.g. 1 Q10A) in CHAT."));
        return;
      }
      const kind = label.replace(/:\s*$/, "");
      startJob(kind);
      try {
        const client = await getAnthropic();
        // Shorter than the full MISTAKE route so it fits CHAT's 30 s timeout.
        const answer = label + await generateMistake(
          client, level, "400-700 characters for the solution plus a one-sentence ERROR KEY", target);
        console.log(`/chat shortcut ${question} -> ${answer.length} chars: ${answer}`);
        remember(kind, answer);
        res.send(wrapForCalc(answer));
      } catch (e) {
        jobFailed(kind, e);
        console.error(e);
        res.status(500).send(String(e?.message ?? e));
      }
      return;
    }

    startJob("CHAT");
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
      remember("CHAT", answer);
      res.send(wrapForCalc(answer));
    } catch (e) {
      jobFailed("CHAT", e);
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
    startJob("EXPLAIN");
    try {
      const client = await getAnthropic();
      const ask = "Explain the full solution step by step.";
      const result = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 32000,
        system: SYSTEM_PROMPT_EXPLAIN + STUDY_SYSTEM_NOTE,
        messages: withStudy([...chatHistory, { role: "user", content: ask }]),
      });
      const answer = textFrom(result);

      chatHistory.push({ role: "user", content: ask });
      chatHistory.push({ role: "assistant", content: answer });
      const tail = chatHistory.slice(2).slice(-CHAT_MAX_TURNS * 2);
      chatHistory = [...chatHistory.slice(0, 2), ...tail];

      console.log(`/explain -> ${answer.length} chars: ${answer}`);
      remember("EXPLAIN", answer);
      res.send(wrapForCalc(answer));
    } catch (e) {
      jobFailed("EXPLAIN", e);
      console.error(e);
      res.status(500).send(String(e?.message ?? e));
    }
  });

  // GET /gpt/mistake?level=1|2|3  (1 small calc error, 2 partly wrong,
  // 3 mostly wrong). Uses the most recent photo. Not added to chatHistory, so
  // CHAT and EXPLAIN keep working from the correct answer.
  routes.get("/mistake", async (req, res) => {
    if (chatHistory.length === 0) {
      res.send(wrapForCalc("Solve a problem first, then pick MISTAKE."));
      return;
    }
    const level = [1, 2, 3].includes(+req.query.level) ? +req.query.level : 1;
    startJob("MISTAKE");
    try {
      const client = await getAnthropic();
      const answer = await generateMistake(client, level);
      console.log(`/mistake level ${level} -> ${answer.length} chars: ${answer}`);
      remember("MISTAKE", answer);
      res.send(wrapForCalc(answer));
    } catch (e) {
      jobFailed("MISTAKE", e);
      console.error(e);
      res.status(500).send(String(e?.message ?? e));
    }
  });

  // --------------------------------------------------------------------------
  // GET /gpt/study — what course material is loaded (open in a browser)
  // --------------------------------------------------------------------------
  // GET /gpt/latest: same as CHECK SERVER, readable in a browser.
  routes.get("/latest", (req, res) => {
    res.type("text/plain").send(latestReport());
  });

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
