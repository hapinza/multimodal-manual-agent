// Turns raw SDK / API errors into messages a first-time user (or evaluator) can act on.
export function friendlyError(raw: string): string {
    if (/api key|authentication|unauthorized|401/i.test(raw)) {
      return "Couldn't authenticate with Anthropic. Check that .env contains ANTHROPIC_API_KEY=<your key>, then restart `npm run dev`.";
    }
    if (/credit balance|billing|402/i.test(raw)) {
      return "The Anthropic account behind this API key is out of credits. Add credits in the Anthropic Console, then try again.";
    }
    if (/rate limit|429|overloaded|529/i.test(raw)) {
      return "Claude is busy right now (rate limited or overloaded). Wait a few seconds and try again.";
    }
    if (/max.?turns/i.test(raw)) {
      return "This question took more steps than allowed. Try asking a narrower question.";
    }
    return `Something went wrong while talking to Claude: ${raw.slice(0, 200)}`;
  }