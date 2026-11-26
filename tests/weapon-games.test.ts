import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createClient } from '@libsql/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { advanceWeapon, coutelasAim, COUTELAS_ORIGIN, createWeaponRun, recordWeaponInput, replayWeapon, STEP, weaponInput, type Input, type WeaponGame, type WeaponRun } from '../src/game/weapons/engine'
import { createArcadeService } from '../src/server/arcade/service'
import { prepareGameDatabase } from '../scripts/prepare-game-db'

function missAll(seed: number) {
  const run = createWeaponRun('coutelas', seed)
  const actions: Input[] = []
  while (run.status === 'running') {
    if (!run.shots.length) assert.ok(recordWeaponInput(run, actions, { tap: true }))
    advanceWeapon(run, run.tick + STEP)
  }
  return { run, actions }
}

test('coutelas replays timed taps and rejects preset angles, powers and premature confirmations', () => {
  const { run, actions } = missAll(42)
  assert.equal(run.attempts, 0)
  assert.equal(run.landedThrows, 3)
  assert.equal(run.marks.length, 3)
  assert.equal(actions.length, 6)
  assert.deepEqual(replayWeapon('coutelas', 42, actions, run.tick), run)
  assert.throws(() => replayWeapon('coutelas', 42, actions, run.tick - STEP))
  const initial = createWeaponRun('coutelas', 42)
  assert.equal(weaponInput(initial, { at: 0, angle: 90, power: 100 }), false)
  assert.equal(weaponInput(initial, { at: 0, tap: true, power: 100 }), false)
  assert.equal(weaponInput(initial, { at: 0, tap: true }), true)
  assert.equal(weaponInput(initial, { at: 0, tap: true }), false)
  assert.equal(weaponInput(createWeaponRun('digrain', 42), { at: 0, tap: true }), false)
})

test('angle sweeps both ways, stays locked while power cycles, and sweeps faster after hits', () => {
  const run = createWeaponRun('coutelas', 42)
  const initialAngle = coutelasAim(run).angle
  const experienced = createWeaponRun('coutelas', 42)
  experienced.hits = 10
  advanceWeapon(run, 200)
  advanceWeapon(experienced, 200)
  assert.ok(coutelasAim(experienced).angle < coutelasAim(run).angle)
  advanceWeapon(run, 2600)
  assert.ok(coutelasAim(run).angle < 20)
  advanceWeapon(run, 5200)
  assert.equal(coutelasAim(run).angle, initialAngle)
  assert.ok(weaponInput(run, { at: run.tick, tap: true }))
  assert.equal(coutelasAim(run).power, 0)
  advanceWeapon(run, 7100)
  assert.equal(coutelasAim(run).angle, initialAngle)
  assert.equal(coutelasAim(run).power, 100)
  advanceWeapon(run, 9000)
  assert.equal(coutelasAim(run).power, 0)
})

test('power expires at the current strength after a score-dependent delay measured from the angle tap', () => {
  for (const [score, hits, delay] of [[0, 0, 6000], [1500, 5, 4500], [3000, 10, 3000], [9000, 30, 3000]] as const) {
    const run = createWeaponRun('coutelas', 42)
    run.score = score
    run.hits = hits
    advanceWeapon(run, 12000)
    assert.equal(run.throws, 0)
    assert.equal(coutelasAim(run).powerTimeLeftMs, undefined)
    const actions: Input[] = []
    assert.ok(recordWeaponInput(run, actions, { tap: true }))
    assert.equal(coutelasAim(run).powerTimeLeftMs, delay)
    const deadline = run.tick + delay
    advanceWeapon(run, deadline - STEP)
    assert.equal(coutelasAim(run).powerTimeLeftMs, STEP)
    const expected = coutelasAim({ ...run, tick: deadline })
    advanceWeapon(run, deadline)
    const flight = coutelasAim(run)
    assert.equal(flight.phase, 'flight')
    assert.equal(flight.power, expected.power)
    assert.deepEqual(flight.landing, expected.landing)
    assert.equal(recordWeaponInput(run, actions, { tap: true }), false)
    assert.equal(run.throws, 1)
    assert.equal(actions.length, 1)
  }
})

test('replay reproduces automatic launches with only the angle taps; a last-moment manual tap launches once', () => {
  const run = createWeaponRun('coutelas', 42)
  const actions: Input[] = []
  while (run.status === 'running') {
    if (coutelasAim(run).phase === 'angle') assert.ok(recordWeaponInput(run, actions, { tap: true }))
    advanceWeapon(run, run.tick + STEP)
  }
  assert.equal(run.landedThrows, 3)
  assert.equal(actions.length, 3)
  assert.deepEqual(replayWeapon('coutelas', 42, actions, run.tick), run)

  const manual = createWeaponRun('coutelas', 42)
  assert.ok(weaponInput(manual, { at: 0, tap: true }))
  advanceWeapon(manual, 6000 - STEP)
  const chosen = coutelasAim(manual)
  assert.ok(weaponInput(manual, { at: manual.tick, tap: true }))
  advanceWeapon(manual, 6000)
  assert.equal(manual.throws, 1)
  assert.equal(manual.shots.length, 1)
  assert.equal(coutelasAim(manual).power, chosen.power)
})

