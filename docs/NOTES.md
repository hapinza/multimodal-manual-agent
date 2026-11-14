# Dev Notes

## Experiments

### E1: Does the agent trust tool data over its own memory? (Day 1)
- Planted 37% (manual says 25% @ 200A, MIG, 240V, p.7) in a tool result.
- Agent answered 37%. It trusts retrieved context over prior knowledge.
- Takeaway: extraction quality is the main lever on accuracy.
- Mistake: my first test used 25%, which matched the real value, so it proved nothing.

### E2: Can the agent read a diagram from a page image alone? (Day 2)
- Tool returned only the PNG of p.24, no text.
- Agent answered correctly: ground clamp -> positive, TIG torch -> negative (DCEN), cited p.24.
- Takeaway: vision at query time works for labeled diagrams. Still untested: photos (weld defects) and the selection chart.

## Failures

### F1: Ungrounded answer (Day 1)
- Porosity question with no retrieval tool: answered from general knowledge, no page cited.
- Missed that the manual covers porosity in two places: p.37 (wire weld defects, with bead images) and p.43 (troubleshooting table).
- My own first note said "p.36"; the catalog showed it's p.37 (p.36's footer bleeds into the next topic). Reading text alone misleads; the page images settle it.

### F2: Correct but ungrounded side claim (Day 2)
- TIG polarity answer added "stick usually puts electrode on positive" from memory.
- The manual states it on p.27. Should have cited it.
- Planned fix: page catalog in the system prompt + rule to cite a page for every machine-specific claim.



### E3: Page catalog quality check (Day 2)
- Built 3 entries first (p.24, p.27, selection chart) before spending on all 51.
- All accurate. The selection chart (zero extractable text) was summarized correctly from the image alone; values verified by hand.
- p.27 summary picked up rear-label duty cycles that match the p.7 spec table.
- Issue: free-text `section` drifted ("TIG / Stick Welding" vs "TIG / Stick"). Fixed with an enum from the manual's table of contents.
- Risk to eval later: the selection chart's duty cycle example (165A @ 30%) is generic, not an OmniPro spec.

### E4: Full catalog (Day 2)
- 51 entries, ~$1 with Opus 5.5. Section enum produced 12 clean sections.
- Image-only info captured: front panel socket layout (p.8), wiring schematic (p.45), all four polarity setups on one page (quickstart p.2).
- Size: full JSON ~22k tokens (about the same as the whole manual text). Title + summary only ~10k tokens.

### D6: Structured outputs for extraction
- First tried forced tool_choice for JSON; Opus 5.5 rejects it (400). Switched to native structured outputs (`output_config.format`), which guarantees schema-valid JSON.


### E5: Agent v1 on the three README questions (Day 3)
- Agent v1 = catalog (title + summary, ~10k tokens) in the system prompt + get_page tool (page text + image). Model: Sonnet 5.5.
- All three correct, and the agent picked pages on its own (no page hints):
  - Duty cycle: read p.19 -> 25% @ 200A on 240V. ($0.06)
  - Flux-cored porosity: read p.37 + p.43 (both expected pages) + p.13 + p.35. Led with DCEN polarity, filtered out "MIG only" gas causes, asked a clarifying question. ($0.055)
  - TIG polarity: read p.24 + Quick Start p.2 -> ground clamp positive. Stick contrast now cited from Quick Start p.2, so F2 is fixed. ($0.024)

### F3: Citing a page it never opened (Day 3)
- Porosity answer cited "0-15 deg drag angle (p.22)" but never called get_page on p.22. The fact came from the catalog summary.
- The fact is correct (checked against p.22), but summaries are compressed and could be wrong, and the citation implies the page was read.
- Options: (1) rule: summaries are for choosing pages, never for quoting; (2) allow it but mark summary-based citations. Decide during evals.


### E7: Web chat end to end (Day 3)
- React (Vite) chat -> Vite proxy -> Express SSE server -> agent. Pages read are shown under each answer.
- Session resume works: "And what about the shielding gas?" (no mention of TIG) was answered for TIG, reading p.25 + p.30.
- Honest about limits: the exact gas flow is on the Settings Chart sticker inside the welder door, which isn't in our PDFs. The agent gave the manual's 10-25 SCFH range and said it hadn't seen the chart instead of inventing a number.
- Gaps: markdown shows as raw text; still no images or diagrams.

