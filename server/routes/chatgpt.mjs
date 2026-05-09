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

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";

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
    if (ct !== "image/jpg") {
      res.status(400).send(`bad content-type: ${ct}`);
      return;
    }
    if (!req.body || !req.body.length) {
      res.status(400).send("no image body");
      return;
    }
    const bytes = req.body.length;
    console.log(`/snap got ${bytes} bytes`);
    res.send(`snap ok: ${bytes} bytes`);
  });

  // --------------------------------------------------------------------------
  // POST /gpt/solve — image -> vision answer
  // --------------------------------------------------------------------------
  routes.post("/solve", async (req, res) => {
    try {
      const ct = req.headers["content-type"];
      console.log("content-type:", ct);
      if (ct !== "image/jpg") {
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

      const base64Image = Buffer.from(req.body).toString("base64");
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
