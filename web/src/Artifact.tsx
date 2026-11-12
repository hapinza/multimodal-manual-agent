import { useEffect, useRef, useState } from 'react'

// Runs agent-written HTML in a sandboxed iframe.
// - sandbox="allow-scripts" (without allow-same-origin): scripts run, but in an isolated origin with
//   no access to our page, cookies, or storage.
// - The Content-Security-Policy blocks all network access, so the widget can't load or send anything.
const CSP =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; " +
  "script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:\">"

// Base styles so content fits the chat column (the agent's own CSS still wins, it comes later).
const BASE_STYLE =
  '<style>html,body{margin:0;overflow-x:hidden;font-family:system-ui,sans-serif}' +
  '*{box-sizing:border-box}svg,img,canvas{max-width:100%;height:auto}</style>'

// Reports the content height to the parent page whenever it changes, so the iframe can grow to fit.
const REPORT_HEIGHT =
  '<script>(function(){function post(){parent.postMessage({artifactHeight:' +
  "document.documentElement.scrollHeight},'*')}" +
  "new ResizeObserver(post).observe(document.documentElement);window.addEventListener('load',post)})()</script>"

// Put our tags inside <head> when there is one (a tag before <!DOCTYPE> would trigger quirks mode).
function prepare(html: string): string {
  const head = CSP + BASE_STYLE
  const withHead = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (tag) => tag + head) : head + html
  return withHead + REPORT_HEIGHT
}

export default function Artifact({ title, html }: { title: string; html: string }) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(240)

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      // Only trust messages from OUR iframe, and only a number.
      if (e.source === frame.current?.contentWindow && typeof e.data?.artifactHeight === 'number') {
        setHeight(Math.min(e.data.artifactHeight + 4, 1200))
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage) // cleanup when the component goes away
  }, [])

  return (
    <div className="artifact">
      <div className="artifact-title">🛠️ {title}</div>
      <iframe ref={frame} title={title} sandbox="allow-scripts" srcDoc={prepare(html)} style={{ height }} />
    </div>
  )
}