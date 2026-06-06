"use client";

import { useMemo, useState } from "react";
import type { ArticleDraftStatus, Json } from "../../lib/database.types";

type DraftEditorProps = {
  draft: {
    id: string;
    status: ArticleDraftStatus;
    title: string;
    slug: string;
    meta_description: string;
    excerpt: string;
    target_keyword: string;
    summary_bullets: Json;
    cta_banner: Json;
    content: string;
    seo_review: Json;
    icp_pain_hypothesis: Json;
    review_notes: string | null;
  };
};

function asStringArray(value: Json): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asRecord(value: Json): Record<string, string> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typeof item === "string" ? item : ""]))
    : {};
}

function renderInline(text: string) {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      parts.push(<strong key={`strong-${match.index}`}>{match[2]}</strong>);
    } else if (match[4] && match[5]) {
      parts.push(
        <a key={`link-${match.index}`} href={match[5]} target="_blank" rel="noreferrer">
          {match[4]}
        </a>
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function parseTable(lines: string[], startIndex: number) {
  const rows: string[][] = [];
  let index = startIndex;

  while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index] || "")) {
    const line = lines[index] || "";
    if (!/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line)) {
      rows.push(
        line
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((cell) => cell.trim())
      );
    }
    index++;
  }

  return { rows, nextIndex: index };
}

