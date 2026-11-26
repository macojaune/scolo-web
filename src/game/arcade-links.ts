import { gameInput, type ArcadeGame } from './weapons/catalog'

export const leaderboardPath = (game: ArcadeGame) => `/?classement=${game}`
export const SANDALE_LEADERBOARD_PATH = leaderboardPath('sandale')

export function leaderboardGame(value: unknown): ArcadeGame | null {
  return gameInput.safeParse(value).data ?? null
}
