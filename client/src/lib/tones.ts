// Colour "tones" for the four life areas (plus the sage primary), so every icon, badge and chip
// for an area uses the same colour. The colours themselves live in index.css.
// Tailwind only generates classes it can see written out in full, so they're spelled out here.

export type Tone = 'primary' | 'physical' | 'mental' | 'learning' | 'outdoor'

/** Pale background + readable text: icon bubbles and badges. */
export const toneSoft: Record<Tone, string> = {
  primary: 'bg-secondary text-secondary-foreground',
  physical: 'bg-physical-soft text-physical-foreground',
  mental: 'bg-mental-soft text-mental-foreground',
  learning: 'bg-learning-soft text-learning-foreground',
  outdoor: 'bg-outdoor-soft text-outdoor-foreground',
}

/** A chip that has been picked: soft background with a matching border. */
export const toneChipOn: Record<Tone, string> = {
  primary: 'border-primary/40 bg-secondary text-secondary-foreground hover:bg-secondary',
  physical: 'border-physical/40 bg-physical-soft text-physical-foreground hover:bg-physical-soft',
  mental: 'border-mental/40 bg-mental-soft text-mental-foreground hover:bg-mental-soft',
  learning: 'border-learning/50 bg-learning-soft text-learning-foreground hover:bg-learning-soft',
  outdoor: 'border-outdoor/40 bg-outdoor-soft text-outdoor-foreground hover:bg-outdoor-soft',
}
