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

// Shows a page image to the USER. The handler does nothing visible itself: server.ts sees this
// tool call in the stream and tells the browser to display the page.
const showManualPage = tool(
    "show_manual_page",
    "Display a page of the documentation to the user, as an image in the chat. " +
      "Use it when a figure (diagram, photo, chart, schematic) would help more than words.",
    {
      id: z.enum(pageIds),
      caption: z.string().describe("One short line telling the user what to look at in the image."),
    },
    async ({ id }) => ({ content: [{ type: "text", text: `Page ${id} is now displayed to the user.` }] })
  );
  
  
 // Renders an interactive widget or a custom diagram for the USER. Like show_manual_page, the handler
// only acknowledges; server.ts forwards the HTML to the browser, which runs it in a sandboxed iframe.
const renderArtifact = tool(
    "render_artifact",
    "Show the user an interactive widget or a custom diagram you write as a self-contained HTML document " +
      "(inline CSS, inline JS, inline SVG). Examples: duty cycle calculator, troubleshooting flowchart, " +
      "settings configurator, a drawing of which cable goes in which socket.",
    {
      title: z.string().describe("Short title shown above the widget."),
      html: z.string().describe("A complete, self-contained HTML document. No external scripts, styles, fonts, or images."),
    },
    async ({ title }) => ({ content: [{ type: "text", text: `Artifact "${title}" is now displayed to the user.` }] })
  );
  
  const manualServer = createSdkMcpServer({
    name: "manual",
    version: "0.1.0",
    tools: [getPage, showManualPage, renderArtifact],
  });

const SYSTEM_PROMPT = `You are the support expert for the Vulcan OmniPro 220 multiprocess welder (MIG, Flux-Cored, TIG, Stick; 120V or 240V input).
Your user just bought this welder and is setting it up in their garage. They are not an idiot, but they are not a professional welder either. Be friendly, concrete, and practical.

How to answer:
- Use the catalog below to decide which pages are relevant, then call get_page to read them. Never state a machine-specific fact (numbers, sockets, settings, part names) without reading the page it comes from.
- Many answers span several pages (e.g. a defect shown in Welding Tips and its fix in the troubleshooting table). Read all the relevant pages.
- Cite pages inline like (p.24) for the owner's manual, (Quick Start p.2), or (Selection Chart). Only use that form for pages you actually opened with get_page in this conversation. If a detail comes only from the catalog summary, write "(see p.22)" instead.
- If the question depends on something the user hasn't said (process, input voltage, material, thickness), ask a short clarifying question instead of guessing. You may give the general answer briefly while asking.
- The Selection Chart's duty cycle example (165A @ 30%) is a generic illustration, not an OmniPro 220 spec.
- If the documentation doesn't cover something, say so.
- Show, don't just tell. When the answer involves something visual (socket layout, cable hookups, wire feed parts, front panel controls, weld defect examples, charts, the wiring schematic), call show_manual_page with the most relevant page, and refer to it in your text ("see the diagram above"). The catalog lists figures worth showing. Show at most two pages per answer.
- Draw or build when words aren't enough. Call render_artifact when the user would benefit from something interactive or a custom drawing:
  - a calculator or configurator (duty cycle for a process/voltage/amperage, settings for process + material + thickness),
  - a troubleshooting flowchart (yes/no questions leading to fixes),
  - a simple SVG drawing of the machine's sockets showing which cable goes where for the user's process.
  Every number and label in an artifact must come from pages you read with get_page; never invent specs. Keep artifacts small, clear, and readable on a laptop (light background, large text, labeled controls). Briefly say in your text what the artifact shows.
  
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
        allowedTools: ["mcp__manual__get_page", "mcp__manual__show_manual_page", "mcp__manual__render_artifact"],
        settingSources: [],
        maxTurns: 10,
      },
    });
  }