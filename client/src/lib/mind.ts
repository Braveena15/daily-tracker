// Types and fixed content for the "Mind" section (server: /api/diary, /api/thoughts, /api/purpose, …).
import { BookHeart, Brain, Compass, Library, Sun, type LucideIcon } from 'lucide-react'

export const MIND_PAGES: { to: string; label: string; description: string; icon: LucideIcon }[] = [
  { to: '/diary', label: 'Diary', description: 'A private place to write', icon: BookHeart },
  { to: '/thoughts', label: 'Thought log', description: 'Untangle a difficult thought', icon: Brain },
  { to: '/lift', label: 'Lift me up', description: 'Good moments, breathing, a kind word', icon: Sun },
  { to: '/purpose', label: 'Purpose', description: 'What matters to you', icon: Compass },
  { to: '/motivation', label: 'Motivation', description: 'Your quotes and videos', icon: Library },
]

// ---------- Diary ----------

export type DiarySummary = {
  id: string
  date: string
  title: string
  preview: string
  tags: string[]
  isFavourite: boolean
  createdAt: string
  updatedAt: string
}
export type DiaryEntry = Omit<DiarySummary, 'preview'> & { body: string; unreadable: boolean }
export type DiaryListResponse = { entries: DiarySummary[]; tags: string[] }
export type DiaryResponse = { entry: DiaryEntry; showSupport?: boolean }

// ---------- Thought log ----------

export type Distortion =
  | 'all-or-nothing'
  | 'catastrophising'
  | 'mind-reading'
  | 'fortune-telling'
  | 'overgeneralising'
  | 'labelling'
  | 'should-statements'
  | 'discounting-the-positive'
  | 'emotional-reasoning'
  | 'personalising'

/** Thinking traps, each with a one-line plain explanation. */
export const DISTORTIONS: { key: Distortion; label: string; explanation: string }[] = [
  { key: 'all-or-nothing', label: 'All-or-nothing', explanation: 'Seeing things as total success or total failure, with nothing in between.' },
  { key: 'catastrophising', label: 'Catastrophising', explanation: 'Jumping to the worst possible outcome.' },
  { key: 'mind-reading', label: 'Mind-reading', explanation: "Assuming you know what others think — usually something negative." },
  { key: 'fortune-telling', label: 'Fortune-telling', explanation: "Predicting things will go badly before they've happened." },
  { key: 'overgeneralising', label: 'Overgeneralising', explanation: 'One bad thing becomes "always" or "never".' },
  { key: 'labelling', label: 'Labelling', explanation: 'Calling yourself a name ("I\'m useless") instead of describing what happened.' },
  { key: 'should-statements', label: 'Should statements', explanation: 'Strict rules about how you or others "should" be.' },
  { key: 'discounting-the-positive', label: 'Discounting the positive', explanation: 'Good things "don\'t count" or were "just luck".' },
  { key: 'emotional-reasoning', label: 'Emotional reasoning', explanation: '"I feel it, so it must be true."' },
  { key: 'personalising', label: 'Personalising', explanation: "Blaming yourself for things that weren't all in your control." },
]

export const FEELING_SUGGESTIONS = ['Anxious', 'Sad', 'Angry', 'Ashamed', 'Guilty', 'Lonely', 'Overwhelmed', 'Frustrated', 'Hurt', 'Worried']

export type Feeling = { name: string; intensityBefore: number }

export type ThoughtLog = {
  id: string
  date: string
  thought: string
  situation: string
  feelings: Feeling[]
  distortions: Distortion[]
  evidenceFor: string
  evidenceAgainst: string
  friendAdvice: string
  balancedThought: string
  smallStep: string
  smallStepDone: boolean
  smallStepDoneAt: string | null
  intensityAfter: number | null
  isPrivate: boolean
  createdAt: string
  updatedAt: string
}
export type ThoughtResponse = { log: ThoughtLog; showSupport?: boolean }
export type ThoughtStats = { thisMonth: number; averageDrop: number | null; ratedLogs: number }

/** The strongest feeling at the start, which the last step compares with. */
export const strongestFeeling = (feelings: Feeling[]) =>
  feelings.length === 0 ? null : feelings.reduce((a, b) => (b.intensityBefore > a.intensityBefore ? b : a))

// ---------- Purpose ----------

export type Purpose = {
  purposeStatement: string
  coreValues: string[]
  longTermGoals: { title: string; why: string }[]
  updatedAt: string | null
}

export const VALUE_SUGGESTIONS = [
  'Kindness', 'Health', 'Family', 'Growth', 'Honesty', 'Courage', 'Curiosity', 'Gratitude',
  'Discipline', 'Creativity', 'Friendship', 'Faith', 'Independence', 'Service', 'Calm', 'Learning',
]

// ---------- Motivation library ----------

export const CATEGORIES = ['motivation', 'purpose', 'calm', 'confidence', 'discipline'] as const
export type Category = (typeof CATEGORIES)[number]
export const categoryLabel = (c: Category) => c.charAt(0).toUpperCase() + c.slice(1)

export type Quote = { id: string; text: string; author?: string | null; source?: string | null; category: Category }
export type Video = { id: string; title: string; youtubeUrl: string; videoId: string; category: Category; note?: string | null }

/** Videos are always embedded in YouTube's privacy-enhanced mode. */
export const embedUrl = (videoId: string) => `https://www.youtube-nocookie.com/embed/${videoId}`

// ---------- Lift me up ----------

export type LiftResponse = {
  goodThings: { text: string; date: string }[]
  /** Today's purpose when it's set (shown first) */
  todayPurpose: { text: string; focusValues: string[] } | null
  purpose: { purposeStatement: string; coreValues: string[] } | null
  quote: (Quote & { mine: boolean }) | null
  video: { id: string; title: string; videoId: string; note: string | null } | null
  smallStep: { text: string; date: string } | null
}
