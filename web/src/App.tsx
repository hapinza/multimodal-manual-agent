import { useState } from 'react'
import Markdown from 'react-markdown'
import './App.css'
import Artifact from './Artifact'

// An answer is a sequence of parts, kept in the order they arrived.
type Part =
  | { kind: 'text'; text: string }
  | { kind: 'image'; id: string; caption: string }
  | { kind: 'artifact'; title: string; html: string }

// Shown on the empty screen so a first-time user (or evaluator) can try the agent in one click.
const EXAMPLES = [
  'What polarity do I need for TIG? Which socket does the ground clamp go in?',
  "I'm on 240V doing MIG. Can you give me a duty cycle calculator?",
  "I'm getting porosity in my flux-cored welds. What should I check?",
  'Where exactly is the negative socket on the front of the machine?',
  'I want to weld 1/4 inch steel outside in the wind. Which process should I use?',
  "What's the duty cycle?",
]


type Message = {
  role: 'user' | 'assistant'
  parts: Part[]
  pages: string[] // pages the agent read while answering, e.g. ["manual-24"]
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [session, setSession] = useState<string | null>(null)

  // Update the last message (the assistant reply that is currently streaming in).
  function updateLast(change: (m: Message) => Message) {
    setMessages((prev) => [...prev.slice(0, -1), change(prev[prev.length - 1])])
  }
  function addPart(part: Part) {
    updateLast((m) => ({ ...m, parts: [...m.parts, part] }))
  }

  function send(text: string = input) {
    const question = text.trim()
    if (!question || busy) return
    setInput('')
    setBusy(true)
    setMessages((prev) => [
      ...prev,
      { role: 'user', parts: [{ kind: 'text', text: question }], pages: [] },
      { role: 'assistant', parts: [], pages: [] },
    ])

    const params = new URLSearchParams({ q: question })
    if (session) params.set('session', session)
    const events = new EventSource(`/api/chat?${params}`)

    events.onmessage = (e) => {
      const event = JSON.parse(e.data)
      if (event.type === 'tool') {
        updateLast((m) => ({ ...m, pages: [...m.pages, event.input.id] }))
      } else if (event.type === 'text') {
        addPart({ kind: 'text', text: event.text })
      } else if (event.type === 'image') {
        addPart({ kind: 'image', id: event.id, caption: event.caption })
      } else if (event.type === 'artifact') {
        addPart({ kind: 'artifact', title: event.title, html: event.html })
      } else if (event.type === 'done') {
        setSession(event.session)
        finish()
      } else if (event.type === 'error') {
        addPart({ kind: 'text', text: `⚠️ ${event.message}` })
        finish()
      }
    }
    // EventSource reconnects automatically when the server closes the stream.
    // We must close it ourselves, or the same question would be sent again.
    events.onerror = () => {
      if (!finished) addPart({ kind: 'text', text: '⚠️ Lost connection to the agent server. Check the terminal for errors.' })
      finish()
    }

    let finished = false
    function finish() {
      finished = true
      events.close()
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <header>Vulcan OmniPro 220 Assistant</header>

      <main>
        {messages.length === 0 && (
            <div className="welcome">
              <h2>Just got your OmniPro 220?</h2>
              <p>Ask me anything about setup, settings, polarity, or troubleshooting. Or try one of these:</p>
              <div className="examples">
                {EXAMPLES.map((q) => (
                  <button key={q} onClick={() => send(q)}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.pages.length > 0 && <div className="pages">📖 Read: {m.pages.join(', ')}</div>}
            {m.parts.length === 0 && busy && <div>Thinking…</div>}
            {m.parts.map((part, j) =>
              part.kind === 'text' ? (
                <Markdown key={j}>{part.text}</Markdown>
              ) : part.kind === 'artifact' ? (
                <Artifact key={j} title={part.title} html={part.html} />
              ) : (
                <figure key={j}>
                  <a href={`/api/pages/${part.id}.png`} target="_blank" rel="noreferrer">
                    <img src={`/api/pages/${part.id}.png`} alt={part.caption} />
                  </a>
                  <figcaption>
                    {part.caption} <span className="page-id">({part.id})</span>
                  </figcaption>
                </figure>
              ),
            )}
          </div>
        ))}
      </main>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about setup, settings, polarity, troubleshooting…"
          disabled={busy}
        />
        <button disabled={busy || !input.trim()}>Send</button>
      </form>
    </div>
  )
}