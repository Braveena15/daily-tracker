// Warm, pre-written messages used whenever the AI isn't used: it's turned off, not set up,
// the daily limit is reached, it fails or times out, or a reply was blocked.
// The app must never break, or go quiet, because of AI.
import type { AiTask } from "./buildContext";
import { pickRandom } from "../utils/random";

const GENERAL = [
  "Showing up for yourself today counts. Small, steady steps are how real change happens. 🌱",
  "You took time to check in with yourself — that's a kind thing to do. Be gentle with yourself for the rest of today.",
  "Progress isn't always loud. Some days it looks like simply keeping going, and that's enough.",
  "Whatever today held, you're still here, still trying. That matters more than any score.",
  "Notice one thing that went okay today, however small. It's worth holding on to.",
  "Rest is part of the journey, not a break from it. Tomorrow is a fresh page.",
  "You don't have to get everything right. Doing a little, kindly, is a great way to grow.",
  "Every check-in is a small promise kept to yourself. Well done for keeping it.",
  "Be as patient with yourself as you would be with a good friend. You're doing better than you think.",
  "One glass of water, one short walk, one deep breath — small things really do add up.",
] as const;

const BY_TASK: Record<AiTask, readonly string[]> = {
  thought: [
    "Writing a hard thought down and looking at it from another angle takes courage. Well done for doing it.",
    "Thoughts aren't always facts. You gave this one a fair hearing — that's a real skill, and it gets easier with practice.",
    "However the feeling is now, you made space for it instead of pushing it away. That's a strong, kind thing to do.",
  ],
  daily: [
    "Thanks for checking in today. For tomorrow, pick one small thing that would make the day feel a little lighter.",
    "Another day logged. Tomorrow, try to notice one good moment as it happens — it helps them stick.",
  ],
  weekly: [
    "Another week of showing up for yourself. Look back at one moment you're glad about, and carry it into next week.",
    "Weeks have ups and downs, and you kept going through both. Choose one small focus for next week and keep it gentle.",
  ],
  program: [
    "Every day you showed up counts. Look at what changed, however small, and be proud of the effort behind it.",
    "Progress isn't a straight line, and you kept coming back to it. That steady effort is the real result here.",
  ],
  boost: [
    "You've come further than you give yourself credit for. Take a slow breath and remember why you started. 💜",
    "You matter, on good days and hard ones. Do one small kind thing for yourself right now.",
  ],
};

/** All fallbacks (15+), for tests. */
export const ALL_FALLBACKS = [...GENERAL, ...Object.values(BY_TASK).flat()];

/** A random warm message suited to the task. */
export function pickFallback(task: AiTask, random: () => number = Math.random): string {
  return pickRandom([...BY_TASK[task], ...GENERAL], 1, random)[0]!;
}
