# Peekaboo AEO Workflow

This folder contains Peekaboo's shared AEO engine: LLM agents, integrations, schemas, and pipeline code used by the web app and local CLI runs.

The folder name remains `tools/seo-agent` for compatibility with existing imports and scripts, but the product positioning is AEO-first.

## API Keys

Copy `.env.example` to `.env`, then fill in your keys:

```powershell
copy .env.example .env
```

Required:

```env
GEMINI_API_KEY=
```

Recommended:

```env
DATAFORSEO_USERNAME=
DATAFORSEO_PASSWORD=
```

Optional:

```env
UNSPLASH_ACCESS_KEY=
```

Only `GEMINI_API_KEY` is strictly required. DataForSEO is used for keyword metrics, SERP facts, and competitor data. Unsplash is optional for image URLs.

## Local Commands

Install once:

```powershell
cd tools/seo-agent
npm install
```

Check TypeScript:

```powershell
npm run check
```

Run the sample workflow:

```powershell
npm run run:sample
```

## Input Example

```json
{
  "runName": "single-bed-size-singapore",
  "goal": "Create an AEO article that gives Singapore shoppers a direct, citation-ready answer about single bed size and how to choose the right single mattress.",
  "topic": "Single Bed Size in Singapore: Mattress Dimensions and Buying Guide",
  "targetKeyword": "single bed size",
  "audience": "Singapore shoppers comparing single bed and mattress sizes for children, guest rooms, rental rooms, or compact bedrooms.",
  "imageSearchQuery": "single bed mattress compact bedroom singapore"
}
```

## Output

Each run creates a folder in:

```txt
tools/seo-agent/outputs/
```

The final post is:

```txt
09-final-post-packager.json
```

## Flow

```txt
input task
  -> Search Demand Analyst
  -> SERP Competitor Researcher
  -> ICP Pain Hypothesis Strategist
  -> Article Brief Strategist
  -> AEO Outline Architect
  -> CTA Placement Strategist
  -> Long Form Content Writer
  -> Editorial AEO Reviewer
  -> Final Post Packager
  -> JSON output files
```

The workflow is optimized for answer-ready content: direct answers, source-backed reasoning, useful structure, clear metadata, and practical next steps.
