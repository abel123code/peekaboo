import { z } from "zod";

export const WebsiteSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  context: z.string().min(1)
});

export const LinkSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1)
});

export const SeoContentTaskSchema = z.object({
  runName: z.string().min(1).optional(),
  website: WebsiteSchema,
  goal: z.string().min(1),
  topic: z.string().min(1),
  targetKeyword: z.string().min(1),
  locationName: z.string().min(1).default("United States"),
  languageName: z.string().min(1).default("English"),
  audience: z.string().optional(),
  backlinks: z.array(LinkSchema).default([]),
  brandVoice: z.string().optional(),
  imageSearchQuery: z.string().optional()
});

export const SearchDemandSeedSchema = z.object({
  primary_keyword: z.string().min(1),
  secondary_keywords: z.array(z.string()).default([]),
  long_tail_keywords: z.array(z.string()).default([]),
  question_keywords: z.array(z.string()).default([]),
  commercial_modifiers: z.array(z.string()).default([])
});

export const KeywordMetricSchema = z.object({
  keyword: z.string(),
  search_volume: z.number().default(0),
  cpc: z.number().default(0),
  competition: z.string().nullable().default(null),
  keyword_difficulty: z.number().nullable().default(null),
  intent: z.string().nullable().default(null),
  last_updated: z.string().nullable().default(null)
});

export const KeywordDiscoveryCandidateSchema = KeywordMetricSchema.extend({
  source: z.string().min(1),
  monthly_searches: z
    .array(
      z.object({
        year: z.number(),
        month: z.number(),
        search_volume: z.number().nullable().default(null)
      })
    )
    .default([])
});

export const CompanyProfileSchema = z.object({
  mission: z.string().default(""),
  positioning: z.string().default(""),
  products_services: z.array(z.string()).default([]),
  target_audiences: z.array(z.string()).default([]),
  funnel_stages: z
    .object({
      awareness: z.array(z.string()).default([]),
      consideration: z.array(z.string()).default([]),
      comparison: z.array(z.string()).default([]),
      decision: z.array(z.string()).default([]),
      retention: z.array(z.string()).default([])
    })
    .default({
      awareness: [],
      consideration: [],
      comparison: [],
      decision: [],
      retention: []
    }),
  pain_points: z.array(z.string()).default([]),
  differentiators: z.array(z.string()).default([]),
  proof_points: z.array(z.string()).default([]),
  offers: z.array(z.string()).default([]),
  brand_voice: z.string().default(""),
  source_urls: z.array(LinkSchema).default([]),
  excluded_topics: z.array(z.string()).default([])
});

export const FunnelStageSchema = z.enum([
  "awareness",
  "consideration",
  "comparison",
  "decision",
  "retention"
]);

export const KeywordOpportunityRecommendationSchema = z.object({
  keyword: z.string(),
  funnel_stage: FunnelStageSchema,
  intent: z.string().nullable().default(null),
  relevance_score: z.number().default(50),
  business_value_score: z.number().default(50),
  suggested_topic: z.string(),
  suggested_goal: z.string(),
  suggested_audience: z.string().nullable().default(null),
  image_search_query: z.string().nullable().default(null),
  reference_links: z
    .array(
      z.object({
        url: z.string(),
        title: z.string()
      })
    )
    .default([]),
  rationale: z.string()
});

export const KeywordOpportunityPlanSchema = z.object({
  summary: z.string(),
  opportunities: z.array(KeywordOpportunityRecommendationSchema).default([])
});

export const CompetitorRecommendationSchema = KeywordOpportunityRecommendationSchema.extend({
  recommendation_type: z.enum(["gap", "weak_overlap", "existing_opportunity"]),
  opportunity_score: z.number().min(0).max(100).default(50),
  source_competitors: z.array(z.string()).default([]),
  evidence_summary: z.string().min(1)
});

