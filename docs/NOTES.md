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