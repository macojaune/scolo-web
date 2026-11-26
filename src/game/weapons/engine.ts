/** Shared deterministic simulations. Fixed 20 ms steps are replayed on the server. */
export type WeaponGame = 'digrain' | 'coutelas'
export type Input = { at: number; x?: number; fire?: boolean; angle?: number; power?: number; tap?: true }
export type Target = { id: number; x: number; y: number }
type Point = { x: number; y: number }
type CoutelasFlight = { landing: Point; duration: number; power: number }
export type Shot = { x: number; y: number; vx: number; vy: number; age: number; height?: number; flight?: CoutelasFlight }
export type WeaponRun = {
  game: WeaponGame; tick: number; random: number; status: 'running' | 'lost'; score: number;
  hits: number; lives: number; wave: number; targets: Target[]; shots: Shot[];
  marks: Target[]; x: number; fire: boolean; pressure: number; exhausted: boolean;
  nextShot: number; nextWave: number; attempts: number; throws: number; nextTarget: number;
  aimSince: number; lockedAngle: number | null; lastLanding: Point | null;
}
export const STEP = 20
export const WIDTH = 320
export const HEIGHT = 400
export const MAX_TIME = 180000
export const COUTELAS_ORIGIN = { x: 160, y: 370 } as const
export function coutelasTargetRadius(hits: number) {
  return Math.max(11, 17 - hits * 0.6)
}

type Aim = {
  phase: 'angle' | 'power' | 'flight' | 'waiting'
  angle: number
  power: number
  landing: Point
}

function oscillation(elapsedMs: number, halfPeriodMs: number) {
  // A full cycle rises from 0 to 1, then returns to 0 at the same speed.
  return 1 - Math.abs(1 - (elapsedMs % (2 * halfPeriodMs)) / halfPeriodMs)
}

function landingPoint(angle: number, power: number): Point {
  const radians = angle * Math.PI / 180
  const dx = Math.cos(radians)
  const dy = -Math.sin(radians)
  // At full power the marker reaches the visible edge along the chosen ray.
  const margin = 10
  const sideRange = (WIDTH / 2 - margin) / Math.abs(dx)
  const topRange = (COUTELAS_ORIGIN.y - margin) / -dy
  const distance = Math.min(sideRange, topRange) * power / 100
  return { x: COUTELAS_ORIGIN.x + dx * distance, y: COUTELAS_ORIGIN.y + dy * distance }
}

export function coutelasAim(run: WeaponRun): Aim {
  const elapsed = run.tick - run.aimSince
  const sweepTime = Math.max(1320, 2600 - 140 * run.hits)
  const chargeTime = Math.max(1020, 1900 - 90 * run.hits)
  const angle = run.lockedAngle ?? 165 - 150 * oscillation(elapsed, sweepTime)
  const flight = run.shots[0]?.flight
  if (run.status === 'lost' || run.nextTarget) {
    return { phase: 'waiting', angle, power: 0, landing: run.lastLanding ?? COUTELAS_ORIGIN }
  }
  if (flight) return { phase: 'flight', angle, power: flight.power, landing: flight.landing }
  const phase = run.lockedAngle === null ? 'angle' : 'power'
  const power = phase === 'angle' ? 100 : 100 * oscillation(elapsed, chargeTime)
  return { phase, angle, power, landing: landingPoint(angle, power) }
}

export function random(run: WeaponRun) {
  let n = run.random; n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
  run.random = n >>> 0; return run.random / 4294967296
}
function target(run: WeaponRun) {
  run.targets = [{ id: run.hits + 1, x: 48 + random(run) * 224, y: 70 + random(run) * 180 }]
  run.attempts = 3
  run.throws = 0
  run.marks = []
  run.aimSince = run.tick
  run.lockedAngle = null
  run.lastLanding = null
}
function wave(run: WeaponRun) {
  run.wave++
  run.targets = Array.from({ length: 15 }, (_, i) => ({ id: i, x: 52 + i % 5 * 52, y: 40 + Math.floor(i / 5) * 35 }))
}
export function createWeaponRun(game: WeaponGame, seed: number): WeaponRun {
  const run: WeaponRun = { game, tick: 0, random: seed || 1, status: 'running', score: 0, hits: 0,
    lives: 3, wave: 0, targets: [], shots: [], marks: [], x: 160, fire: false, pressure: 100,
    exhausted: false, nextShot: 0, nextWave: 0, attempts: 3, throws: 0, nextTarget: 0, aimSince: 0, lockedAngle: null, lastLanding: null }
  if (game === 'coutelas') target(run); else wave(run)
  return run
}
export function weaponInput(run: WeaponRun, input: Input): boolean {
  if (run.status !== 'running') return false
  if (run.game === 'digrain') {
    if (input.angle !== undefined || input.power !== undefined || input.tap !== undefined) return false
    if (input.x !== undefined) run.x = Math.max(18, Math.min(302, input.x))
    if (input.fire !== undefined) { run.fire = input.fire; if (!run.fire) run.exhausted = false }
    return true
  }
  if (input.tap !== true || Object.keys(input).some(key => key !== 'at' && key !== 'tap')) return false
  const aim = coutelasAim(run)
  if (aim.phase === 'angle') {
    run.lockedAngle = aim.angle
    run.aimSince = run.tick
    return true
  }
  if (aim.phase !== 'power' || run.tick === run.aimSince) return false

  const { x, y } = COUTELAS_ORIGIN
  const dx = aim.landing.x - x, dy = aim.landing.y - y
  const duration = Math.round((480 + Math.hypot(dx, dy)) / STEP) * STEP
  run.shots.push({ x, y, vx: dx * 1000 / duration, vy: dy * 1000 / duration, age: 0, height: 0,
    flight: { duration, landing: aim.landing, power: aim.power } })
  run.throws++
  return true
}

