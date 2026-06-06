import { hasUnsplashCredentials } from "../config.js";

export async function fetchUnsplashImage({ query }: { query: string }) {
  if (!hasUnsplashCredentials() || !query) {
    return {
      skipped: true as const,
      reason: "UNSPLASH_ACCESS_KEY is not configured or no image query was provided."
    };
  }

  const url = new URL("https://api.unsplash.com/photos/random");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("content_filter", "high");

  const response = await fetch(url, {
    headers: {
      Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Unsplash request failed: ${response.status} ${errorText}`);
  }

  const image = await response.json();
  return {
    skipped: false as const,
    query,
    url: image?.urls?.regular,
    raw_url: image?.urls?.raw,
    alt: image?.alt_description || query,
    photographer: image?.user?.name,
    photographer_url: image?.user?.links?.html,
    unsplash_url: image?.links?.html
  };
}
