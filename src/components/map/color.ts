// 3-stop scale: red (worst) → amber → green (best).
// `score` is 0–100 where 100 is always best.
const STOPS: [number, number, number][] = [[239, 68, 68], [245, 158, 11], [6, 214, 160]];

export function scoreToColor(score: number): string {
  const t = Math.max(0, Math.min(1, score / 100));
  const seg = t < 0.5 ? 0 : 1;
  const localT = t < 0.5 ? t / 0.5 : (t - 0.5) / 0.5;
  const a = STOPS[seg], b = STOPS[seg + 1];
  const r = Math.round(a[0] + (b[0] - a[0]) * localT);
  const g = Math.round(a[1] + (b[1] - a[1]) * localT);
  const bl = Math.round(a[2] + (b[2] - a[2]) * localT);
  return `rgb(${r},${g},${bl})`;
}

export const TIER_RADIUS: Record<string, number> = { large: 7, mid: 5, small: 4, micro: 3 };
