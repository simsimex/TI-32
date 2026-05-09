import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import morgan from "morgan";
import dot from "dotenv";
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
  });
}

main();