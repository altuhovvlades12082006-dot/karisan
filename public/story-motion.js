// Preserve the original files; stop before the second towel lift begins.
export const STORY_END = 18.2;
// Reverse frames are encoded against the FULL original timeline, not STORY_END.
export const SOURCE_END = 25;
export const playbackRateForGap = gap => 1.2 + Math.min(.4, Math.max(0, Math.abs(gap) - .15) * .8);
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const timeFromProgress = p => clamp(p, 0, 1) * STORY_END;
export const progressFromTime = t => clamp(t / STORY_END, 0, 1);
