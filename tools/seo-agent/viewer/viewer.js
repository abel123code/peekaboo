const state = {
  runs: [],
  currentRun: null,
  currentData: null,
  view: "post"
};

const elements = {
  runSelect: document.querySelector("#runSelect"),
  runMeta: document.querySelector("#runMeta"),
  status: document.querySelector("#status"),
  postView: document.querySelector("#postView"),
  seoView: document.querySelector("#seoView"),
  jsonView: document.querySelector("#jsonView"),
  title: document.querySelector("#title"),
  targetKeyword: document.querySelector("#targetKeyword"),
  slug: document.querySelector("#slug"),
  excerpt: document.querySelector("#excerpt"),
  summaryBullets: document.querySelector("#summaryBullets"),
  heroImage: document.querySelector("#heroImage"),
  content: document.querySelector("#content"),
  seoReview: document.querySelector("#seoReview"),
  rawJson: document.querySelector("#rawJson")
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function renderTable(lines, startIndex) {
  const tableLines = [];
  let index = startIndex;
  while (index < lines.length && /^\s*\|.+\|\s*$/.test(lines[index])) {
    tableLines.push(lines[index]);
    index++;
  }

  const rows = tableLines
    .filter((line) => !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line))
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => inlineMarkdown(cell.trim()))
    );

  if (!rows.length) return { html: "", nextIndex: index };
  const [head, ...body] = rows;
  const html = `
    <table>
      <thead><tr>${head.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead>
      <tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
    </table>
  `;
  return { html, nextIndex: index };
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let list = null;

  function flushParagraph() {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function closeList() {
    if (!list) return;
    html.push(`</${list}>`);
    list = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line === ":::cta") {
      flushParagraph();
      closeList();
      const cta = {};
      i++;
      while (i < lines.length && lines[i].trim() !== ":::") {
        const raw = lines[i].trim();
        const separator = raw.indexOf(":");
        if (separator !== -1) {
          const key = raw.slice(0, separator).trim().toLowerCase();
          const value = raw.slice(separator + 1).trim();
          cta[key] = value;
        }
        i++;
      }
      html.push(renderCtaBanner({
        headline: cta.headline,
        description: cta.description,
        button_label: cta.button
      }));
      continue;
    }

    if (!line || line === "---") {
      flushParagraph();
      closeList();
      continue;
    }

    if (/^\|.+\|$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      flushParagraph();
      closeList();
      const table = renderTable(lines, i);
      html.push(table.html);
      i = table.nextIndex - 1;
      continue;
    }

    const heading = line.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = Math.min(heading[1].length, 3);
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (list !== "ul") {
        closeList();
        list = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${inlineMarkdown(unordered[1])}</li>`);
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (list !== "ol") {
        closeList();
        list = "ol";
        html.push("<ol>");
      }
      html.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      continue;
    }

    if (line.startsWith(">")) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${inlineMarkdown(line.replace(/^>\s*/, ""))}</blockquote>`);
      continue;
    }

    closeList();
    paragraph.push(line);
  }

  flushParagraph();
  closeList();
  return html.join("\n");
}

function renderCtaBanner(cta) {
  const fallback = state.currentData?.post?.cta_banner || {};
  const websiteUrl = state.currentData?.post?.source_task?.website?.url || fallback.button_url || "#";
  const headline = cta.headline || fallback.headline || "Ready to take the next step?";
  const description = cta.description || fallback.description || "Visit the main site for more details.";
  const buttonLabel = cta.button_label || fallback.button_label || "Visit website";

  return `
    <section class="cta-banner">
      <div>
        <h2>${inlineMarkdown(headline)}</h2>
        <p>${inlineMarkdown(description)}</p>
      </div>
      <a href="${escapeHtml(websiteUrl)}" target="_blank" rel="noreferrer">${escapeHtml(buttonLabel)}</a>
    </section>
  `;
}

function renderPost(data) {
  const post = data.post;
  elements.title.textContent = post.title;
  elements.targetKeyword.textContent = post.target_keyword;
  elements.slug.textContent = `/${post.slug}`;
  elements.excerpt.textContent = post.excerpt;
  elements.summaryBullets.innerHTML = (post.summary_bullets || [])
    .map((item) => `<div class="summary-item">${inlineMarkdown(item)}</div>`)
    .join("");

  const hero = post.images?.[0];
  if (hero?.url) {
    elements.heroImage.innerHTML = `<img src="${escapeHtml(hero.url)}" alt="${escapeHtml(hero.alt || post.title)}" />`;
  } else {
    elements.heroImage.innerHTML = `<div>Image placeholder: ${escapeHtml(hero?.alt || post.title)}</div>`;
  }

  const hasCtaMarker = /(^|\n):::\s*cta\s*(\n|$)/i.test(post.content || "");
  const contentWithCta = hasCtaMarker
    ? post.content
    : `${post.content || ""}\n\n:::cta\nheadline: ${post.cta_banner?.headline || `Ready to compare ${post.target_keyword}?`}\ndescription: ${post.cta_banner?.description || "Visit the main site for more details."}\nbutton: ${post.cta_banner?.button_label || "Visit website"}\n:::`;
  elements.content.innerHTML = renderMarkdown(contentWithCta);
}

function renderSeoReview(data) {
  const review = data.post.seo_review || {};
  const groups = [
    ["Passes", review.passes],
    ["Issues", review.issues],
    ["Recommended Edits", review.recommended_edits],
    ["Human Review Notes", review.human_review_notes]
  ];

  elements.seoReview.innerHTML = `
    <div class="review-grid">
      <div class="review-card">
        <h3>Score</h3>
        <div class="score">${escapeHtml(review.score ?? "N/A")}</div>
      </div>
      ${groups
        .map(
          ([title, items]) => `
            <div class="review-card">
              <h3>${title}</h3>
              <ul>${(items || []).map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function setView(view) {
  state.view = view;
  for (const button of document.querySelectorAll(".tab")) {
    button.classList.toggle("active", button.dataset.view === view);
  }
  elements.postView.classList.toggle("hidden", view !== "post");
  elements.seoView.classList.toggle("hidden", view !== "seo");
  elements.jsonView.classList.toggle("hidden", view !== "json");
}

async function loadRun(runId) {
  elements.status.classList.remove("hidden");
  elements.status.textContent = "Loading selected run...";
  const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`);
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  state.currentRun = runId;
  state.currentData = data;

  renderPost(data);
  renderSeoReview(data);
  elements.rawJson.textContent = JSON.stringify(data, null, 2);
  elements.runMeta.innerHTML = `<strong>${escapeHtml(runId)}</strong>`;
  elements.status.classList.add("hidden");
  setView(state.view);
}

async function init() {
  const response = await fetch("/api/runs");
  const data = await response.json();
  state.runs = data.runs || [];

  if (!state.runs.length) {
    elements.status.textContent = "No completed output runs found.";
    return;
  }

  elements.runSelect.innerHTML = state.runs
    .map((run) => `<option value="${escapeHtml(run.id)}">${escapeHtml(run.id)}</option>`)
    .join("");

  elements.runSelect.addEventListener("change", () => loadRun(elements.runSelect.value));
  for (const button of document.querySelectorAll(".tab")) {
    button.addEventListener("click", () => setView(button.dataset.view));
  }

  await loadRun(state.runs[0].id);
}

init().catch((error) => {
  elements.status.classList.remove("hidden");
  elements.status.textContent = error instanceof Error ? error.message : "Failed to load viewer.";
});