test('coutelas can fly over the target without scoring, and marks the previewed landing when it misses', () => {
  const run = createWeaponRun('coutelas', 42)
  advanceWeapon(run, 1300)
  assert.equal(coutelasAim(run).angle, 90)
  assert.ok(weaponInput(run, { at: run.tick, tap: true }))
  advanceWeapon(run, 3200)
  const aim = coutelasAim(run)
  assert.equal(aim.angle, 90)
  assert.equal(aim.power, 100)
  assert.ok(weaponInput(run, { at: run.tick, tap: true }))
  const flightStart = run.tick
  const duration = run.shots[0]!.flight!.duration
  const halfwayY = (COUTELAS_ORIGIN.y + aim.landing.y) / 2
  run.targets = [{ id: 1, x: COUTELAS_ORIGIN.x, y: halfwayY }]
  advanceWeapon(run, flightStart + duration / 2)
  assert.equal(run.shots[0]!.y, halfwayY)
  assert.ok(run.shots[0]!.height! > 0)
  assert.equal(run.score, 0)
  assert.equal(run.attempts, 3)
  assert.equal(weaponInput(run, { at: run.tick, tap: true }), false)
  advanceWeapon(run, flightStart + duration)
  assert.equal(run.score, 0)
  assert.equal(run.attempts, 2)
  assert.deepEqual(run.marks[0], { id: 1, ...aim.landing })
})

function bestTiming(run: WeaponRun, errorAt: (aim: ReturnType<typeof coutelasAim>) => number) {
  let bestTick = run.tick
  let bestError = Infinity
  // Search a complete sweep in legal input ticks on the actual aiming guide.
  const deadline = coutelasAim(run).powerTimeLeftMs ?? Infinity
  const maxWait = Math.min(5200, deadline - STEP)
  for (let delta = STEP; delta <= maxWait; delta += STEP) {
    const error = errorAt(coutelasAim({ ...run, tick: run.tick + delta }))
    if (error < bestError) {
      bestError = error
      bestTick = run.tick + delta
    }
  }
  return bestTick
}

