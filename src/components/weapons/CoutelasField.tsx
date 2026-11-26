import { COUTELAS_ORIGIN, coutelasTargetRadius, type coutelasAim, type WeaponRun } from '~/game/weapons/engine'
import { SCOLO_VARIANTS } from '~/game/sandale/engine'
import ScoloSprite from '../sandale/ScoloSprite'
import styles from './Weapons.module.css'

type Aim = ReturnType<typeof coutelasAim>
const origin = COUTELAS_ORIGIN

const ground = <g aria-hidden="true">
  <rect width="320" height="400" fill="#e2b86e" />
  <g fill="none" stroke="#75521e" strokeWidth=".8" opacity=".44">
    <path d="M0 82H320M0 164H320M0 246H320M0 328H320M95 0V82M229 82v82M92 164v82M226 246v82M96 328v72" />
    {[84, 168, 252, 336].map(radius => <circle key={radius} cx={origin.x} cy={origin.y} r={radius} strokeDasharray="2 5" />)}
  </g>
  <g stroke="#62451b" strokeWidth="1.5" opacity=".64">
    {Array.from({ length: 17 }, (_, i) => {
      const y = 26 + i * 21
      const length = i % 4 === 0 ? 10 : 5
      return <path key={y} d={`M0 ${y}h${length}M320 ${y}h-${length}`} />
    })}
  </g>
  <path d="M9 22V9h13m276 0h13v13M9 378v13h13m276 0h13v-13" fill="none" stroke="#67491e" strokeWidth="2" />
</g>

function CoutelasSprite({ x, y, angle }: { x: number; y: number; angle: number }) {
  return <svg x={x - 26} y={y - 6} width="52" height="12" viewBox="0 205 500 100" transform={`rotate(${angle} ${x} ${y})`}>
    <image href="/coutelas.png" width="500" height="500" />
  </svg>
}

export function CoutelasField({ frame, aim }: { frame: WeaponRun; aim: Aim }) {
  const { angle, landing, phase } = aim
  const radius = coutelasTargetRadius(frame.hits)
  const shot = frame.shots[0]
  const aiming = phase === 'angle' || phase === 'power'

  return <g aria-hidden="true">
    {ground}
    {aiming && <line x1={origin.x} y1={origin.y} x2={landing.x} y2={landing.y} stroke="#32271b" strokeWidth="1.5" strokeDasharray="4 5" />}
    {frame.targets.map(bug => {
      const variant = bug.id % SCOLO_VARIANTS.length
      const color = SCOLO_VARIANTS[variant]
      const lightBug = color === 'jaune' || color === 'doré'
      return <g key={bug.id}>
        <circle data-testid="coutelas-target" cx={bug.x} cy={bug.y} r={radius} fill={lightBug ? '#272321' : '#fff4d7'} stroke="#493318" strokeWidth="1.7" />
        <g transform={`translate(${bug.x} ${bug.y}) rotate(-14) scale(1 1.45)`}>
          <svg x={-radius} y={-radius * .5} width={radius * 2} height={radius} viewBox="0 0 160 56">
            <ScoloSprite variant={variant} />
          </svg>
        </g>
      </g>
    })}
    {frame.marks.map(mark => <g key={mark.id} data-testid="coutelas-miss" data-x={mark.x} data-y={mark.y} transform={`translate(${mark.x} ${mark.y})`}>
      <path d="m-4-4 8 8m0-8-8 8" fill="none" stroke="#4b311a" strokeWidth="2.5" strokeLinecap="round" />
    </g>)}
    {phase === 'waiting' && frame.nextTarget > 0 && <g transform={`translate(${landing.x} ${landing.y})`} fill="none" stroke="#44301b">
      <circle r="12" strokeDasharray="2 3" />
      <circle r="8" fill="#ffdc32" strokeWidth="1.5" />
      <path d="m-4 0 3 3 5-6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </g>}
    {(phase === 'power' || phase === 'flight') && <g strokeWidth="1.8">
      <circle data-testid="coutelas-landing" cx={landing.x} cy={landing.y} r="6.5" fill="none" stroke="#241d15" />
      <circle cx={landing.x} cy={landing.y} r="5" fill="none" stroke="#fff" />
      <path d="M-10 0h6m8 0h6M0-10v6m0 8v6" transform={`translate(${landing.x} ${landing.y})`} stroke="#241d15" />
    </g>}
    <g transform={`translate(${origin.x} ${origin.y})`}>
      <path d="M-33 0a33 33 0 0 1 66 0" fill="none" stroke="#533719" strokeWidth="1.5" />
      <circle r="9" fill="#62451b" opacity=".42" />
      {aiming && <g transform={`rotate(${-angle})`}>
        <path d="M8-3H38V-7L51 0 38 7V3H8Z" fill="#ffdc32" stroke="#29231c" strokeWidth="2" />
      </g>}
    </g>
    {shot ? <>
      <ellipse cx={shot.x} cy={shot.y} rx="9" ry="3" fill="#2d2115" opacity=".43" />
      <CoutelasSprite x={shot.x} y={shot.y - (shot.height ?? 0)} angle={-angle + shot.age * .45} />
    </> : aiming && <CoutelasSprite x={origin.x} y={origin.y} angle={-angle} />}
  </g>
}

export function CoutelasControls({ aim, onTap }: { aim: Aim; onTap: () => void }) {
  const { angle, power, phase } = aim
  const choosingPower = phase === 'power'
  const canTap = phase === 'angle' || choosingPower
  const label = phase === 'angle' ? 'Bloquer l’angle' : choosingPower ? 'Lancer' : phase === 'flight' ? 'En vol…' : 'Touché !'
  return <div className={styles.timingControls}>
    <div className={styles.readouts}>
      <span className={phase === 'angle' ? styles.activeReadout : undefined}>Angle <b>{Math.round(angle)}°</b></span>
      <span className={choosingPower ? styles.activeReadout : undefined}>Puissance <b>{phase === 'angle' ? '—' : `${Math.round(power)} %`}</b></span>
    </div>
    <div className={styles.powerTrack} aria-hidden="true">
      <span style={{ transform: `scaleX(${phase === 'angle' ? 0 : power / 100})` }} />
    </div>
    <button type="button" data-testid="coutelas-action" aria-disabled={!canTap}
      onKeyDown={event => { if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault() }}
      onClick={() => { if (canTap) onTap() }}>
      {label}
    </button>
  </div>
}
