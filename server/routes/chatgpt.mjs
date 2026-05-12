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
  "You are answering a question for someone reading a tiny calculator screen. " +
  "Be brief. Plain text only — no emojis, no markdown formatting.";

const SYSTEM_PROMPT_SOLVE =
  "You are a math/science tutor answering a question shown in a photo. " +
  "Reply as briefly as possible. If the question is multiple choice, give the letter only. " +
  "Otherwise give just the final answer plus, at most, one short sentence of work. " +
  "Do not use emojis or markdown. The reader is looking at a tiny calculator screen.";

const USE_OPENAI_ASK = process.env.USE_OPENAI === "1" || process.env.USE_OPENAI_FOR_ASK === "1";
const USE_OPENAI_SOLVE = process.env.USE_OPENAI === "1" || process.env.USE_OPENAI_FOR_SOLVE === "1";

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
          max_tokens: 512,
          system: SYSTEM_PROMPT_ASK,
          messages: [{ role: "user", content: String(question) }],
        });
        answer = (result.content ?? [])
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim() || "no response";
      }
      res.send(answer);
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
    saveLastSnap(req.body);
    console.log(`/snap ok ${bodyLen} bytes (saved to ${LAST_SNAP_PATH})`);
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

      saveLastSnap(req.body);

      // Run the enhancement pipeline. If it fails for some reason, fall back
      // to the original bytes — we'd rather get a rough answer than no answer.
      let enhancedBuf;
      try {
        enhancedBuf = await enhanceForVision(req.body);
        fs.writeFileSync(LAST_ENHANCED_PATH, enhancedBuf);
        console.log(`enhanced: ${req.body.length} -> ${enhancedBuf.length} bytes`);
      } catch (e) {
        console.warn("enhance failed, using original:", e.message);
        enhancedBuf = req.body;
      }

      const base64Image = enhancedBuf.toString("base64");
      console.log(`/solve got ${req.body.length} bytes, sending enhanced ${enhancedBuf.length} bytes (base64=${base64Image.length})`);

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
          max_tokens: 512,
          system: SYSTEM_PROMPT_SOLVE,
          messages: [
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
          ],
        });
        answer = (result.content ?? [])
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim() || "no response";
      }

      console.log("answer:", answer);
      res.send(answer);
    } catch (e) {
      console.error(e);
      res.status(500).send(String(e?.message ?? e));
    }
  });

  return routes;
}