function stepCoutelas(run: WeaponRun) {
  if (run.nextTarget && run.tick >= run.nextTarget) {
    run.nextTarget = 0
    target(run)
  }
  const shot = run.shots[0]
  const flight = shot?.flight
  if (!shot || !flight) return

  shot.age += STEP
  const t = Math.min(1, shot.age / flight.duration)
  const { landing } = flight
  shot.x = COUTELAS_ORIGIN.x + (landing.x - COUTELAS_ORIGIN.x) * t
  shot.y = COUTELAS_ORIGIN.y + (landing.y - COUTELAS_ORIGIN.y) * t
  shot.height = 4 * t * (1 - t) * (20 + flight.power * 0.35)
  if (t < 1) return

  run.shots = []
  run.lockedAngle = null
  run.aimSince = run.tick
  run.lastLanding = landing
  const bug = run.targets[0]!
  if (Math.hypot(landing.x - bug.x, landing.y - bug.y) <= coutelasTargetRadius(run.hits)) {
    run.hits++
    run.score += (4 - run.throws) * 100
    run.targets = []
    run.nextTarget = run.tick + 500
  } else {
    run.marks.push({ id: run.throws, ...landing })
    run.attempts--
    if (!run.attempts) run.status = 'lost'
  }
}

function step(run: WeaponRun) {
  run.tick += STEP
  if (run.game === 'digrain') {
    const spraying = run.fire && !run.exhausted && run.pressure >= 4
    run.pressure = Math.max(0, Math.min(100, run.pressure + (spraying ? -0.65 : 0.38)))
    if (run.pressure < 4 && run.fire) run.exhausted = true
    if (spraying && run.tick >= run.nextShot) {
      run.shots.push({ x: run.x, y: 356, vx: 0, vy: -360, age: 0 }); run.nextShot = run.tick + 160
    }
    const dx = Math.sin(run.tick / 600) * (0.55 + Math.min(run.wave, 8) * 0.06)
    for (const bug of run.targets) { bug.x = Math.max(18, Math.min(302, bug.x + dx)); bug.y += 0.07 + run.wave * 0.018 }
    for (const shot of run.shots) {
      shot.y += shot.vy * .02; shot.age += STEP
      const index = run.targets.findIndex(bug => Math.abs(bug.x - shot.x) < 19 && Math.abs(bug.y - shot.y) < 12)
      if (index >= 0) { run.targets.splice(index, 1); shot.age = 9999; run.hits++; run.score += 100 }
    }
    run.shots = run.shots.filter(shot => shot.y > 0 && shot.age < 9999)
    if (run.targets.some(bug => bug.y >= 350)) {
      run.lives--; run.targets = []; run.shots = []; run.nextWave = run.tick + 800
      if (!run.lives) run.status = 'lost'
    }
    if (!run.targets.length && run.tick >= run.nextWave && run.status === 'running') wave(run)
  } else {
    stepCoutelas(run)
  }
  if (run.tick >= MAX_TIME) run.status = 'lost'
}
export function advanceWeapon(run: WeaponRun, until: number) {
  while (run.status === 'running' && run.tick + STEP <= until) step(run)
}
export function replayWeapon(game: WeaponGame, seed: number, actions: Input[], elapsedMs: number) {
  const run = createWeaponRun(game, seed)
  for (const action of actions) {
    if (action.at < run.tick || action.at % STEP || action.at > elapsedMs) throw new Error('Ordre des actions invalide.')
    advanceWeapon(run, action.at)
    if (run.tick !== action.at || !weaponInput(run, action)) throw new Error('Action impossible pour cette partie.')
  }
  advanceWeapon(run, elapsedMs)
  if (run.status !== 'lost' || run.tick !== elapsedMs) throw new Error('La partie n’est pas terminée à cet instant.')
  return run
}

/** Coalesce pointer positions, preserving release/press edges that reset pressure. */
export function recordWeaponInput(run: WeaponRun, actions: Input[], value: Omit<Input, 'at'>) {
  if (value.fire !== undefined && value.fire === run.fire && value.x === undefined) return false
  const action = { ...value, at: run.tick }
  if (!weaponInput(run, action)) return false
  const last = actions.at(-1)
  if (run.game === 'digrain' && last?.at === action.at && action.fire === undefined) Object.assign(last, action)
  else actions.push(action)
  return true
}