test('every generated target is reachable by the two timers at opening and maximum difficulty', () => {
  for (const previousHits of [0, 30]) {
    for (let seed = 1; seed <= 40; seed++) {
      const run = createWeaponRun('coutelas', Math.imul(seed, 0x9e3779b9))
      run.hits = previousHits
      const previousScore = previousHits * 300
      run.score = previousScore
      const bug = run.targets[0]!
      const targetAngle = Math.atan2(COUTELAS_ORIGIN.y - bug.y, bug.x - COUTELAS_ORIGIN.x) * 180 / Math.PI
      advanceWeapon(run, bestTiming(run, aim => Math.abs(aim.angle - targetAngle)))
      assert.ok(weaponInput(run, { at: run.tick, tap: true }))
      advanceWeapon(run, bestTiming(run, aim => Math.hypot(aim.landing.x - bug.x, aim.landing.y - bug.y)))
      const expectedLanding = coutelasAim(run).landing
      assert.ok(weaponInput(run, { at: run.tick, tap: true }))
      const impactTick = run.tick + run.shots[0]!.flight!.duration
      advanceWeapon(run, impactTick - STEP)
      assert.equal(run.score, previousScore)
      assert.equal(run.landedThrows, 0)
      advanceWeapon(run, impactTick)
      assert.equal(run.score, previousScore + 300)
      assert.equal(run.hits, previousHits + 1)
      assert.equal(coutelasAim(run).phase, 'waiting')
      assert.deepEqual(coutelasAim(run).landing, expectedLanding)
      advanceWeapon(run, run.nextTarget)
      assert.equal(run.throws, 0)
      assert.equal(run.landedThrows, 1)
    }
  }
})
test('Digrain pressure empties and only resumes firing after release, replay is deterministic', () => {
  const run = createWeaponRun('digrain', 42)
  weaponInput(run, { at: 0, x: 160, fire: true }); advanceWeapon(run, 5000)
  assert.equal(run.exhausted, true)
  const hits = run.hits; advanceWeapon(run, 7000)
  assert.equal(run.hits, hits)
  weaponInput(run, { at: run.tick, fire: false }); advanceWeapon(run, 9000)
  assert.equal(run.exhausted, false); assert.equal(run.pressure, 100)
  const other = createWeaponRun('digrain', 42)
  advanceWeapon(other, 180000)
  assert.deepEqual(replayWeapon('digrain', 42, [], other.tick), other)
})
test('per-game receipts, rankings and podium caps are isolated and idempotent', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'scolo-weapons-'))
  const client = createClient({ url: `file:${join(directory, 'test.db')}` })
  let now = 1000000
  try {
    const games = await Promise.all((['sandale', 'digrain', 'coutelas'] as const).map(game => createArcadeService(client, () => now, { game })))
    for (const [i, game] of (['digrain', 'coutelas'] as WeaponGame[]).entries()) {
      const service = games[i + 1]!, session = await service.start('owner', game)
      const result = game === 'coutelas' ? missAll(session.seed) : { run: createWeaponRun(game, session.seed), actions: [] }
      if (game === 'digrain') advanceWeapon(result.run, 180000)
      now += result.run.tick + 1000
      const input = { token: session.token, elapsedMs: result.run.tick, actions: result.actions }
      const finished = await service.finish(input, 'owner')
      assert.equal(finished.points, result.run.score)
      await assert.rejects(games[0]!.finish(input, 'owner'), /version/)
      await assert.rejects(service.claim(session.token, 'other', 'Other'), /autre compte/)
      assert.equal((await service.claim(session.token, 'owner', 'Owner')).reward.credited, 3)
      assert.equal((await service.claim(session.token, 'owner', 'Owner')).reward.credited, 0)
      assert.equal((await service.reward('owner', 'Owner')).credited, 0)
      assert.equal((await service.standings('owner', session.token)).entries[0]?.points, result.run.score)
    }
    assert.equal((await games[0]!.leaderboard('owner')).entries.length, 0)
    const entries = (await client.execute("SELECT reference,amount FROM scolo_wallet_entries WHERE kind='arcade_bonus'")).rows
    assert.equal(entries.length, 2); assert.equal(entries.reduce((total, row) => total + Number(row.amount), 0), 6)
    assert.equal((await client.execute('SELECT COUNT(*) AS n FROM scolo_arcade_rewards')).rows[0]?.n, 0)
  } finally { client.close(); await rm(directory, { recursive:true, force:true }) }
})
test('additive migration preserves historical sandale scores, rewards and ledger on repeated application', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'scolo-weapon-migration-'))
  const client = createClient({ url: `file:${join(directory, 'test.db')}` })
  try {
    await createArcadeService(client)
    // Recreate the old layout without the new columns, with a historical run.
    await client.execute('ALTER TABLE scolo_arcade_runs DROP COLUMN points')
    await client.execute('ALTER TABLE scolo_arcade_bests DROP COLUMN points')
    await client.execute("INSERT INTO scolo_arcade_runs (id,token_hash,rules,seed,started_at,rate_key,elapsed_ms,crushed) VALUES ('old','old-hash','sandale-v3',42,0,'old',1234,7)")
    await client.execute("INSERT INTO scolo_players(id,clerk_user_id,display_name,created_at) VALUES('legacy-player','legacy-user','Legacy fixture',1)")
    await client.execute("INSERT INTO scolo_wallets(player_id,balance) VALUES('legacy-player',3)")
    await client.execute("INSERT INTO scolo_arcade_rewards(user_id,player_id,total,updated_at) VALUES('legacy-user','legacy-player',3,1)")
    await client.execute("INSERT INTO scolo_wallet_entries(id,player_id,amount,kind,reference,created_at) VALUES('legacy-entry','legacy-player',3,'arcade_bonus','arcade:sandale:podium:legacy-player:3',1)")
    await client.execute("INSERT INTO scolo_arcade_bests(rules,user_id,display_name,elapsed_ms,crushed,claimed_at,run_id) VALUES('sandale-v3','legacy-user','Legacy fixture',1234,7,1,'old')")
    const before = (await client.execute('SELECT * FROM scolo_arcade_runs')).rows[0]!
    assert.equal((await prepareGameDatabase(client)).applied, false)
    assert.equal((await prepareGameDatabase(client, { apply:true })).applied, true)
    await prepareGameDatabase(client, { apply:true })
    const after = (await client.execute('SELECT * FROM scolo_arcade_runs')).rows[0]!
    for (const key of Object.keys(before)) assert.equal(after[key], before[key])
    assert.equal(after.points, 0)
    assert.equal((await client.execute('SELECT total FROM scolo_arcade_rewards')).rows[0]?.total,3)
    assert.equal((await client.execute('SELECT balance FROM scolo_wallets')).rows[0]?.balance,3)
    assert.equal((await client.execute('SELECT elapsed_ms FROM scolo_arcade_bests')).rows[0]?.elapsed_ms,1234)
  } finally { client.close(); await rm(directory, { recursive:true, force:true }) }
})

test('high-frequency pointer moves stay bounded and same-tick release/repress replays correctly', () => {
  const run = createWeaponRun('digrain', 42), actions: Input[] = []
  recordWeaponInput(run, actions, {fire:true})
  advanceWeapon(run, 5000)
  assert.equal(run.exhausted, true)
  recordWeaponInput(run, actions, {fire:false})
  for(let i=0;i<500;i++) recordWeaponInput(run, actions, {x:50+i%200})
  recordWeaponInput(run, actions, {fire:true})
  assert.equal(actions.length,3)
  advanceWeapon(run,180000)
  assert.deepEqual(replayWeapon('digrain',42,actions,run.tick),run)
})
