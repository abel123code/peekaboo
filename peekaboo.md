# Peekaboo
## Exploiting Codex for Agentic Engine Optimization

*Built at Sea x OpenAI Regional Hackathon, June 2026*
*Team: `git commit -m "openai"` — Abel Lee · Abhishek Vulla · Ryan Chan · Poh Jun Leng*

---

## The Problem

SEO built pages for Google. GEO built pages for ChatGPT. But now a third wave is here — AI coding agents like Codex and Claude Code are autonomously researching, evaluating, and recommending tools on behalf of developers. Nobody sees this happening. No analytics event fires. Your content is either cited or invisible, and you have no idea which.

This is the AEO gap. And nobody has built the tool to close it.

---

## The Insight

When a developer asks Codex to "build a payment integration for Singapore," Codex doesn't ask the developer which SDK to use. It researches autonomously — searches the web, fetches documentation, evaluates options, and picks a winner. If your product isn't structured for agent consumption, you lose that decision silently. Every time.

The brands winning in the agent era aren't winning on marketing. They're winning on how their content is structured for machines.

---

## What Peekaboo Does

Peekaboo is built on two core modules that work in sequence.

---

## Module 1 — Reddit Intelligence Agent

### Input
A hardcoded company profile JSON:

```json
{
  "name": "HitPay",
  "url": "https://hitpay.com",
  "description": "Payment platform for Singapore SMEs — PayNow, QR, card payments",
  "category": "payments API",
  "use_cases": ["checkout integration", "QR payments", "PayNow", "recurring billing"],
  "competitors": ["Stripe", "Adyen", "Braintree"],
  "target_audience": "developers building e-commerce in Singapore and SEA"
}
```

### What the agent does

A Codex agent takes the company JSON and autonomously:

1. **Determines which subreddits are worth crawling** based on the company category and audience. It scores each subreddit by relevance — not just obvious ones like r/webdev, but niche communities where the ICP actually lives.

```
scored subreddits for "payments API / Singapore":
  r/webdev          → score: 0.91
  r/node            → score: 0.87
  r/nextjs          → score: 0.84
  r/sideprojects    → score: 0.79
  r/singapore       → score: 0.76
  r/startups        → score: 0.71
  r/SaaS            → score: 0.68
```

2. **Searches each subreddit** using the Reddit API for threads matching the company's use cases and pain points.

3. **Scores and filters threads** by relevance — is this a problem our product actually solves? Is it recent? Does it have engagement signal?

4. **Outputs 5-8 high-signal threads** — real developer pain points that the company's product should be the answer to.

```json
{
  "threads": [
    {
      "subreddit": "r/nextjs",
      "title": "How do I add PayNow QR to my checkout flow?",
      "url": "reddit.com/r/nextjs/...",
      "score": 0.94,
      "why_relevant": "Direct use case match — PayNow integration in Next.js"
    },
    {
      "subreddit": "r/webdev",
      "title": "Best payment gateway for Singapore startup, not Stripe?",
      "url": "reddit.com/r/webdev/...",
      "score": 0.91,
      "why_relevant": "Competitor comparison thread — HitPay should be top answer"
    }
  ]
}
```

### Tech
- Reddit API (search + thread fetch)
- OpenAI Responses API with web_search tool
- GPT-4o for subreddit scoring and thread relevance filtering

---

## Module 2 — Virtual Codex Runner + Birdseye

### What the agent does

For each thread from Module 1, Peekaboo spins up a virtual Codex agent that autonomously researches and solves the developer's problem — exactly as a real Codex session would.

**Every tool call is intercepted and logged in real time.**

### The parallel runner

```
thread_1 → [CODEX AGENT 1] → session_log_1
thread_2 → [CODEX AGENT 2] → session_log_2
thread_3 → [CODEX AGENT 3] → session_log_3
thread_4 → [CODEX AGENT 4] → session_log_4
thread_5 → [CODEX AGENT 5] → session_log_5
```

All agents run in parallel. All sessions stream live to the frontend via SSE.

### What gets intercepted per agent

```json
{
  "session_id": "uuid",
  "thread": "How do I add PayNow QR to my checkout flow?",
  "turns": [
    {
      "turn": 1,
      "tool": "web_search",
      "query": "PayNow QR code Next.js integration 2025",
      "results": ["stripe.com/docs/paynow", "hitpay.com/docs", "docs.adyen.com"],
      "timestamp": 1234567890
    },
    {
      "turn": 2,
      "tool": "web_fetch",
      "url": "https://stripe.com/docs/paynow",
      "tokens_read": 4200,
      "timestamp": 1234567891
    },
    {
      "turn": 3,
      "tool": "web_fetch",
      "url": "https://hitpay.com/docs",
      "tokens_read": 890,
      "timestamp": 1234567892
    }
  ],
  "company_cited": false,
  "competitor_cited": "Stripe",
  "reason_ignored": "HitPay docs fetched but only 890 tokens — agent truncated, insufficient context"
}
```

