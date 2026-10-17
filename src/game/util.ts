export const TAU = Math.PI * 2

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const damp = (a: number, b: number, lambda: number, dt: number) =>
  a + (b - a) * (1 - Math.exp(-lambda * dt))

export function rand(a = 1, b?: number): number {
  return b === undefined ? Math.random() * a : a + Math.random() * (b - a)
}
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1))
export const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]
export const chance = (p: number) => Math.random() < p

export function angleDiff(a: number, b: number): number {
  let d = (b - a) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}
export const dampAngle = (a: number, b: number, lambda: number, dt: number) =>
  a + angleDiff(a, b) * (1 - Math.exp(-lambda * dt))

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
export const easeOutBack = (t: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}
