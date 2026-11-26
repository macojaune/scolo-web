import assert from 'node:assert/strict'
import { test } from 'node:test'
import { leaderboardGame, leaderboardPath, SANDALE_LEADERBOARD_PATH } from '../src/game/arcade-links'

test('public leaderboard links use the game name', () => {
  assert.equal(SANDALE_LEADERBOARD_PATH, '/?classement=sandale')
  for (const game of ['sandale', 'digrain', 'coutelas'] as const) {
    assert.equal(leaderboardPath(game), `/?classement=${game}`)
    assert.equal(leaderboardGame(game), game)
  }
  for (const value of [undefined, '', '1', '2', '3', '01', 'unknown', ['sandale'], ['sandale', 'coutelas']]) {
    assert.equal(leaderboardGame(value), null)
  }
})
