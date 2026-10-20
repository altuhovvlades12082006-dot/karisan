export const STORY_END = 25;
export const FRAME = 1 / 60;
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const timeFromProgress = p => clamp(p, 0, 1) * STORY_END;
export const progressFromTime = t => clamp(t / STORY_END, 0, 1);
// Frame-rate independent easing. Limit follow lag after a large scroll/page jump.
export function nextTime(current, target, elapsed) {
 const gap = target - current;
 if (Math.abs(gap) <= FRAME) return target;
 const eased = current + gap * (1 - Math.exp(-clamp(elapsed, 1/120, .08) / .055));
 return clamp(eased, target - .45, target + .45);
}
