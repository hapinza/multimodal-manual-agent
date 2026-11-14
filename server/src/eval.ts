// Eval runner (entry #3): runs every case in a FRESH session, records what the agent did, and checks it.
// Usage: npm run eval -w server            (all cases)
//        npm run eval -w server -- <id>...  (only some cases)
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { ask } from "./agent.js";
import { getPageText } from "./knowledge.js";
import { markUnopenedCitations } from "./citations.js";

type Case = {
  id: string;
  question: string;
  mustRead?: string[]; // each entry: page ids separated by "|", at least one must be read
  mustContain?: string[]; // each entry: alternatives separated by "|", case-insensitive, checked in text + artifact HTML
  mustNotMatch?: string[]; // regexes that must NOT appear in the text + artifacts
  groundedNumbers?: string[]; // regexes for numbers (e.g. volts); every match must appear on a page the agent read
  mustShow?: "image" | "artifact" | "any";
  mustAsk?: boolean; // the answer should ask the user a clarifying question
};

type Run = {
  read: string[];
  images: string[];
  captions: string[];
  artifacts: string[];
  text: string;
  cost: number;
  turns: number;
};

const EVALS = fileURLToPath(new URL("../evals/", import.meta.url));
const cases: Case[] = JSON.parse(readFileSync(EVALS + "cases.json", "utf-8"));

async function runCase(c: Case): Promise<Run> {
    const run: Run = { read: [], images: [], captions: [], artifacts: [], text: "", cost: 0, turns: 0 };
  for await (const msg of ask(c.question)) { // no session id: every case starts fresh
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text") run.text += block.text + "\n";
        if (block.type === "tool_use") {
            const input = block.input as { id?: string; ids?: string[]; caption?: string; html?: string };
            if (block.name.endsWith("get_page") && input.ids) run.read.push(...input.ids);
            if (block.name.endsWith("show_manual_page") && input.id) {
                run.images.push(input.id);
                run.captions.push(input.caption ?? "");
              }
          if (block.name.endsWith("render_artifact") && input.html) run.artifacts.push(input.html);
        }
      }
    }
    if (msg.type === "result") {
      run.cost = msg.total_cost_usd ?? 0;
      run.turns = msg.num_turns;
    }
  }
  return run;
}

// F3 detector: page citations like "(p.22)" or "Quick Start p.2" for pages the agent never opened.
// "(see p.22)" is allowed: that's the agreed way to point at a page known only from the catalog.
function unopenedCitations(content: string, read: string[]): string[] {
  const cited = new Set<string>();
  for (const m of content.matchAll(/(see\s+)?(Quick Start(?:\s+Guide)?\s*\(?\s*)?p\.\s?(\d{1,2})\b/gi)) {
    if (m[1]) continue;
    const page = m[3].padStart(2, "0");
    cited.add(m[2] ? `quickstart-${page}` : `manual-${page}`);
  }
  if (/\(Selection Chart\)/i.test(content)) cited.add("selection-01");
  return [...cited].filter((id) => !read.includes(id));
}

function check(c: Case, r: Run) {
  const all = (r.text + "\n" + r.artifacts.join("\n")).toLowerCase();
  const failures: string[] = [];
  for (const group of c.mustRead ?? []) {
    if (!group.split("|").some((id) => r.read.includes(id))) failures.push(`didn't read ${group}`);
  }
  for (const group of c.mustContain ?? []) {
    if (!group.split("|").some((s) => all.includes(s.toLowerCase()))) failures.push(`missing "${group}"`);
  }
  for (const pattern of c.mustNotMatch ?? []) {
    const hit = (r.text + r.artifacts.join("")).match(new RegExp(pattern, "i"));
    if (hit) failures.push(`should not say "${hit[0]}"`);
  }
  const readText = r.read.map(getPageText).join("\n");
  for (const pattern of c.groundedNumbers ?? []) {
    for (const hit of (r.text + r.artifacts.join("")).matchAll(new RegExp(pattern, "gi"))) {
      const number = hit[0].match(/\d+(\.\d+)?/)![0];
      if (!readText.includes(number)) failures.push(`ungrounded number "${hit[0]}" (not on any page it read)`);
    }
  }
  if (c.mustShow === "image" && r.images.length === 0) failures.push("no manual image shown");
  if (c.mustShow === "artifact" && r.artifacts.length === 0) failures.push("no artifact");
  if (c.mustShow === "any" && r.images.length + r.artifacts.length === 0) failures.push("nothing visual");
  if (c.mustAsk && !r.text.includes("?")) failures.push("didn't ask a clarifying question");
  // F3 is measured on the model's raw text; "afterGuard" is what users see once server.ts rewrites citations.
  const unopened = unopenedCitations(r.text + "\n" + r.artifacts.join("\n"), r.read);
  const afterGuard = unopenedCitations(markUnopenedCitations(r.text, new Set(r.read)), r.read);
  return { passed: failures.length === 0, failures, unopened, afterGuard };
}

async function main() {
   // Optional "--repeat=N" runs each selected case N times (answers vary run to run).
   const args = process.argv.slice(2);
   const repeat = Number(args.find((a) => a.startsWith("--repeat="))?.split("=")[1] ?? 1);
   const only = args.filter((a) => !a.startsWith("--"));
   const picked = only.length ? cases.filter((c) => only.includes(c.id)) : cases;
   const selected = picked.flatMap((c) => Array(repeat).fill(c) as Case[]);
  const results = [];

  for (const c of selected) {
    process.stdout.write(`${c.id} ... `);
    const run = await runCase(c);
    const verdict = check(c, run);
    results.push({ ...c, ...run, ...verdict });
    console.log(
      `${verdict.passed ? "PASS" : "FAIL"}  read=[${run.read.join(",")}]  shown=${run.images.length}img/${run.artifacts.length}art` +
        `  $${run.cost.toFixed(3)}` +
        (verdict.failures.length ? `\n    - ${verdict.failures.join("\n    - ")}` : "") +
        (verdict.unopened.length ? `\n    ! cited without opening: ${verdict.unopened.join(", ")}` : "")
    );
  }

  const passed = results.filter((r) => r.passed).length;
  const f3 = results.filter((r) => r.unopened.length > 0).length;
  const f3Guarded = results.filter((r) => r.afterGuard.length > 0).length;
  const cost = results.reduce((sum, r) => sum + r.cost, 0);
  console.log(`\n${passed}/${results.length} passed | F3 raw: ${f3}/${results.length}, after citation guard: ${f3Guarded}/${results.length} | total $${cost.toFixed(2)}`);

  mkdirSync(EVALS + "results", { recursive: true });
  const file = `${EVALS}results/${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(file, JSON.stringify(results, null, 2));
  console.log(`saved ${file}`);
}

main();