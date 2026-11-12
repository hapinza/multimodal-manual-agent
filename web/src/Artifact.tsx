// Runs agent-written HTML in a sandboxed iframe.
// - sandbox="allow-scripts" (without allow-same-origin): scripts run, but in an isolated origin with
//   no access to our page, cookies, or storage.
// - The Content-Security-Policy blocks all network access, so the widget can't load or send anything.
const CSP =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; " +
  "script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:\">"

// Put the CSP inside <head> when there is one (a tag before <!DOCTYPE> would trigger quirks mode).
function withCsp(html: string): string {
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (head) => head + CSP) : CSP + html
}

export default function Artifact({ title, html }: { title: string; html: string }) {
  return (
    <div className="artifact">
      <div className="artifact-title">🛠️ {title}</div>
      <iframe title={title} sandbox="allow-scripts" srcDoc={withCsp(html)} />
    </div>
  )
}