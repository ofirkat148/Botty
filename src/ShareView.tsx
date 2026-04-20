import { useEffect, useState } from 'react';
import { parseArtifacts, hasArtifacts } from './utils/artifacts';

interface ShareMessage {
  prompt: string;
  response: string;
  model: string;
  provider: string | null;
  timestamp: string;
}

interface ShareData {
  title: string | null;
  conversationId: string;
  createdAt: string;
  messages: ShareMessage[];
}

function ArtifactPreview({ lang, code }: { lang: string; code: string }) {
  const [show, setShow] = useState(false);
  const srcDoc = lang === 'html' || lang === 'svg'
    ? code
    : `<pre style="font-family:monospace;white-space:pre-wrap;padding:1rem">${code.replace(/</g, '&lt;')}</pre>`;

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-white/10">
      <div className="flex items-center justify-between bg-black/30 px-3 py-1.5 text-xs text-stone-400">
        <span className="font-mono">{lang}</span>
        <button onClick={() => setShow(v => !v)} className="hover:text-white transition-colors">
          {show ? 'Hide preview' : 'Show preview'}
        </button>
      </div>
      <pre className="bg-black/40 text-stone-200 text-sm p-4 overflow-x-auto whitespace-pre-wrap font-mono">{code}</pre>
      {show && (
        <iframe
          srcDoc={srcDoc}
          sandbox="allow-scripts"
          className="w-full bg-white"
          style={{ height: 320, border: 0 }}
          title="Preview"
        />
      )}
    </div>
  );
}

function MessageContent({ text }: { text: string }) {
  if (!hasArtifacts(text)) {
    return <span className="whitespace-pre-wrap">{text}</span>;
  }
  const parts = parseArtifacts(text);
  return (
    <>
      {parts.map((part, i) =>
        part.type === 'text' ? (
          <span key={i} className="whitespace-pre-wrap">{part.content}</span>
        ) : (
          <ArtifactPreview key={i} lang={part.lang} code={part.content} />
        )
      )}
    </>
  );
}

export default function ShareView({ token }: { token: string }) {
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/shares/view/${encodeURIComponent(token)}`)
      .then(r => {
        if (!r.ok) return r.json().then(e => { throw new Error(e.error || 'Failed to load'); });
        return r.json() as Promise<ShareData>;
      })
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [token]);

  const containerClass = 'min-h-screen bg-stone-950 text-stone-100 flex flex-col';
  const headerClass = 'sticky top-0 z-10 border-b border-white/8 bg-stone-950/90 backdrop-blur px-4 py-3 flex items-center gap-3';
  const bubbleUser = 'ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-sm';
  const bubbleBot = 'mr-auto max-w-[85%] rounded-2xl rounded-tl-sm bg-stone-800 px-4 py-2.5 text-sm leading-relaxed';

  if (error) {
    return (
      <div className={containerClass}>
        <div className={headerClass}>
          <span className="font-semibold">Botty</span>
          <span className="text-stone-500 text-sm">Shared conversation</span>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-stone-400 text-center p-8">
            <p className="text-lg font-medium text-stone-300 mb-2">Link not available</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={containerClass}>
        <div className={headerClass}>
          <span className="font-semibold">Botty</span>
        </div>
        <div className="flex-1 flex items-center justify-center text-stone-500 text-sm">Loading…</div>
      </div>
    );
  }

  const label = data.title || `Conversation · ${new Date(data.createdAt).toLocaleDateString()}`;

  return (
    <div className={containerClass}>
      <div className={headerClass}>
        <span className="font-semibold text-stone-100">Botty</span>
        <span className="text-stone-500 text-sm truncate">{label}</span>
        <span className="ml-auto text-xs text-stone-600 shrink-0">Read-only · {data.messages.length} message{data.messages.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 max-w-3xl w-full mx-auto">
        {data.messages.map((msg, i) => (
          <div key={i} className="space-y-2">
            <div className={bubbleUser}>{msg.prompt}</div>
            <div className={bubbleBot}>
              <MessageContent text={msg.response} />
              <div className="mt-2 text-xs text-stone-500">{msg.model}{msg.provider ? ` · ${msg.provider}` : ''} · {new Date(msg.timestamp).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-white/8 px-4 py-3 text-center text-xs text-stone-600">
        Shared via Botty · <a href="/" className="underline hover:text-stone-400">Open Botty</a>
      </div>
    </div>
  );
}
