import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Rendering a note's markdown body — read-only, and safely.
 *
 * A plain, shared presentational component with no server-only dependency
 * and no `"use client"` boundary of its own: it renders identically as part
 * of a Server Component (the note detail page's read view) or inside an
 * already-client component tree (`NoteFields`' live "Preview" tab), because
 * it needs neither the network nor the DOM to do its job. Nothing here
 * decides *when* to show a preview — that is `NoteFields`' job — only *how*
 * to turn markdown text into safe React elements.
 *
 * **Safety is the point, and it is the library's default behaviour, not a
 * configuration this file has to get right.** `react-markdown` compiles
 * markdown straight to React elements; it never calls
 * `dangerouslySetInnerHTML` for what it parses, so a literal
 * `<script>...</script>` typed into a note becomes inert, escaped text —
 * never a DOM node. `rehype-raw`, the one plugin that would change that by
 * letting raw HTML in the source become real DOM, is deliberately never
 * added. `remark-gfm` adds the feature set notes actually need: tables,
 * strikethrough, autolinks and — the one that matters for a knowledge base —
 * `- [ ]`/`- [x]` checklists, rendered as disabled checkboxes (no block
 * editor; nothing here is interactive). Link and image URLs pass through
 * `react-markdown`'s own `defaultUrlTransform`, which neutralises schemes
 * like `javascript:` — pinned down directly in
 * `note-markdown-safety.test.ts`, and proven end-to-end against a real
 * browser in `e2e/notes.spec.ts`. See docs/DECISIONS.md ADR 034.
 */
export function NoteMarkdown({ body }: { body: string }) {
  if (body.trim().length === 0) {
    return <p className="text-muted-foreground text-sm">Nothing written yet.</p>;
  }

  return (
    <div className="note-content text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // External links open in their own tab; `rel` is what keeps that
          // safe (no `window.opener` handed to a page this note doesn't
          // control), and the plain-anchor default is otherwise unchanged.
          //
          // `node` is destructured out and dropped, not spread: react-markdown
          // hands every custom renderer the underlying hast node alongside the
          // real HTML props, and spreading it onto the DOM element renders it
          // as a literal, invalid `node="[object Object]"` attribute — caught
          // by inspecting the actual rendered output, not by reading the type.
          a: ({ href, children, node: _node, ...props }) => (
            <a {...props} href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
