import { config } from "dotenv";
config({ path: "../.env" });

import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// 1) Tool definition - fake data on purpose; replaced with the real manual on day 2
const getDutyCycle = tool(
  "get_duty_cycle",
  "Look up the rated duty cycle of the Vulcan OmniPro 220 for a welding process and input voltage.",
  {
    process: z.enum(["MIG", "FLUX", "TIG", "STICK"]),
    inputVoltage: z.enum(["120V", "240V"]),
  },
  async ({ process, inputVoltage }) => {
    console.log(`  [tool called] get_duty_cycle(${process}, ${inputVoltage})`);
    return {
      content: [{ type: "text", text: `${process} @ ${inputVoltage}: 37% at 200A` }],
    };
  }
);

// 2) Bundle tools into an in-process MCP server -> Claude sees "mcp__manual__get_duty_cycle"
const manualServer = createSdkMcpServer({
  name: "manual",
  version: "0.1.0",
  tools: [getDutyCycle],
});

// 3) Run the agent - the SDK runs the loop; we just read the message stream
async function main() {
  const question = process.argv[2] ?? "What's the duty cycle for MIG welding at 200A on 240V?";

  for await (const msg of query({
    prompt: question,
    options: {
      systemPrompt:
        "You are a helpful expert on the Vulcan OmniPro 220 welder. Use your tools; never guess numbers.",
      tools: [],                                     // disable built-in tools (Bash, Read, ...)
      mcpServers: { manual: manualServer },
      allowedTools: ["mcp__manual__get_duty_cycle"], // run without permission prompts
      settingSources: [],                            // ignore local Claude settings files
      maxTurns: 5,                                   // prevent infinite loops
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