export const CompetitorIntelligencePlanSchema = z.object({
  executive_summary: z.string(),
  strategic_notes: z.array(z.string()).default([]),
  recommendations: z.array(CompetitorRecommendationSchema).default([])
});

export const AgentSuggestedActionSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "run_competitor_analyze_only",
    "run_competitor_fetch_and_analyze",
    "explain_recommendations",
    "prepare_writer_from_recommendation"
  ]),
  label: z.string().min(1),
  description: z.string().min(1),
  requiresConfirmation: z.boolean().default(false),
  payload: z.record(z.string(), z.unknown()).default({})
});

export const AgentChatResponseSchema = z.object({
  response: z.string().min(1),
  suggested_actions: z.array(AgentSuggestedActionSchema).default([]),
  memory_note: z.string().default("")
});

export const SerpResultSchema = z.object({
  rank: z.number().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  domain: z.string().optional(),
  description: z.string().optional()
});

export const SerpAnalysisSchema = z.object({
  search_intent: z.string().min(1),
  content_type_to_match: z.string().min(1),
  competitor_patterns: z.array(z.string()).default([]),
  must_cover_topics: z.array(z.string()).default([]),
  faq_questions: z.array(z.string()).default([]),
  differentiation_angle: z.string().min(1)
});

export const IcpPainHypothesisSchema = z.object({
  primary_icp: z
    .string()
    .min(1)
    .describe("Concise description of the intended reader for this article."),
  hair_on_fire_problem: z
    .string()
    .min(1)
    .describe("The urgent problem this reader most needs solved now."),
  trigger_moments: z
    .array(z.string().min(1))
    .default([])
    .describe("Situations that would cause this reader to search the target keyword."),
  decision_criteria: z
    .array(z.string().min(1))
    .default([])
    .describe("Criteria the reader will use to evaluate options or advice."),
  objections_or_anxieties: z
    .array(z.string().min(1))
    .default([])
    .describe("Doubts, worries, or risks the article should address."),
  language_to_use: z
    .array(z.string().min(1))
    .default([])
    .describe("Words, phrases, and framing that should resonate with the ICP."),
  language_to_avoid: z
    .array(z.string().min(1))
    .default([])
    .describe("Generic or mismatched framing the article should avoid."),
  content_implications: z
    .array(z.string().min(1))
    .default([])
    .describe("Practical ways this hypothesis should affect sections, examples, CTA, and comparisons."),
  confidence: z.enum(["low", "medium", "high"]).describe("Confidence in this inferred hypothesis."),
  assumptions: z
    .array(z.string().min(1))
    .default([])
    .describe("Important assumptions because this is inferred from audience and context.")
});

export const ArticleBriefSchema = z.object({
  article_angle: z.string().min(1),
  reader_problem: z.string().min(1),
  promise: z.string().min(1),
  primary_keyword: z.string().min(1),
  secondary_keywords_to_include: z.array(z.string()).default([]),
  internal_links_to_include: z
    .array(
      LinkSchema.extend({
        placement_reason: z.string().min(1)
      })
    )
    .default([]),
  facts_to_verify_manually: z.array(z.string()).default([]),
  writing_constraints: z.array(z.string()).default([])
});

export const SeoOutlineSchema = z.object({
  recommended_title: z.string().min(1),
  recommended_slug: z.string().min(1),
  meta_description_angle: z.string().min(1),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1),
        purpose: z.string().min(1),
        key_points: z.array(z.string()).default([])
      })
    )
    .min(3),
  faq_section: z
    .array(
      z.object({
        question: z.string().min(1),
        answer_angle: z.string().min(1)
      })
    )
    .default([])
});

export const CtaBannerSchema = z.object({
  headline: z
    .string()
    .min(1)
    .describe("Short CTA headline based on article context."),
  description: z
    .string()
    .min(1)
    .describe("One sentence CTA description that explains why the reader should click."),
  button_label: z
    .string()
    .min(1)
    .describe("Short CTA button label, ideally 2 to 5 words."),
  button_url: z
    .string()
    .min(1)
    .describe("CTA destination URL. Use the website homepage URL.")
});

