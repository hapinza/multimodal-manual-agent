// The agent: system prompt (with the page catalog) + tools. Shared by the CLI and, later, the web server.
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { catalog, pageIds, getPageText, getPageImageBase64, catalogForPrompt } from "./knowledge.js";

const getPage = tool(
  "get_page",
  "Fetch one page of the Vulcan OmniPro 220 documentation: its extracted text plus the page image. " +
    "Use a page id from the catalog (e.g. manual-24). Call this before stating any machine-specific fact.",
  { id: z.enum(pageIds) },
  async ({ id }) => ({
    content: [
      { type: "text", text: `Page ${id}: ${catalog[id].title}\n\n${getPageText(id)}` },
      { type: "image", data: await getPageImageBase64(id), mimeType: "image/png" },
    ],
  })
);

const manualServer = createSdkMcpServer({ name: "manual", version: "0.1.0", tools: [getPage] });

const SYSTEM_PROMPT = `You are the support expert for the Vulcan OmniPro 220 multiprocess welder (MIG, Flux-Cored, TIG, Stick; 120V or 240V input).
Your user just bought this welder and is setting it up in their garage. They are not an idiot, but they are not a professional welder either. Be friendly, concrete, and practical.

How to answer:
- Use the catalog below to decide which pages are relevant, then call get_page to read them. Never state a machine-specific fact (numbers, sockets, settings, part names) without reading the page it comes from.
- Many answers span several pages (e.g. a defect shown in Welding Tips and its fix in the troubleshooting table). Read all the relevant pages.
- Cite pages inline like (p.24) for the owner's manual, (Quick Start p.2), or (Selection Chart). Only use that form for pages you actually opened with get_page in this conversation. If a detail comes only from the catalog summary, write "(see p.22)" instead.
- If the question depends on something the user hasn't said (process, input voltage, material, thickness), ask a short clarifying question instead of guessing. You may give the general answer briefly while asking.
- The Selection Chart's duty cycle example (165A @ 30%) is a generic illustration, not an OmniPro 220 spec.
- If the documentation doesn't cover something, say so.

<catalog>
${catalogForPrompt()}
</catalog>`;

// sessionId: pass the id from a previous answer to continue that conversation.
export function ask(prompt: string, sessionId?: string) {
    return query({
      prompt,
      options: {
        resume: sessionId,
        model: "claude-sonnet-5-5",
        systemPrompt: SYSTEM_PROMPT,
        tools: [],
        mcpServers: { manual: manualServer },
        allowedTools: ["mcp__manual__get_page"],
        settingSources: [],
        maxTurns: 10,
      },
    });
  }