### D7: Web architecture
- Express + Server-Sent Events: the agent works for several seconds, so we stream progress (pages read, text) instead of waiting for the full answer.
- Event types: tool / text / done (carries session id) / error.
- Vite dev proxy forwards /api to the agent server, so the browser talks to one origin.
- EventSource auto-reconnects when the stream ends, so the client closes it on done/error (otherwise the question is re-sent and billed again).


### E8: Showing manual images (Day 4)
- New tool show_manual_page(id, caption). The handler only acks; server.ts intercepts the tool call and sends an "image" event; the browser loads /api/pages/<id>.png.
- TIG polarity -> showed p.24 (cable hookup diagram). Negative socket -> showed p.8 (front panel). Both exactly right.
- Porosity -> read p.37 but [did / did not] show its defect illustration.
- F3 persists: cited "(p.22)" twice without opening it, despite the new "(see p.X)" rule. A prompt rule alone didn't fix it.
- Idea: crop to the figure instead of showing the whole page.



### F4: Didn't show an image when it should have (Day 4)
- "My flux-cored weld has small holes": read p.37 (which has porosity bead illustrations) but never called show_manual_page.
- The system prompt explicitly lists "weld defect examples" as a reason to show a page. The rule wasn't strong enough.


### E9: Artifacts (Day 4)
- New tool render_artifact(title, html). Server forwards the HTML; the browser runs it in an iframe with sandbox="allow-scripts" (no same-origin) and a CSP that blocks all network access.
- "240V MIG duty cycle calculator": slider + weld/rest bar. The manual only rates 100% @ 115A and 25% @ 200A; the agent refused to invent a curve and used 25% as the safe limit in between.
- "Draw which cable goes where (flux-cored)": custom SVG of the socket row with colored arrows, plus the manual's own p.13 diagram, linked in the text.
  - Bug: bottom labels clipped (SVG wider than the iframe).
  - Minor inaccuracy: labeled the center connector "small center jack"; p.8 calls it the Wire Feed Power Cable.
- "Porosity flowchart (flux-cored)": interactive 5-step Yes/No troubleshooter grounded in p.37 + p.43, gas checks skipped as MIG-only.
- F3 partly improved: once said "p.22, which I didn't open here", but still cited p.15 unopened elsewhere.
- Horizontal scrollbar inside artifacts: content overflows the iframe width.

### D8: Generated HTML artifacts vs prebuilt components
- Chose agent-generated HTML: anything can be drawn, and each drawing fits the user's exact process.
- Alternative: prebuilt React widgets the agent fills with parameters (more polished, numbers from our data, but limited to what we built). Revisit if evals show artifact quality problems; a hybrid is possible.