### Birdseye UI — the demo moment

The frontend shows all agents running as parallel swimlanes, live:

```
┌─────────────────────────────────────────────────────┐
│  Agent 1 │ search → fetch → STRIPE CITED ✓         │
│  Agent 2 │ search → fetch → STRIPE CITED ✓         │
│  Agent 3 │ search → fetch → IGNORED ✗              │
│  Agent 4 │ search → fetch → STRIPE CITED ✓         │
│  Agent 5 │ search → fetch → IGNORED ✗              │
│                                                     │
│  HitPay cited: 0/5     Stripe cited: 3/5           │
│                                                     │
│  [Timeline] [Research] [Sources] [Gap Report]      │
└─────────────────────────────────────────────────────┘
```

---

## Gap Analysis

After all sessions complete, Peekaboo runs a gap analysis against the company's domain:

```
AEO signal audit for hitpay.com:

  ☒ llms.txt — MISSING
  ☒ robots.txt — blocks ClaudeBot, GPTBot
  ☒ docs token count — 89,000 tokens (agent truncated)
  ☒ JS rendering — docs require JS to render
  ☑ capability signalling — partial

Result: You lost 5/5 agent decisions to Stripe.
Root cause: agents fetched your docs but truncated 
at 890 tokens. Stripe's docs are 4,200 tokens — 
complete, structured, agent-readable.
```

---

## Agent Page Generator

Peekaboo auto-generates the three assets that fix the gap:

**1. llms.txt** — structured sitemap for AI agents
```
# HitPay Documentation

## Getting Started
- [Quick Start](/docs/quickstart): Accept your first PayNow payment in 5 minutes
- [Authentication](/docs/auth): API key setup and OAuth patterns

## Payment Methods
- [PayNow QR](/docs/paynow): Generate and handle PayNow QR codes (8K tokens)
- [Card Payments](/docs/cards): Visa/Mastercard integration (6K tokens)
```

**2. Token-optimised doc page** — capability-first, JS-free, under 25k tokens

**3. robots.txt patch** — explicitly permits AI agent crawlers:
```
User-agent: ClaudeBot
Allow: /

User-agent: GPTBot
Allow: /

User-agent: anthropic-ai
Allow: /
```

---

## Verify Loop

Re-run the same 5 Codex agents after implementing generated assets:

```
BEFORE:  HitPay cited 0/5 agent decisions
AFTER:   HitPay cited 4/5 agent decisions

Delta: +4 citations
Root fix: llms.txt + token-optimised docs
```

Closed loop. Measurable. Repeatable.

---

## The Scale Story

One master Codex agent orchestrates multiple sub-agents in parallel. A human AEO audit takes weeks. Peekaboo runs 50 simulations in 5 minutes.

**Agents calling agents. Observable at every step.**

---

## Why Now

The shift is already happening. Addy Osmani (Director, Google Cloud AI) documented it: AI coding agents compress multi-page human navigation into a single HTTP request. Scroll depth is zero. Time-on-page is 400 milliseconds. The funnel you've optimised for years is blind to agent traffic. But the agent was absolutely there — and it made a decision without you.

SEO gave you PageRank. GEO gave you citation tracking. Peekaboo gives you AEO — the map to win the agent era.

---

## Full Architecture

