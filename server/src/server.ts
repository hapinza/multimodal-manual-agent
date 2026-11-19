// Web entry point: the browser sends a question, we stream the agent's work back with Server-Sent Events (SSE).
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

import express from "express";
import { ask } from "./agent.js";
import { markUnopenedCitations } from "./citations.js";
import { friendlyError } from "./errors.js";

const app = express();
const PORT = 3001;

// Page images for the browser: GET /api/pages/manual-24.png
app.use("/api/pages", express.static(fileURLToPath(new URL("../../knowledge/pages/", import.meta.url))));

// GET /api/chat?q=...&session=...   (EventSource in the browser only supports GET)
app.get("/api/chat", async (req, res) => {
  const question = String(req.query.q ?? "");
  const session = req.query.session ? String(req.query.session) : undefined;

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event: object) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  const opened = new Set<string>(); // pages the agent has read so far in this answer
  let failed = false; // already reported an error to the browser

  try {
    for await (const msg of ask(question, session)) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") send({ type: "text", text: markUnopenedCitations(block.text, opened) });
          if (block.type === "tool_use") {
            const input = block.input as { id?: string; ids?: string[]; caption?: string; title?: string; html?: string };
            if (block.name === "mcp__manual__get_page") input.ids?.forEach((id) => opened.add(id));
            if (block.name === "mcp__manual__show_manual_page") {
              send({ type: "image", id: input.id, caption: input.caption });
            } else if (block.name === "mcp__manual__render_artifact") {
              send({ type: "artifact", title: input.title, html: input.html });
            } else if (block.name === "mcp__manual__get_page") {
              send({ type: "tool", name: block.name, input });
            } else {
              console.log("[tool] ignored for the browser:", block.name);
            }
          }
        }
      }
      if (msg.type === "result") {
        // An API failure (bad key, no credits, overload) still ends with a result message, flagged is_error.
        if (msg.is_error || msg.subtype !== "success") {
          failed = true;
          send({ type: "error", message: friendlyError(msg.subtype === "success" ? msg.result : msg.subtype) });
        }
        send({ type: "done", session: msg.session_id, cost: msg.total_cost_usd });
      }
    }
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    console.error("[agent error]", raw);
    if (!failed) send({ type: "error", message: friendlyError(raw) });
  }
  res.end();
});

app.listen(PORT, (err?: Error) => {
  // Express 5 passes listen errors here (e.g. the port is still held by an old server).
  if (err) {
    console.error(`\n❌ Could not start the agent server on port ${PORT}: ${err.message}`);
    console.error("   Another copy is probably still running. Close it and run `npm run dev` again.\n");
    process.exit(1);
  }
  console.log(`agent server on http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("\n⚠️  ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key, then restart.\n");
  }
});