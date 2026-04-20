/**
 * Parses message content for renderable artifact code blocks.
 * Artifact languages: html, tsx, jsx, svg, vue, svelte.
 * Returns segments: either plain text or artifact objects.
 */

export type ArtifactSegment =
  | { type: 'text'; content: string }
  | { type: 'artifact'; lang: string; code: string; index: number };

const ARTIFACT_LANGS = new Set(['html', 'tsx', 'jsx', 'svg', 'vue', 'svelte']);

export function parseArtifacts(content: string): ArtifactSegment[] {
  const segments: ArtifactSegment[] = [];
  // Match fenced code blocks: ```lang\n...code...\n```
  const FENCE_RE = /^```([\w.+-]*)\n([\s\S]*?)^```/gm;
  let lastIndex = 0;
  let artifactIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = FENCE_RE.exec(content)) !== null) {
    const lang = match[1].toLowerCase().trim();
    const code = match[2];
    const start = match.index;
    const end = match.index + match[0].length;

    // Text before this block
    if (start > lastIndex) {
      segments.push({ type: 'text', content: content.slice(lastIndex, start) });
    }

    if (ARTIFACT_LANGS.has(lang)) {
      segments.push({ type: 'artifact', lang, code, index: artifactIndex++ });
    } else {
      // Keep non-artifact code blocks as plain text
      segments.push({ type: 'text', content: match[0] });
    }

    lastIndex = end;
  }

  // Trailing text
  if (lastIndex < content.length) {
    segments.push({ type: 'text', content: content.slice(lastIndex) });
  }

  return segments;
}

/** Returns true if the content contains at least one renderable artifact. */
export function hasArtifacts(content: string): boolean {
  return parseArtifacts(content).some(s => s.type === 'artifact');
}