```
INPUT
─────
Company Profile JSON (hardcoded)
{ name, url, description, category, use_cases, competitors }
        │
        ▼
┌─────────────────────────────────────────────────────┐
│              MODULE 1: REDDIT AGENT                 │
│                                                     │
│  Codex agent takes company JSON                     │
│       │                                             │
│       ├── scores subreddits by relevance            │
│       ├── searches each via Reddit API              │
│       ├── filters threads by ICP match              │
│       └── outputs 5-8 high-signal threads           │
└───────┬─────────────────────────────────────────────┘
        │
        │  threads[]
        ▼
┌─────────────────────────────────────────────────────┐
│         MODULE 2: PARALLEL CODEX RUNNER             │
│                                                     │
│  thread_1 → [CODEX AGENT 1] → session_log_1        │
│  thread_2 → [CODEX AGENT 2] → session_log_2        │
│  thread_3 → [CODEX AGENT 3] → session_log_3        │
│  thread_4 → [CODEX AGENT 4] → session_log_4        │
│  thread_5 → [CODEX AGENT 5] → session_log_5        │
│                                                     │
│  Each agent:                                        │
│  ├── tools: [web_search, web_fetch]                 │
│  ├── prompt: "solve this dev problem"               │
│  └── every tool_use block intercepted + logged      │
│                                                     │
│  SSE stream → Frontend live                         │
└───────┬─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────┐
│              SESSION AGGREGATOR                     │
│                                                     │
│  per session:                                       │
│  { thread, searches[], sources_fetched[],           │
│    sources_cited[], company_cited,                  │
│    competitor_cited, tokens_per_source }            │
└───────┬─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────┐
│                GAP ANALYSER                         │
│                                                     │
│  ☐ llms.txt present?                               │
│  ☐ robots.txt blocking AI agents?                  │
│  ☐ token count < 25k per page?                     │
│  ☐ content parseable without JS?                   │
│  ☐ capability signalling in docs?                  │
│  ☐ cited in agent decisions?                       │
└───────┬─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────┐
│            AGENT PAGE GENERATOR                     │
│                                                     │
│  1. llms.txt                                       │
│  2. token-optimised doc page                       │
│  3. robots.txt patch                               │
└───────┬─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────┐
│              VERIFY LOOP                            │
│                                                     │
│  Re-run same agents → compare before/after         │
│  BEFORE: 0/5 cited  →  AFTER: 4/5 cited            │
└─────────────────────────────────────────────────────┘

FRONTEND — Birdseye UI (React + SSE)
─────────────────────────────────────
┌─────────────────────────────────────────────────────┐
│  Agent 1 │ search → fetch → cite                   │
│  Agent 2 │ search → fetch → IGNORED                │
│  Agent 3 │ search → fetch → cite                   │
│  Agent 4 │ search → fetch → IGNORED                │
│  Agent 5 │ search → fetch → cite                   │
│                                                     │
│  [Timeline] [Research] [Sources] [Gap Report]      │
└─────────────────────────────────────────────────────┘
```

---

## The Stack

| Layer | Technology |
|---|---|
| Virtual Codex runner | OpenAI Responses API + tool interception |
| Multi-agent orchestration | OpenAI Agents SDK |
| Reddit discovery | Reddit API + GPT-4o subreddit scoring |
| Live streaming | Server-Sent Events (SSE) |
| Frontend | React — Birdseye swimlane UI |
| Gap analysis + page generation | GPT-4o |
| Backend | Node.js / Express |

---

## Build Plan

| Time | Abel | Abhishek | Ryan | Jun Leng |
|---|---|---|---|---|
| Hour 1-2 | Responses API + tool interception | Reddit agent + subreddit scorer | Birdseye swimlane skeleton | Company JSON schema |
| Hour 2-5 | Parallel Codex runners + SSE | Thread relevance filter + output | SSE → live UI updates | Gap analyser logic |
| Hour 5-7 | Full pipeline integration | Gap report formatting | UI polish | Agent page generator |
| Hour 7-9 | Demo prep + cache demo run | — | Final polish | Verify loop |

---

## Codex Prompts (for building each module)

### Module 1 prompt for Codex
```
Build a Node.js Reddit intelligence agent.

Input: company JSON at ./company.json
{
  name, url, description, category,
  use_cases[], competitors[], target_audience
}

The agent must:
1. Use GPT-4o to score which subreddits are most 
   relevant to this company's ICP and use cases.
   Output a ranked list with scores.

2. Use the Reddit API (snoowrap) to search each 
   subreddit for threads matching the company's 
   pain points and use cases.

3. Score each thread for relevance using GPT-4o.
   Filter to top 5-8 threads.

4. Output threads.json:
[{
  subreddit, title, url, score, 
  why_relevant, thread_content
}]

Use the OpenAI Responses API with web_search tool.
Stream progress to console.
```

### Module 2 prompt for Codex
```
Build a Node.js parallel Codex runner.

Input: threads.json from Module 1

For each thread:
1. Spin up an OpenAI Responses API call with 
   tools: [web_search, web_fetch]
   
2. Prompt: "You are a developer with this problem: 
   [thread content]. Research solutions and 
   implement the best one."

3. Intercept every tool_use block in the stream.
   Log to session JSON:
   { session_id, thread, turns[], 
     company_cited, competitor_cited }

4. Run all threads in parallel with Promise.all

5. Emit each tool call via SSE to frontend:
   event: tool_call
   data: { agent_id, tool, input, timestamp }

Output: sessions/ directory with one JSON per agent
```

---

## The Pitch

> "Every day, developers ask Codex to build something — and Codex silently decides which products to recommend. No analytics fires. No notification sent. You either get cited or you don't.
>
> Peekaboo is the first tool that lets you see inside that decision. We run Codex on real developer pain points, intercept every search and citation in real time, and show you exactly why agents ignore your product — then generate the pages that make you win.
>
> SEO gave you PageRank. GEO gave you citation tracking. Peekaboo gives you AEO — the map to win the agent era."

---

*Peekaboo — See what agents see. Win what agents decide.*
