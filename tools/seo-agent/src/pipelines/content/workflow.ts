import { articleBriefStrategist } from "../../agents/article-brief-strategist.js";
import { ctaPlacementStrategist } from "../../agents/cta-placement-strategist.js";
import { editorialSeoReviewer } from "../../agents/editorial-seo-reviewer.js";
import { finalPostPackager } from "../../agents/final-post-packager.js";
import { icpPainHypothesisStrategist } from "../../agents/icp-pain-hypothesis-strategist.js";
import { longFormContentWriter } from "../../agents/long-form-content-writer.js";
import { searchDemandAnalyst } from "../../agents/search-demand-analyst.js";
import { seoOutlineArchitect } from "../../agents/seo-outline-architect.js";
import { serpCompetitorResearcher } from "../../agents/serp-competitor-researcher.js";
import { createResumeStore, createRunStore, type RunStore } from "../../lib/file-store.js";
import { type SeoContentTask } from "../../schemas.js";

type RunOptions = {
  resumeRunDir?: string | null;
  store?: RunStore;
  onStageUpdate?: (state: {
    status: "running" | "failed" | "completed";
    currentStage: string | null;
    error?: string | null;
    runDir?: string;
  }) => Promise<void> | void;
};

async function runStage<T>({
  index,
  total,
  name,
  fileName,
  store,
  action,
  onStageUpdate
}: {
  index: number;
  total: number;
  name: string;
  fileName: string;
  store: RunStore;
  action: () => Promise<T>;
  onStageUpdate?: RunOptions["onStageUpdate"];
}): Promise<T> {
  if (await store.exists(fileName)) {
    console.log(`[${index}/${total}] ${name} skipped; existing output found.`);
    return store.load<T>(fileName);
  }

  const startedAt = Date.now();
  await store.updateState({ status: "running", currentStage: name, error: null });
  await onStageUpdate?.({
    status: "running",
    currentStage: name,
    error: null,
    runDir: store.runDir
  });
  console.log(`[${index}/${total}] ${name} started...`);

  try {
    const result = await action();
    const filePath = await store.save(fileName, result);
    const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[${index}/${total}] ${name} done in ${durationSeconds}s`);
    console.log(`        saved: ${filePath}`);
    return result;
  } catch (error) {
    await store.updateState({
      status: "failed",
      currentStage: name,
      error: error instanceof Error ? error.message : String(error)
    });
    await onStageUpdate?.({
      status: "failed",
      currentStage: name,
      error: error instanceof Error ? error.message : String(error),
      runDir: store.runDir
    });
    throw error;
  }
}

export async function runSeoContentWorkflow(task: SeoContentTask, options: RunOptions = {}) {
  const store = options.store
    ? options.store
    : options.resumeRunDir
    ? await createResumeStore(options.resumeRunDir)
    : await createRunStore(task.runName || task.topic || task.targetKeyword);

  console.log(options.resumeRunDir ? "AEO content workflow resumed." : "AEO content workflow started.");
  console.log(`Run folder: ${store.runDir}`);

  await store.updateState({ status: "running", currentStage: "initializing", error: null });
  await options.onStageUpdate?.({
    status: "running",
    currentStage: "initializing",
    error: null,
    runDir: store.runDir
  });
  if (!(await store.exists("00-input-task"))) {
    await store.save("00-input-task", task);
  }

  const totalStages = 9;

  const searchDemand = await runStage({
    index: 1,
    total: totalStages,
    name: "Search Demand Analyst",
    fileName: "01-search-demand-analyst",
    store,
    action: () => searchDemandAnalyst(task),
    onStageUpdate: options.onStageUpdate
  });

  const competitorResearch = await runStage({
    index: 2,
    total: totalStages,
    name: "SERP Competitor Researcher",
    fileName: "02-serp-competitor-researcher",
    store,
    action: () => serpCompetitorResearcher(task, searchDemand),
    onStageUpdate: options.onStageUpdate
  });

  const icpPainHypothesis = await runStage({
    index: 3,
    total: totalStages,
    name: "ICP Pain Hypothesis Strategist",
    fileName: "03-icp-pain-hypothesis-strategist",
    store,
    action: () => icpPainHypothesisStrategist(task, searchDemand, competitorResearch),
    onStageUpdate: options.onStageUpdate
  });

  const brief = await runStage({
    index: 4,
    total: totalStages,
    name: "Article Brief Strategist",
    fileName: "04-article-brief-strategist",
    store,
    action: () => articleBriefStrategist(task, searchDemand, competitorResearch, icpPainHypothesis),
    onStageUpdate: options.onStageUpdate
  });

  const outline = await runStage({
    index: 5,
    total: totalStages,
    name: "AEO Outline Architect",
    fileName: "05-seo-outline-architect",
    store,
    action: () => seoOutlineArchitect(task, brief, competitorResearch, icpPainHypothesis),
    onStageUpdate: options.onStageUpdate
  });

  const ctaPlacement = await runStage({
    index: 6,
    total: totalStages,
    name: "CTA Placement Strategist",
    fileName: "06-cta-placement-strategist",
    store,
    action: () => ctaPlacementStrategist(task, brief, outline, icpPainHypothesis),
    onStageUpdate: options.onStageUpdate
  });

  const writtenPost = await runStage({
    index: 7,
    total: totalStages,
    name: "Long Form Content Writer",
    fileName: "07-long-form-content-writer",
    store,
    action: () => longFormContentWriter(task, brief, outline, ctaPlacement, icpPainHypothesis),
    onStageUpdate: options.onStageUpdate
  });

  const seoReview = await runStage({
    index: 8,
    total: totalStages,
    name: "Editorial AEO Reviewer",
    fileName: "08-editorial-seo-reviewer",
    store,
    action: () => editorialSeoReviewer(task, writtenPost, ctaPlacement, icpPainHypothesis),
    onStageUpdate: options.onStageUpdate
  });

  const finalPost = await runStage({
    index: 9,
    total: totalStages,
    name: "Final Post Packager",
    fileName: "09-final-post-packager",
    store,
    action: () => finalPostPackager(task, writtenPost, seoReview),
    onStageUpdate: options.onStageUpdate
  });

  await store.updateState({
    status: "completed",
    currentStage: null,
    completedAt: new Date().toISOString(),
    error: null
  });
  await options.onStageUpdate?.({
    status: "completed",
    currentStage: null,
    error: null,
    runDir: store.runDir
  });

  return {
    runDir: store.runDir,
    finalPostPath: `${store.runDir}\\09-final-post-packager.json`,
    finalPost,
    icpPainHypothesis
  };
}
