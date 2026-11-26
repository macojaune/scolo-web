// Stable game identifiers, independent from the current weapon and leaderboard pages.
export const leaderboardIds = { sandale: '1', digrain: '2', coutelas: '3' } as const
type LeaderboardGame = keyof typeof leaderboardIds
export const SANDALE_LEADERBOARD_ID = leaderboardIds.sandale
export const leaderboardPath = (game: LeaderboardGame) => `/?classement=${leaderboardIds[game]}`
export const SANDALE_LEADERBOARD_PATH = leaderboardPath('sandale')

export function leaderboardGame(value: unknown): LeaderboardGame | null {
  if (value === leaderboardIds.sandale) return 'sandale'
  if (value === leaderboardIds.digrain) return 'digrain'
  if (value === leaderboardIds.coutelas) return 'coutelas'
  return null
}
