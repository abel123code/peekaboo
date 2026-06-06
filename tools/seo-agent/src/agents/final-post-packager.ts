import { fetchUnsplashImage } from "../lib/unsplash-client.js";
import type { SeoContentTask } from "../schemas.js";

export async function finalPostPackager(task: SeoContentTask, writtenPost: any, seoReview: any) {
  const imageQuery =
    task.imageSearchQuery ||
    `${task.targetKeyword || task.topic} ${task.locationName || ""}`.trim();
  const heroImage = await fetchUnsplashImage({ query: imageQuery });
  const images = heroImage.skipped
    ? [
        {
          query: imageQuery,
          url: null,
          alt: imageQuery,
          placeholder: true,
          note: heroImage.reason
        }
      ]
    : [heroImage];

  const ctaBanner = {
    ...writtenPost.post.cta_banner,
    button_url: task.website.url
  };

  return {
    agent: "Final Post Packager",
    post: {
      ...writtenPost.post,
      cta_banner: ctaBanner,
      seo_review: seoReview.review,
      images,
      source_task: {
        goal: task.goal,
        topic: task.topic,
        website: task.website
      }
    }
  };
}
