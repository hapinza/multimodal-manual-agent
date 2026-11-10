// CLI: npx tsx src/ask.ts "your question"
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

import { ask } from "./agent.js";

const question = process.argv[2] ?? "What's the duty cycle for MIG welding at 200A on 240V?";
console.log(`Q: ${question}\n`);

for await (const msg of ask(question)) {
  if (msg.type === "assistant") {
    for (const block of msg.message.content) {
      if (block.type === "text") console.log(block.text);
      if (block.type === "tool_use") console.log(`  [${block.name.replace("mcp__manual__", "")}] ${JSON.stringify(block.input)}`);
    }
  }
  if (msg.type === "result") console.log(`\n(${msg.subtype}, ${msg.num_turns} turns, $${msg.total_cost_usd?.toFixed(4)})`);
}