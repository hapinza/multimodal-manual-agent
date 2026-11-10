import { config } from "dotenv";
config({ path: "../.env" });

import { readFile } from "node:fs/promises";
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// Experiment: can Claude answer from a page IMAGE alone (no page text)?
const getPageImage = tool(
  "get_page_image",
  "Return the image of one page of the Vulcan OmniPro 220 owner's manual (pages 1-48).",
  { page: z.number().int().min(1).max(48) },
  async ({ page }) => {
    console.log(`  [tool called] get_page_image(${page})`);
    const file = `../knowledge/pages/manual-${String(page).padStart(2, "0")}.png`;
    const data = (await readFile(file)).toString("base64");
    return { content: [{ type: "image", data, mimeType: "image/png" }] };
  }
);

const server = createSdkMcpServer({ name: "manual", version: "0.1.0", tools: [getPageImage] });

async function main() {
  const question =
    process.argv[2] ??
    "What polarity setup do I need for TIG welding? Which socket does the ground clamp go in?";

  for await (const msg of query({
    prompt: question,
    options: {
      systemPrompt:
        "You are an expert on the Vulcan OmniPro 220 welder. The TIG setup diagram is on manual page 24. " +
        "Look at the page image before answering, and say which page you used.",
      tools: [],
      mcpServers: { manual: server },
      allowedTools: ["mcp__manual__get_page_image"],
      settingSources: [],
      maxTurns: 5,
    },
  })) {
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text") console.log("Claude:", block.text);
        if (block.type === "tool_use") console.log("  [tool_use]", block.name, JSON.stringify(block.input));
      }
    }
    if (msg.type === "result") console.log(`\n(done: ${msg.subtype}, $${msg.total_cost_usd?.toFixed(4)})`);
  }
}

main();