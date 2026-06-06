import type { z } from "zod";
import type { SeoContentTask } from "../schemas.js";
import { PostMetadataSchema } from "../schemas.js";
import { slugify } from "./json-utils.js";

type PostMetadata = z.infer<typeof PostMetadataSchema>;

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function trimToLength(value: string, maxLength: number): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) return normalized;

  const sliced = normalized.slice(0, maxLength - 1);
  const sentenceBreak = Math.max(
    sliced.lastIndexOf("."),
    sliced.lastIndexOf("!"),
    sliced.lastIndexOf("?")
  );
  if (sentenceBreak >= Math.floor(maxLength * 0.55)) {
    return sliced.slice(0, sentenceBreak + 1).trim();
  }

  const lastSpace = sliced.lastIndexOf(" ");
  const cutoff = lastSpace >= Math.floor(maxLength * 0.55) ? lastSpace : maxLength - 1;
  return `${sliced.slice(0, cutoff).trim()}...`;
}

function normalizeBullets(bullets: string[]): string[] {
  const cleaned = bullets.map(normalizeWhitespace).filter(Boolean);
  if (cleaned.length >= 3) return cleaned.slice(0, 5);
  return cleaned;
}

export function normalizePostMetadata(raw: PostMetadata, task: SeoContentTask): PostMetadata {
  return PostMetadataSchema.parse({
    ...raw,
    title: normalizeWhitespace(raw.title),
    slug: slugify(raw.slug || raw.title),
    meta_description: trimToLength(raw.meta_description, 160),
    target_keyword: normalizeWhitespace(raw.target_keyword || task.targetKeyword),
    summary_bullets: normalizeBullets(raw.summary_bullets),
    excerpt: trimToLength(raw.excerpt, 280),
    cta_banner: {
      headline: trimToLength(raw.cta_banner.headline, 95),
      description: trimToLength(raw.cta_banner.description, 180),
      button_label: trimToLength(raw.cta_banner.button_label, 36),
      button_url: task.website.url
    }
  });
}