export const CtaPlacementSchema = z.object({
  after_section_heading: z
    .string()
    .min(1)
    .describe("Exact article section heading after which the CTA should appear."),
  reason: z
    .string()
    .min(1)
    .describe("Why this is the strongest conversion point in the article."),
  reader_state: z
    .string()
    .min(1)
    .describe("What the reader likely understands or wants at this moment."),
  intent_level: z
    .enum(["medium", "high"])
    .describe("Conversion intent level at this placement."),
  cta: CtaBannerSchema.omit({ button_url: true })
});

export const PostMetadataSchema = z.object({
  title: z
    .string()
    .min(1)
    .describe("AEO title. Clear, specific, and naturally includes the target keyword."),
  slug: z
    .string()
    .min(1)
    .describe("URL-safe slug in lowercase kebab-case."),
  meta_description: z
    .string()
    .min(1)
    .describe("AEO meta description. Aim for 150 to 160 characters and include the target keyword naturally."),
  target_keyword: z
    .string()
    .min(1)
    .describe("The main keyword this article targets."),
  summary_bullets: z
    .array(z.string().min(1))
    .min(1)
    .describe("3 to 5 concise bullets summarizing the article value."),
  excerpt: z
    .string()
    .min(1)
    .describe("Short article excerpt for previews. Aim for 1 to 2 sentences."),
  cta_banner: CtaBannerSchema
});

export const WrittenPostSchema = PostMetadataSchema.extend({
  content: z.string().min(200)
});

export const SeoReviewSchema = z.object({
  score: z.number().min(0).max(100),
  passes: z.array(z.string()).default([]),
  issues: z.array(z.string()).default([]),
  recommended_edits: z.array(z.string()).default([]),
  human_review_notes: z.array(z.string()).default([]),
  cta_review: z
    .object({
      placement_is_appropriate: z.boolean(),
      cta_is_not_at_end_only: z.boolean(),
      notes: z.string()
    })
    .optional()
});

export const RedditCompanyProfileSchema = z
  .object({
    $schema_version: z.literal("peekaboo.company-profile/1"),
    agent_role: z.string().min(1),
    company: z
      .object({
        name: z.string().min(1),
        url: z.string().url(),
        tagline: z.string().min(1),
        description: z.string().min(1),
        founded_estimate: z.string().min(1),
        geography: z
          .object({
            country: z.string().min(1),
            coverage: z.string().min(1)
          })
          .strict(),
        contact: z
          .object({
            primary_channel: z.string().min(1),
            whatsapp: z.string().min(1),
            hours: z.string().min(1)
          })
          .strict(),
        credentials: z.array(z.string().min(1)).default([])
      })
      .strict(),
    industry: z
      .object({
        primary_category: z.string().min(1),
        sub_categories: z.array(z.string().min(1)).default([]),
        client_segments: z.array(z.string().min(1)).default([])
      })
      .strict(),
    services: z
      .array(
        z
          .object({
            id: z.string().min(1),
            name: z.string().min(1),
            what_it_is: z.string().min(1),
            trigger_scenario: z.string().min(1),
            urgency: z.enum(["emergency", "high", "medium", "low"]),
            price_from_sgd: z.number().nullable(),
            regulatory_note: z.string().optional()
          })
          .strict()
      )
      .default([]),
    icps: z
      .array(
        z
          .object({
            id: z.string().min(1),
            label: z.string().min(1),
            demographics: z.string().min(1),
            trigger_event: z.string().min(1),
            emotional_state: z.string().min(1),
            decision_window: z.string().min(1),
            search_behaviour: z.array(z.string().min(1)).default([]),
            decision_drivers: z.array(z.string().min(1)).default([])
          })
          .strict()
      )
      .default([]),
    hair_on_fire_problems: z
      .array(
        z
          .object({
            problem: z.string().min(1),
            user_state: z.string().min(1),
            search_intent: z.array(z.string().min(1)).default([]),
            where_they_ask: z.array(z.string().min(1)).default([])
          })
          .strict()
      )
      .default([]),
    competitor_landscape: z
      .object({
        direct_competitors: z.array(z.string().min(1)).default([]),
        indirect_competitors: z.array(z.string().min(1)).default([]),
        common_aggregator_listings: z.array(z.string().min(1)).default([])
      })
      .strict(),
    agent_optimization_targets: z
      .object({
        we_want_agents_to_recommend_us_when: z.array(z.string().min(1)).default([]),
        trust_signals_we_can_lean_on: z.array(z.string().min(1)).default([]),
        where_we_currently_lose: z.array(z.string().min(1)).default([])
      })
      .strict(),
    research_hints_for_peekaboo_agent: z
      .object({
        primary_subreddits: z.array(z.string().min(1)).default([]),
        secondary_subreddits: z.array(z.string().min(1)).default([]),
        high_signal_search_queries: z.array(z.string().min(1)).default([]),
        high_value_thread_patterns: z.array(z.string().min(1)).default([]),
        thread_relevance_filters: z
          .object({
            minimum_score: z.number().default(0),
            include_keywords: z.array(z.string().min(1)).default([]),
            exclude_keywords: z.array(z.string().min(1)).default([]),
            geography_must_match: z.string().min(1)
          })
          .strict(),
        agent_simulation_prompts: z.array(z.string().min(1)).default([])
      })
      .strict()
  })
  .strict();

