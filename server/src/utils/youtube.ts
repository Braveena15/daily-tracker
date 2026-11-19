// Finds the video ID in a YouTube link, so we store just the ID and always embed from
// youtube-nocookie.com (YouTube's privacy-enhanced mode).

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtube-nocookie.com", "youtube-nocookie.com"]);

/**
 * The 11-character video ID from links like:
 *   https://www.youtube.com/watch?v=ID   https://youtu.be/ID   https://youtube.com/shorts/ID
 *   https://www.youtube.com/embed/ID     https://m.youtube.com/watch?v=ID&t=30s
 * Returns null for anything that isn't a YouTube video link.
 */
export function youtubeVideoId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;

  let id: string | null | undefined;
  if (url.hostname.toLowerCase() === "youtu.be") {
    id = url.pathname.split("/")[1];
  } else if (url.pathname === "/watch") {
    id = url.searchParams.get("v");
  } else {
    const [, kind, value] = url.pathname.split("/");
    if (kind === "shorts" || kind === "embed" || kind === "live" || kind === "v") id = value;
  }
  return id && VIDEO_ID.test(id) ? id : null;
}
