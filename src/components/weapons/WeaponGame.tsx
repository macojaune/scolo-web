import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { advanceWeapon, coutelasAim, createWeaponRun, recordWeaponInput, STEP, type Input, type WeaponGame as Game, type WeaponRun } from '~/game/weapons/engine'
import { gameLabel, gameScore } from '~/game/weapons/catalog'
import { queueScore } from '~/game/sandale/pending-scores'
import { api } from '~/utils/api'
import ScoloSprite from '../sandale/ScoloSprite'
import { CoutelasField, CoutelasInstructions, CoutelasPower } from './CoutelasField'
import styles from './Weapons.module.css'

const clone = (run: WeaponRun) => ({ ...run, targets: run.targets.map(t => ({ ...t })), shots: run.shots.map(t => ({ ...t })), marks: [...run.marks] })
export default function WeaponGame({ game, onClose, onLeaderboard }: { game: Game; onClose: () => void; onLeaderboard: () => void }) {
  const [frame, setFrame] = useState(() => createWeaponRun(game, 1))
  const [mode, setMode] = useState<'ready' | 'preparing' | 'playing' | 'paused' | 'over'>('ready')
  const [error, setError] = useState<string | null>(null)
  const run = useRef(createWeaponRun(game, 1)), token = useRef(''), actions = useRef<Input[]>([])
  const mounted = useRef(true), arena = useRef<SVGSVGElement>(null), launch = useRef<HTMLButtonElement>(null)
  const { mutateAsync: begin } = api.arcade.start.useMutation()
  const title = useId(), instructions = useId()
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const paint = useCallback(() => setFrame(clone(run.current)), [])
  const input = useCallback((value: Omit<Input, 'at'>) => {
    if (recordWeaponInput(run.current, actions.current, value)) paint()
  }, [paint])
  const pause = useCallback(() => {
    if (run.current.game === 'digrain' && run.current.fire) input({ fire: false })
    setMode(value => value === 'playing' ? 'paused' : value)
  }, [input])
  useEffect(() => {
    const hide = () => { if (document.hidden) pause() }
    window.addEventListener('blur', pause); document.addEventListener('visibilitychange', hide)
    return () => { window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', hide) }
  }, [pause])
  useLayoutEffect(() => {
    if (mode === 'playing') arena.current?.focus({ preventScroll: true })
  }, [mode])
  useEffect(() => {
    if (mode !== 'playing') return
    let previous = performance.now(), accumulated = 0, request = 0
    const tick = (now: number) => {
      accumulated += Math.min(100, now - previous); previous = now
      const steps = Math.floor(accumulated / STEP); accumulated -= steps * STEP
      advanceWeapon(run.current, run.current.tick + steps * STEP)
      paint()
      if (run.current.status === 'lost') {
        queueScore({ token: token.current, elapsedMs: run.current.tick, actions: [...actions.current] }, game)
        setMode('over'); return
      }
      request = requestAnimationFrame(tick)
    }
    request = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(request)
  }, [mode, game, paint])
  async function start() {
    setMode('preparing'); setError(null)
    try {
      const session = await begin({ game })
      if (!mounted.current) return
      token.current = session.token; actions.current = []; run.current = createWeaponRun(game, session.seed)
      paint(); setMode('playing')
    } catch (cause) { if (mounted.current) { setError(cause instanceof Error ? cause.message : 'Réessaie dans un instant.'); setMode('ready') } }
  }
  function moveDigrain(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - bounds.left) * 320 / bounds.width
    input({ x: Math.round(Math.max(18, Math.min(302, x))) })
  }
  function resume() {
    setMode('playing')
  }
  const aim = game === 'coutelas' ? coutelasAim(frame) : null
  const tutorial = game === 'coutelas' && (mode === 'ready' || mode === 'preparing')
  const label = game === 'digrain' ? 'Invasion au Digrain' : 'Le coutelas'
  const score = gameScore(game, { elapsedMs: frame.tick, crushed: frame.hits, points: frame.score })
  return <section className={aim ? `${styles.game} ${styles.coutelasGame}` : styles.game} aria-labelledby={title}
    onKeyDown={event => {
      if (event.key === 'Escape' && mode === 'playing') {
        event.preventDefault()
        pause()
      }
    }}>
    <header><div><h3 id={title}>{label}</h3><p>{game === 'digrain' ? 'Vise. Pulvérise. Relâche pour recharger.' : 'Fais atterrir le coutelas sur le scolo.'}</p></div><button type="button" onClick={onClose} aria-label="Fermer le mini-jeu">×</button></header>
    {!tutorial && <div className={styles.hud}><strong data-testid={aim ? 'coutelas-score' : undefined}>{score}</strong><span>{game === 'digrain' ? `${frame.lives} vies · vague ${frame.wave}` : `${frame.attempts} lancer${frame.attempts > 1 ? 's' : ''}`}</span><button type="button" onClick={mode === 'paused' ? resume : pause} disabled={mode !== 'playing' && mode !== 'paused'}>{mode === 'paused' ? 'Reprendre' : 'Pause'}</button></div>}
    <div className={tutorial ? `${styles.arena} ${styles.tutorialArena}` : styles.arena}>
      <svg ref={arena} viewBox="0 0 320 400" tabIndex={tutorial ? -1 : 0} role={aim ? 'button' : 'group'} aria-hidden={tutorial || undefined} aria-keyshortcuts={aim ? 'Space Enter' : undefined} aria-label={`Terrain pour ${gameLabel(game)}`} aria-describedby={instructions}
        data-testid={`${game}-board`} data-mode={mode} data-phase={aim?.phase} data-angle={aim?.angle} data-power={aim?.power}
        onKeyDown={event => {
          if (mode !== 'playing') return
          if (game === 'coutelas') {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              if (!event.repeat) input({ tap: true })
            }
            return
          }
          if (['ArrowLeft', 'ArrowRight', ' '].includes(event.key)) event.preventDefault()
          if (event.key === 'ArrowLeft') input({ x: Math.max(18, run.current.x - 12) })
          if (event.key === 'ArrowRight') input({ x: Math.min(302, run.current.x + 12) })
          if (event.key === ' ' && !event.repeat) input({ fire: true })
        }} onKeyUp={event => { if (event.key === ' ' && game === 'digrain' && mode === 'playing') input({ fire: false }) }}
        onClick={event => {
          // Assistive technologies can activate the board without a pointer event.
          if (aim && mode === 'playing' && event.detail === 0) input({ tap: true })
        }}
        onPointerDown={event => {
          if (mode !== 'playing' || !event.isPrimary || event.button !== 0) return
          event.preventDefault(); event.currentTarget.focus()
          if (game === 'coutelas') { input({ tap: true }); return }
          event.currentTarget.setPointerCapture(event.pointerId)
          moveDigrain(event); input({ fire: true })
        }} onPointerMove={event => { if (mode === 'playing' && game === 'digrain' && event.currentTarget.hasPointerCapture(event.pointerId)) moveDigrain(event) }}
        onPointerUp={event => {
          if (mode === 'playing' && game === 'digrain') input({ fire: false })
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        }} onPointerCancel={() => { if (mode === 'playing' && game === 'digrain') input({ fire: false }) }}>
        {aim ? <CoutelasField frame={frame} aim={aim} /> : <>
          <rect width="320" height="400" fill="#141414" />
          {frame.targets.map(bug => <svg key={bug.id} x={bug.x - 22} y={bug.y - 13} width="44" height="26" viewBox="0 0 160 56"><ScoloSprite variant={bug.id % 5} /></svg>)}
          {frame.shots.map((shot, i) => <path key={i} d={`M${shot.x} ${shot.y}v12`} stroke="#facc15" strokeWidth="4" strokeLinecap="round" />)}
          <path d="M0 350H320" stroke="#facc15" opacity=".35" strokeDasharray="4 5" />
          <image href="/digrain.png" x={frame.x - 16} y="352" width="32" height="46" />
        </>}
      </svg>
      {mode !== 'playing' && <div className={tutorial ? styles.tutorial : styles.curtain}>
        <h4>{mode === 'over' ? 'Fin de partie' : mode === 'paused' ? 'Pause' : tutorial ? 'Deux clics pour lancer' : label}</h4>
        {tutorial && <><CoutelasInstructions /><p className={styles.guideNote}>Viseur et pointillés pour les deux premiers lancers.</p></>}
        {mode === 'over' && <p>{score}</p>}
        {game === 'digrain' && mode !== 'over' && <p>Maintiens pour tirer, glisse pour viser. Si la bombe se vide, relâche.</p>}
        {error && <p role="alert">{error}</p>}
        <button ref={launch} type="button" disabled={mode === 'preparing'} onClick={mode === 'paused' ? resume : () => void start()}>{mode === 'preparing' ? 'Préparation…' : mode === 'paused' ? 'Reprendre' : mode === 'over' ? 'Rejouer' : 'Commencer'}</button>
        {mode === 'over' && <button type="button" onClick={onLeaderboard}>Classement</button>}
      </div>}
    </div>
    {game === 'digrain' ? <div className={styles.controls}>
      <label>Pression : {Math.round(frame.pressure)} %<meter value={frame.pressure} min="0" max="100" /></label>
      <label>Position<input type="range" min="18" max="302" value={frame.x} disabled={mode !== 'playing'} onChange={event => input({ x: Number(event.target.value) })} /></label>
      <button type="button" disabled={mode !== 'playing'} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); input({ fire: true }) }} onPointerUp={() => input({ fire: false })} onPointerCancel={() => input({ fire: false })} onKeyDown={event => { if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); input({ fire: true }) } }} onKeyUp={event => { if ([' ', 'Enter'].includes(event.key)) input({ fire: false }) }}>Pulvériser</button>
    </div> : aim && mode === 'playing' && <CoutelasPower aim={aim} />}
    <p id={instructions} className={aim ? styles.srOnly : styles.instructions}>{aim ? 'Espace ou Entrée pour bloquer l’angle, puis une deuxième fois pour lancer.' : 'Clavier : flèches pour viser, espace pour tirer. Trois minutes maximum.'}</p>
    <span role="status" className={styles.srOnly}>{mode === 'over' ? 'Partie terminée.' : mode === 'paused' ? 'Partie en pause.' : mode === 'playing' && aim ? (
      aim.phase === 'power' ? 'Angle bloqué. Choisis ta puissance.' : aim.phase === 'flight' ? 'En vol.' : aim.phase === 'waiting' ? 'Touché !' : frame.marks.length ? `Raté. ${frame.attempts > 1 ? 'Deux essais' : 'Un essai'}. Choisis ton angle.` : 'Choisis ton angle.'
    ) : ''}</span>
  </section>
}
