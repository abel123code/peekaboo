export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Client = {
  id: string;
  name: string;
  website_url: string;
  website_context: string;
  default_audience: string | null;
  brand_voice: string | null;
  default_location_name: string;
  default_language_name: string;
  created_at: string;
  updated_at: string;
};

export type WorkflowRunStatus = "queued" | "running" | "failed" | "completed";
export type ArticleDraftStatus = "draft" | "approved" | "rejected";
export type KeywordResearchRunStatus = "queued" | "running" | "failed" | "completed";
export type CompetitorIntelligenceRunStatus = "queued" | "running" | "failed" | "completed";
export type RedditIntelligenceRunStatus = "queued" | "running" | "failed" | "completed";
export type CompetitorIntelligenceRunMode = "fetch_and_analyze" | "analyze_only" | "fetch_only";
export type CompetitorRecommendationType = "gap" | "weak_overlap" | "existing_opportunity";
export type CompetitorRecommendationStatus = "recommended" | "used_in_writer" | "dismissed";
export type AgentConversationStatus = "active" | "archived";
export type AgentMessageRole = "user" | "assistant" | "tool";
export type FunnelStage = "awareness" | "consideration" | "comparison" | "decision" | "retention";

export type WorkflowRun = {
  id: string;
  client_id: string;
  run_name: string;
  keyword: string;
  topic: string;
  goal: string;
  audience: string | null;
  image_search_query: string | null;
  brand_voice_override: string | null;
  backlinks: Json;
  status: WorkflowRunStatus;
  current_stage: string | null;
  trigger_run_id: string | null;
  artifact_bucket: string | null;
  artifact_prefix: string | null;
  local_run_dir: string | null;
  final_post_path: string | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ArticleDraft = {
  id: string;
  run_id: string;
  client_id: string;
  status: ArticleDraftStatus;
  title: string;
  slug: string;
  meta_description: string;
  target_keyword: string;
  excerpt: string;
  summary_bullets: Json;
  cta_banner: Json;
  content: string;
  seo_review: Json;
  icp_pain_hypothesis: Json;
  images: Json;
  review_notes: string | null;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ClientProfile = {
  id: string;
  client_id: string;
  profile: Json;
  created_at: string;
  updated_at: string;
};

export type KeywordResearchRun = {
  id: string;
  client_id: string;
  status: KeywordResearchRunStatus;
  current_stage: string | null;
  trigger_run_id: string | null;
  location_name: string;
  language_name: string;
  seed_terms: Json;
  dataforseo_payload: Json;
  summary: Json;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type KeywordOpportunity = {
  id: string;
  research_run_id: string;
  client_id: string;
  keyword: string;
  normalized_keyword: string;
  funnel_stage: FunnelStage;
  intent: string | null;
  search_volume: number;
  cpc: number;
  competition: string | null;
  keyword_difficulty: number | null;
  trend: Json;
  relevance_score: number;
  business_value_score: number;
  opportunity_score: number;
  suggested_topic: string;
  suggested_goal: string;
  suggested_audience: string | null;
  image_search_query: string | null;
  reference_links: Json;
  rationale: string;
  created_at: string;
};

export type CompetitorIntelligenceSnapshot = {
  id: string;
  client_id: string;
  location_name: string;
  language_name: string;
  artifact_bucket: string | null;
  artifact_prefix: string | null;
  competitors: Json;
  competitor_count: number;
  keyword_count: number;
  skipped_reasons: Json;
  created_at: string;
};

export type CompetitorIntelligenceRun = {
  id: string;
  client_id: string;
  snapshot_id: string | null;
  mode: CompetitorIntelligenceRunMode;
  status: CompetitorIntelligenceRunStatus;
  current_stage: string | null;
  trigger_run_id: string | null;
  location_name: string;
  language_name: string;
  artifact_bucket: string | null;
  artifact_prefix: string | null;
  summary: Json;
  memory_path: string | null;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CompetitorRecommendation = {
  id: string;
  run_id: string;
  snapshot_id: string | null;
  client_id: string;
  keyword: string;
  normalized_keyword: string;
  recommendation_type: CompetitorRecommendationType;
  funnel_stage: FunnelStage;
  intent: string | null;
  search_volume: number;
  cpc: number;
  competition: string | null;
  keyword_difficulty: number | null;
  opportunity_score: number;
  source_competitors: Json;
  evidence: Json;
  suggested_topic: string;
  suggested_goal: string;
  suggested_audience: string | null;
  image_search_query: string | null;
  reference_links: Json;
  rationale: string;
  status: CompetitorRecommendationStatus;
  workflow_run_id: string | null;
  article_draft_id: string | null;
  created_at: string;
};

export type PublishedContentCoverage = {
  id: string;
  client_id: string;
  keyword: string;
  normalized_keyword: string;
  article_draft_id: string | null;
  workflow_run_id: string | null;
  title: string;
  slug: string;
  published_at: string;
  created_at: string;
  updated_at: string;
};

export type AgentConversation = {
  id: string;
  client_id: string;
  title: string;
  status: AgentConversationStatus;
  created_at: string;
  updated_at: string;
};

export type AgentMessage = {
  id: string;
  conversation_id: string;
  client_id: string;
  role: AgentMessageRole;
  content: string;
  metadata: Json;
  created_at: string;
};

export type RedditIntelligenceRun = {
  id: string;
  profile_slug: string;
  profile_name: string | null;
  status: RedditIntelligenceRunStatus;
  current_stage: string | null;
  trigger_run_id: string | null;
  company_profile_snapshot: Json;
  investigation_trace: Json;
  summary: Json;
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RedditThread = {
  id: string;
  run_id: string;
  reddit_id: string;
  subreddit: string;
  title: string;
  url: string;
  reddit_score: number;
  comment_count: number;
  created_utc: string | null;
  relevance_score: number;
  urgency_score: number;
  commercial_intent_score: number;
  why_relevant: string;
  thread_content: string;
  matched_services: Json;
  matched_icps: Json;
  metadata: Json;
  created_at: string;
};