function MarkdownArticle({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trimEnd() || "";

    if (!line.trim()) {
      index++;
      continue;
    }

    if (line.trim() === ":::cta") {
      const cta: Record<string, string> = {};
      index++;
      while (index < lines.length && lines[index]?.trim() !== ":::") {
        const current = lines[index] || "";
        const separatorIndex = current.indexOf(":");
        if (separatorIndex !== -1) {
          cta[current.slice(0, separatorIndex).trim()] = current.slice(separatorIndex + 1).trim();
        }
        index++;
      }
      blocks.push(
        <aside className="rendered-cta" key={`cta-${index}`}>
          <h3>{cta.headline || "Next step"}</h3>
          <p>{cta.description || ""}</p>
          {cta.button ? <span>{cta.button}</span> : null}
        </aside>
      );
      index++;
      continue;
    }

    if (/^#{2,4}\s+/.test(line)) {
      const level = line.match(/^#+/)?.[0].length || 2;
      const text = line.replace(/^#{2,4}\s+/, "");
      if (level === 2) blocks.push(<h2 key={`h-${index}`}>{renderInline(text)}</h2>);
      else blocks.push(<h3 key={`h-${index}`}>{renderInline(text)}</h3>);
      index++;
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|.*\|\s*$/.test(lines[index + 1] || "")) {
      const { rows, nextIndex } = parseTable(lines, index);
      const [head, ...body] = rows;
      blocks.push(
        <div className="rendered-table-wrap" key={`table-${index}`}>
          <table className="rendered-table">
            {head ? (
              <thead>
                <tr>
                  {head.map((cell, cellIndex) => (
                    <th key={cellIndex}>{renderInline(cell)}</th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {body.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      index = nextIndex;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index] || "")) {
        items.push((lines[index] || "").replace(/^\s*[-*]\s+/, ""));
        index++;
      }
      blocks.push(
        <ul key={`ul-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index] || "")) {
        items.push((lines[index] || "").replace(/^\s*\d+\.\s+/, ""));
        index++;
      }
      blocks.push(
        <ol key={`ol-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index++;
    while (
      index < lines.length &&
      lines[index]?.trim() &&
      !/^#{2,4}\s+/.test(lines[index] || "") &&
      !/^\s*[-*]\s+/.test(lines[index] || "") &&
      !/^\s*\d+\.\s+/.test(lines[index] || "") &&
      !/^\s*\|.*\|\s*$/.test(lines[index] || "") &&
      lines[index]?.trim() !== ":::cta"
    ) {
      paragraph.push((lines[index] || "").trim());
      index++;
    }
    blocks.push(<p key={`p-${index}`}>{renderInline(paragraph.join(" "))}</p>);
  }

  return <div className="rendered-markdown">{blocks}</div>;
}

export function DraftEditor({ draft }: DraftEditorProps) {
  const cta = asRecord(draft.cta_banner);
  const [status, setStatus] = useState<ArticleDraftStatus>(draft.status);
  const [title, setTitle] = useState(draft.title);
  const [slug, setSlug] = useState(draft.slug);
  const [metaDescription, setMetaDescription] = useState(draft.meta_description);
  const [excerpt, setExcerpt] = useState(draft.excerpt);
  const [summaryBullets, setSummaryBullets] = useState(asStringArray(draft.summary_bullets).join("\n"));
  const [ctaHeadline, setCtaHeadline] = useState(cta.headline || "");
  const [ctaDescription, setCtaDescription] = useState(cta.description || "");
  const [ctaButtonLabel, setCtaButtonLabel] = useState(cta.button_label || "");
  const [ctaButtonUrl, setCtaButtonUrl] = useState(cta.button_url || "");
  const [content, setContent] = useState(draft.content);
  const [reviewNotes, setReviewNotes] = useState(draft.review_notes || "");
  const [activeTab, setActiveTab] = useState<"editor" | "preview" | "review">("editor");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const payload = useMemo(
    () => ({
      status,
      title,
      slug,
      meta_description: metaDescription,
      excerpt,
      summary_bullets: summaryBullets
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      cta_banner: {
        headline: ctaHeadline,
        description: ctaDescription,
        button_label: ctaButtonLabel,
        button_url: ctaButtonUrl
      },
      content,
      review_notes: reviewNotes
    }),
    [content, ctaButtonLabel, ctaButtonUrl, ctaDescription, ctaHeadline, excerpt, metaDescription, reviewNotes, slug, status, summaryBullets, title]
  );

  async function save(nextStatus?: ArticleDraftStatus) {
    setSaving(true);
    setMessage(null);
    const body = nextStatus ? { ...payload, status: nextStatus } : payload;
    const response = await fetch(`/api/drafts/${draft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    setSaving(false);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Save failed." }));
      setMessage(error.error || "Save failed.");
      return;
    }

    if (nextStatus) setStatus(nextStatus);
    setMessage(nextStatus ? `Marked ${nextStatus}.` : "Saved.");
  }

  return (
    <div className="grid two">
      <section className="panel">
        <div className="row">
          <h2>Article Draft</h2>
          <span className={`badge ${status}`}>{status}</span>
        </div>
        <div className="tabs">
          <button className={`tab ${activeTab === "editor" ? "active" : ""}`} type="button" onClick={() => setActiveTab("editor")}>
            Editor
          </button>
          <button className={`tab ${activeTab === "preview" ? "active" : ""}`} type="button" onClick={() => setActiveTab("preview")}>
            Preview
          </button>
          <button className={`tab ${activeTab === "review" ? "active" : ""}`} type="button" onClick={() => setActiveTab("review")}>
            Review
          </button>
        </div>

        {activeTab === "editor" ? (
          <div className="form">
            <div className="field">
              <label>Title</label>
              <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="field">
              <label>Slug</label>
              <input className="input" value={slug} onChange={(event) => setSlug(event.target.value)} />
            </div>
            <div className="field">
              <label>Meta Description</label>
              <textarea className="textarea" value={metaDescription} onChange={(event) => setMetaDescription(event.target.value)} />
            </div>
            <div className="field">
              <label>Excerpt</label>
              <textarea className="textarea" value={excerpt} onChange={(event) => setExcerpt(event.target.value)} />
            </div>
            <div className="field">
              <label>Summary Bullets</label>
              <textarea className="textarea" value={summaryBullets} onChange={(event) => setSummaryBullets(event.target.value)} />
            </div>
            <div className="grid two">
              <div className="field">
                <label>CTA Headline</label>
                <input className="input" value={ctaHeadline} onChange={(event) => setCtaHeadline(event.target.value)} />
              </div>
              <div className="field">
                <label>CTA Button</label>
                <input className="input" value={ctaButtonLabel} onChange={(event) => setCtaButtonLabel(event.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>CTA Description</label>
              <textarea className="textarea" value={ctaDescription} onChange={(event) => setCtaDescription(event.target.value)} />
            </div>
            <div className="field">
              <label>CTA URL</label>
              <input className="input" value={ctaButtonUrl} onChange={(event) => setCtaButtonUrl(event.target.value)} />
            </div>
            <div className="field">
              <label>Markdown Body</label>
              <textarea className="textarea tall" value={content} onChange={(event) => setContent(event.target.value)} />
            </div>
          </div>
        ) : null}

        {activeTab === "preview" ? (
          <div className="preview-stack">
            <section className="preview-metadata" aria-label="Article metadata">
              <dl className="metadata-list">
                <div>
                  <dt>Target keyword</dt>
                  <dd>{draft.target_keyword}</dd>
                </div>
                <div>
                  <dt>Slug</dt>
                  <dd>{slug}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{status}</dd>
                </div>
                <div>
                  <dt>Meta length</dt>
                  <dd>{metaDescription.length} characters</dd>
                </div>
                <div>
                  <dt>Meta description</dt>
                  <dd>{metaDescription}</dd>
                </div>
                <div>
                  <dt>Excerpt</dt>
                  <dd>{excerpt}</dd>
                </div>
                <div>
                  <dt>Summary bullets</dt>
                  <dd>
                    <ul className="metadata-bullets">
                      {payload.summary_bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
                <div>
                  <dt>CTA</dt>
                  <dd>
                    {ctaHeadline}
                    <br />
                    {ctaDescription}
                    <br />
                    {ctaButtonLabel}
                  </dd>
                </div>
              </dl>
            </section>

            <article className="article-preview">
              <h1>{title}</h1>
              <p className="article-meta">{metaDescription}</p>
              {payload.summary_bullets.length > 0 ? (
                <section className="preview-summary">
                  <strong>Summary</strong>
                  <ul>
                    {payload.summary_bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                </section>
              ) : null}
              <MarkdownArticle content={content} />
            </article>
          </div>
        ) : null}

        {activeTab === "review" ? (
          <div className="stack">
            <div className="field">
              <label>Review Notes</label>
              <textarea className="textarea" value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} />
            </div>
            <div>
              <h3>AEO Review</h3>
              <pre className="json-box">{JSON.stringify(draft.seo_review, null, 2)}</pre>
            </div>
            <div>
              <h3>ICP Pain Hypothesis</h3>
              <pre className="json-box">{JSON.stringify(draft.icp_pain_hypothesis, null, 2)}</pre>
            </div>
          </div>
        ) : null}

        <div className="row" style={{ marginTop: 16 }}>
          <div className="row">
            <button className="button" disabled={saving} type="button" onClick={() => save()}>
              Save
            </button>
            <button className="button secondary" disabled={saving} type="button" onClick={() => save("approved")}>
              Approve
            </button>
            <button className="button danger" disabled={saving} type="button" onClick={() => save("rejected")}>
              Reject
            </button>
          </div>
          {message ? <span className="muted">{message}</span> : null}
        </div>
      </section>

      <aside className="panel">
        <h2>Publishing Readiness</h2>
        <div className="stack">
          <div>
            <strong>Target keyword</strong>
            <p>{draft.target_keyword}</p>
          </div>
          <div>
            <strong>Meta length</strong>
            <p className="muted">{metaDescription.length} characters</p>
          </div>
          <div>
            <strong>Body length</strong>
            <p className="muted">{content.length.toLocaleString()} characters</p>
          </div>
          <div>
            <strong>Next step</strong>
            <p className="muted">Approved drafts stay in Supabase until the client database write feature is added.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
