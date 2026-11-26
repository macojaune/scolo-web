import { useId, type ReactNode } from 'react'
import { Tabs, TabsList, TabsTrigger } from '~/components/motion/tabs'
import styles from './LeaderboardTabs.module.css'

type Game = 'coutelas' | 'sandale'
type Props = {
  value: Game
  onValueChange: (game: Game) => void
  children: ReactNode
}

export function LeaderboardTabs({ value, onValueChange, children }: Props) {
  const id = useId()
  const panelId = `${id}-panel`

  return <Tabs variant="segment" value={value} onValueChange={next => {
    if (next === 'coutelas' || next === 'sandale') onValueChange(next)
  }} labels={{ scrollLeft: 'Défiler vers la gauche', scrollRight: 'Défiler vers la droite' }}>
    <TabsList aria-label="Classements des jeux" className={`grid w-full grid-cols-2 ${styles.list}`}>
      <TabsTrigger id={`${id}-coutelas`} aria-controls={panelId} value="coutelas" className={styles.tab} indicatorClassName={styles.indicator}>Coutelas</TabsTrigger>
      <TabsTrigger id={`${id}-sandale`} aria-controls={panelId} value="sandale" className={styles.tab} indicatorClassName={styles.indicator}>Sandale</TabsTrigger>
    </TabsList>
    <div role="tabpanel" id={panelId} aria-labelledby={`${id}-${value}`} tabIndex={0}>
      {children}
    </div>
  </Tabs>
}
