// chatgpt.mjs — patched for camera + Claude vision support
//
// Backwards compatible with the original chromalock TI-32 server:
//   GET  /gpt/ask?question=...     -> text answer (OpenAI gpt-4o)
//   POST /gpt/solve  (image/jpg)   -> Claude vision answer (was: OpenAI gpt-4o)
// New routes added by this patch:
//   POST /gpt/snap   (image/jpg)   -> debug echo of the captured frame size
//                                     (no API call, no token cost)
//
// To use Claude: set ANTHROPIC_API_KEY in your .env or environment.
// To fall back to OpenAI for /solve: set USE_OPENAI_FOR_SOLVE=1 in .env.

import express from "express";
import openai from "openai";
import Anthropic from "@anthropic-ai/sdk";

const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
const SYSTEM_PROMPT_SOLVE =
  "You are a math/science tutor answering a question shown in a photo. " +
  "Reply as briefly as possible. If the question is multiple choice, give the letter only. " +
  "Otherwise give just the final answer plus, at most, one short sentence of work. " +
  "Do not use emojis or markdown. The reader is looking at a tiny calculator screen.";

export async function chatgpt() {
  const routes = express.Router();

  const gpt = new openai.OpenAI();

  // Lazily build Anthropic client; allow the server to start without the key
  // so existing /ask calls keep working if the user hasn't set it up yet.
  let anthropic = null;
  function getAnthropic() {
    if (!anthropic) {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is not set");
      }
      anthropic = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return anthropic;
  }

  // --------------------------------------------------------------------------
  // GET /gpt/ask  — unchanged from original
  // --------------------------------------------------------------------------
  routes.get("/ask", async (req, res) => {
    const question = req.query.question ?? "";
    if (Array.isArray(question)) {
      res.sendStatus(400);
      return;
    }

    try {
      const result = await gpt.chat.completions.create({
        messages: [
          { role: "system", content: "Do not use emojis. " },
          { role: "user", content: question },
        ],
        model: "gpt-4o",
      });
      res.send(result.choices[0]?.message?.content ?? "no response");
    } catch (e) {
      console.error(e);
      res.sendStatus(500);
    }
  });

  // --------------------------------------------------------------------------
  // POST /gpt/snap  — debug endpoint, no API call.
  // Lets you confirm the calculator -> ESP32 -> server image upload chain
  // works before you start spending tokens on /solve.
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
  // POST /gpt/solve  — image -> Claude vision -> short text answer
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

      // Default path: Claude vision.
      // Set USE_OPENAI_FOR_SOLVE=1 in .env to fall back to gpt-4o.
      let answer;
      if (process.env.USE_OPENAI_FOR_SOLVE === "1") {
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
        const client = getAnthropic();
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
        // Claude returns content as an array of blocks; concatenate the text ones.
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
