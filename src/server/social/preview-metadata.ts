import type { GetServerSideProps } from 'next'
import { env } from '~/env'
import { getDatabaseClient } from '../db'
import { readSocialCardData, socialMetadata, unavailableSocialCardData, type SocialMetadata } from './preview-data'

export type SocialPageProps = { social: SocialMetadata }

const legacyLeaderboards = new Map([['1', 'sandale'], ['3', 'coutelas']])

export const getSocialPageProps: GetServerSideProps<SocialPageProps> = async ({ query, resolvedUrl }) => {
  const legacyGame = typeof query.classement === 'string' && legacyLeaderboards.get(query.classement)
  if (legacyGame) {
    const url = new URL(resolvedUrl, env.APP_URL)
    url.searchParams.set('classement', legacyGame)
    return { redirect: { destination: url.pathname + url.search, permanent: true } }
  }

  let data = unavailableSocialCardData()
  try { data = await readSocialCardData(getDatabaseClient(env), env.SCOLO_WALLET_MODE) }
  catch { /* Metadata must remain available even when the game is temporarily unavailable. */ }
  return { props: { social: socialMetadata(data, env.APP_URL) } }
}
