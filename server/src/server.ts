// Web entry point: the browser sends a question, we stream the agent's work back with Server-Sent Events (SSE).
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

import express from "express";
import { ask } from "./agent.js";

const app = express();
const PORT = 3001;

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

  try {
    for await (const msg of ask(question, session)) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") send({ type: "text", text: block.text });
          if (block.type === "tool_use") send({ type: "tool", name: block.name, input: block.input });
        }
      }
      if (msg.type === "result") {
        send({ type: "done", session: msg.session_id, cost: msg.total_cost_usd });
      }
    }
  } catch (err) {
    send({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
  res.end();
});

app.listen(PORT, () => console.log(`agent server on http://localhost:${PORT}`));