### F5: Server never started under `npm run dev` on Windows (Day 5)
- Symptom: empty assistant bubble; Vite logged ECONNREFUSED for /api/chat; curl to :3001 returned 000.
- [server] output stopped at "> tsx watch src/server.ts": the server code never ran. Running the server alone worked.
- Cause: `tsx watch` hangs when started under `concurrently` on Windows (worked fine on Linux).
- Fix: `npm run dev` uses plain `tsx src/server.ts` (evaluators don't need auto-restart). Added `npm run watch -w server` for development.
- Also: the UI now shows "Lost connection to the agent server" instead of an empty bubble when the stream fails.
- Lesson: test clone-to-run on a clean machine (and on Windows) before submitting.


### F6: Selection chart rendered huge and blurry (Day 5)
- The selection chart PDF is a 1200x1200 pt page holding one low-res JPEG; the real chart is a 1195x431 band in the middle, with blank space above and below.
- Rendering every page at 150 DPI upscaled it to 2500x2500 (blurry, mostly white), and the UI showed it overflowing the chat bubble.
- Fix: for this page, extract the embedded JPEG and trim the white margin (1195x431). Better for the user and for the model (fewer wasted image tokens).
- Also fixed CSS so images always fit the bubble.
- Lesson: "render every page the same way" was too uniform; inspect odd documents individually.

### E10: Settings configurator without exact settings data (Day 5)
- Question: "1/8 in mild steel, MIG, 240V. Build me a settings configurator: what wire speed and voltage?"
- Exact WFS/voltage per thickness are only on the Settings Chart inside the welder door, not in our PDFs. The machine is synergic: it sets WFS and voltage once process, wire diameter, and thickness are chosen, and marks the recommended value (p.20).
- Without any new rule, the agent refused to invent numbers, gave the LCD procedure, and built a tuning widget ("what does your test bead look like?" -> what to change, from p.35). It pointed to the door chart.
- So the planned prompt rule (a1) wasn't needed. Kept the prompt shorter; added this question to the eval set as a regression check.
- Issues: cited p.14 and p.19 without opening them (F3); said 1/8 in is "near the upper end" for MIG, which contradicts the Selection Chart (MIG goes to 3/8 in).
- Method note: my second run continued the same session, so it wasn't a clean before/after. Evals must start a fresh session per question.


### F5: Server never started under `npm run dev` on Windows (Day 5-6)
- Symptom: empty assistant bubble; Vite logged ECONNREFUSED for /api/chat; curl to :3001 returned 000. [server] output stopped at the script line; our code never ran. Running the server alone worked.
- Attempt 1: drop `tsx watch` for `tsx` -> still failed.
- Attempt 2: `node --import tsx` (no tsx CLI child process) -> still failed.
- Fix: root `dev` runs binaries directly, no nested `npm run -w`:
  `concurrently "node --import tsx server/src/server.ts" "vite web"`. Works on Windows and Linux.
- Likely cause: nested npm workspace scripts under concurrently on Windows (not fully root-caused).
- Enabled by paths resolved from import.meta.url, so the server runs from any working directory.


### E11: Eval baseline and the multi-page get_page experiment (Day 6)
- Eval: 12 cases in server/evals/cases.json, fresh session per case, code-graded (pages read, required phrases, visuals, clarifying question, F3 detector, numeric grounding).
- Fixed two grader bugs before trusting it: "Quick Start (p.2)" was read as manual p.2; the number check flagged an honest quote of p.20's 24-gauge example. Replaced "no numbers" with numeric grounding: every volts/IPM number must appear on a page the agent read. Re-graded the saved baseline offline ($0).
- Baseline: 12/12 pass, F3 8/12, $0.40. Unopened citations were all correct (the catalog is accurate) but the citation implied the page was read.
- Hypothesis: the agent skips opening side pages because each page costs a round trip. Change: get_page takes up to 4 ids at once.
- Result: F3 8/12 -> 3/12, cost $0.40 -> $0.45. Remaining hits are mostly "see p.17 for the hookup" pointers the regex can't tell apart from claims.
- New failure F7: wrong-user-correction returned only a closing line; suspect the correction went into the image caption. Added a 140-char limit on captions (code-enforced) and caption logging; re-running with --repeat=5.

### E12: Stable numbers and the citation guard (Day 6)
- Full suite x3 (36 runs, $1.15, ~3 cents per question): 34/36 pass. Zero invented numbers (0/3), user mis-correction fixed every time (3/3).
- F3 averaged 16/36 (44%). The earlier single-run 3/12 was lucky; single runs are noisy, so report repeats.
- F3 was systematic and always correct: side facts quoted from catalog summaries (Quick Start p.2 for stick, p.12 roller groove, p.22 drag angle).
- Fix (code, not prompt): server.ts tracks pages opened via get_page and, before text reaches the user, rewrites citations of unopened pages as pointers ("see p.22"). Eval reports both raw model behavior and what users see.
  - Targeted x3: F3 raw 3/9, after guard 0/9.
  - Known limit: opened pages are tracked per answer, so a page read in an earlier turn of the same conversation gets "see" when cited again (errs on the safe side).
- Ambiguity: "you may answer while asking" let the agent skip the question (1/3). Rewrote as a concrete action ("end with one short clarifying question") -> 3/3.