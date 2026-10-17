import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import morgan from "morgan";
import dot from "dotenv";
import https from "node:https";
import { chatgpt } from "./routes/chatgpt.mjs";
import { images } from "./routes/images.mjs";
import { chat } from "./routes/chat.mjs";
// programs.mjs imports ../../prepare8xp.mjs which is missing from the repo —
// disabled until we either restore that file or rewrite the route.
// import { programs } from "./routes/programs.mjs";
// import { googleApi } from "./routes/googleApi.mjs";
dot.config();

async function main() {
  const port = +(process.env.PORT ?? 8080);
  if (!port || !Number.isInteger(port)) {
    console.error("bad port");
    process.exit(1);
  }

  const app = express();

  // Tiny health route for the keep-alive ping below. Registered before the
  // loggers so the pings don't clutter the Render logs.
  app.get("/ping", (req, res) => res.send("ok"));

  app.use(morgan("dev"));
  app.use(cors("*"));
  // Accept any image/* content-type AND application/octet-stream — different
  // proxies (and the ESP32) label JPEGs differently. Render's edge proxy may
  // normalize image/jpg -> image/jpeg in transit.
  app.use(
    bodyParser.raw({
      type: (req) => {
        const ct = (req.headers["content-type"] || "").toLowerCase();
        return ct.startsWith("image/") || ct === "application/octet-stream";
      },
      limit: "10mb",
    })
  );
  app.use((req, res, next) => {
    console.log(req.headers.authorization);
    next();
  });

  // Programs (disabled — see import comment above)
  // app.use("/programs", programs());

  // OpenAI API
  app.use("/gpt", await chatgpt());

  // Google API
  //app.use("/google", await googleApi());

  // Chat
  app.use("/chats", await chat());

  // Images
  app.use("/image", images());

  app.listen(port, () => {
    console.log(`listening on ${port}`);
    startKeepAlive();
  });
}

// ---- Keep-alive ----------------------------------------------------------
// Render's free tier stops the server after 15 minutes without incoming
// traffic, and waking it takes 30-60 s (long enough to time out a SOLVE).
// Every 14 minutes the server requests its own public URL. The request goes
// out through Render's front door, so Render counts it as traffic and keeps
// the server awake.
//
// RENDER_EXTERNAL_URL is set automatically by Render
// (e.g. https://ti-32-w-camera.onrender.com). Locally it's unset, so this
// does nothing. Set KEEP_ALIVE=0 on Render to turn it off.
function startKeepAlive() {
  const base = process.env.RENDER_EXTERNAL_URL;
  if (!base || process.env.KEEP_ALIVE === "0") {
    console.log("keep-alive: off");
    return;
  }
  const url = `${base}/ping`;
  const EVERY_MS = 14 * 60 * 1000;
  setInterval(() => {
    https
      .get(url, (res) => {
        res.resume();
        console.log(`keep-alive: ${res.statusCode}`);
      })
      .on("error", (e) => console.log(`keep-alive failed: ${e.message}`));
  }, EVERY_MS);
  console.log(`keep-alive: pinging ${url} every 14 min`);
}

main();