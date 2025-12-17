export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export const wrapHeading = (deg: number) => {
  const h = deg % 360;
  return h < 0 ? h + 360 : h;
};

export const headingDiff = (a: number, b: number) => ((a - b + 540) % 360) - 180;

export const lowPassHeading = (prevDeg: number, nextDeg: number, alpha: number) =>
  wrapHeading(prevDeg + headingDiff(nextDeg, prevDeg) * clamp(alpha, 0, 1));

