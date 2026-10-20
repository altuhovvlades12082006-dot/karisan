export const STORY_END = 25;
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const timeFromProgress = p => clamp(p, 0, 1) * STORY_END;
export const progressFromTime = t => clamp(t / STORY_END, 0, 1);