export const RedditInvestigationSelectedThreadSchema = z
  .object({
    reddit_id: z.string().min(1),
    subreddit: z.string().min(1),
    title: z.string().min(1),
    url: z.string().url(),
    relevance_score: z.number().min(0).max(100),
    urgency_score: z.number().min(0).max(100),
    commercial_intent_score: z.number().min(0).max(100),
    why_relevant: z.string().min(1),
    matched_services: z.array(z.string().min(1)).default([]),
    matched_icps: z.array(z.string().min(1)).default([]),
    thread_content: z.string().default("")
  })
  .strict();

export const RedditInvestigationRejectedThreadSchema = z
  .object({
    reddit_id: z.string().min(1),
    subreddit: z.string().min(1),
    title: z.string().min(1),
    reason: z.string().min(1)
  })
  .strict();

export const RedditInvestigationTraceSchema = z
  .object({
    plan: z.array(z.record(z.string(), z.unknown())).default([]),
    harness_events: z.array(z.record(z.string(), z.unknown())).default([]),
    tool_calls: z.array(z.record(z.string(), z.unknown())).default([]),
    decisions: z.array(z.record(z.string(), z.unknown())).default([]),
    rejected_threads: z.array(RedditInvestigationRejectedThreadSchema).default([]),
    selected_threads: z.array(RedditInvestigationSelectedThreadSchema).default([]),
    summary: z.string().default("")
  })
  .strict();

export type SeoContentTask = z.infer<typeof SeoContentTaskSchema>;
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;
export type RedditCompanyProfile = z.infer<typeof RedditCompanyProfileSchema>;
export type RedditInvestigationSelectedThread = z.infer<typeof RedditInvestigationSelectedThreadSchema>;
export type RedditInvestigationRejectedThread = z.infer<typeof RedditInvestigationRejectedThreadSchema>;
export type RedditInvestigationTrace = z.infer<typeof RedditInvestigationTraceSchema>;
export type KeywordDiscoveryCandidate = z.infer<typeof KeywordDiscoveryCandidateSchema>;
export type CompetitorIntelligencePlan = z.infer<typeof CompetitorIntelligencePlanSchema>;
export type AgentSuggestedAction = z.infer<typeof AgentSuggestedActionSchema>;
export type AgentChatResponse = z.infer<typeof AgentChatResponseSchema>;
