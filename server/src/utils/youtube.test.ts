/// <reference types="vitest/globals" />
import { youtubeVideoId } from "./youtube";

const ID = "dQw4w9WgXcQ";

describe("youtubeVideoId", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s`,
    `https://m.youtube.com/watch?feature=share&v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `  https://www.youtube.com/watch?v=${ID}  `,
  ])("finds the ID in %s", (url) => {
    expect(youtubeVideoId(url)).toBe(ID);
  });

  it.each([
    "not a url",
    "https://vimeo.com/123456",
    `https://www.youtube.com.evil.com/watch?v=${ID}`,
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/",
    `javascript:alert('${ID}')`,
    `ftp://youtu.be/${ID}`,
  ])("rejects %s", (url) => {
    expect(youtubeVideoId(url)).toBeNull();
  });
});
