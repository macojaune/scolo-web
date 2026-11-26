/** Browser recipe using an in-memory appearance fixture; never writes encounters or credits. */
import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
const browser = await chromium.launch()
const target = new URL(process.env.SCOLO_TEST_URL ?? 'http://localhost:3104')
assert.ok(['localhost','dev-scolo.marvinl.com'].includes(target.hostname), 'Only localhost or DEV is permitted.')
const tokens: {game:string;token:string}[] = []
const results: unknown[] = []
try {
 for (const viewport of [{width:1440,height:1100},{width:390,height:844}]) for (const game of ['digrain','coutelas']) {

  const touch = viewport.width < 500
  const page = await browser.newPage({ viewport, hasTouch: touch })
  const errors: string[] = []; page.on('pageerror',error=>errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('umami.disabled','1'))
  page.on('response', async response => {
    if (new URL(response.url()).pathname.endsWith('/arcade.start') && response.ok()) {
      const body = await response.json()
      const token = (Array.isArray(body) ? body[0] : body)?.result?.data?.json?.token
      if (typeof token === 'string') tokens.push({game,token})
    }
  })
  await page.route('**/api/trpc/*app.game*', async route => {
    // An explicitly simulated appearance, in browser memory only. No appearance is written.
    if (route.request().method() !== 'GET') return route.continue()
    try {
      const response = await route.fetch()
      const body = await response.json()
      for(const item of Array.isArray(body) ? body : [body]) {
        const state = item?.result?.data?.json
        if (state && 'lastAppearance' in state) {
          state.lastAppearance = {id:-1,occurredAt:new Date().toISOString(),tool:game}
          state.history = [state.lastAppearance]
        }
      }
      await route.fulfill({response,json:body})
    } catch { if (!page.isClosed()) await route.abort().catch(() => undefined) }
  })
  await page.goto(target.href, { waitUntil:'networkidle' })
  const trigger = page.getByRole('button',{name:game==='digrain'?'Jouer avec Digrain':'Jouer avec le coutelas',exact:true})
  await expect(trigger).toBeVisible({timeout:30000});await trigger.click()
  const dialog=page.getByRole('dialog',{name:`Mini-jeu : ${game==='digrain'?'Digrain':'le coutelas'}`,exact:true})
  await expect(dialog).toBeVisible()
  if (game === 'coutelas') {
    const steps = dialog.getByRole('listitem')
    await expect(steps).toHaveCount(2)
    for (const [step, click, parameter] of [
      [steps.nth(0), '1er clic', 'L’angle'],
      [steps.nth(1), '2e clic', 'La puissance'],
    ] as const) {
      await expect(step).toContainText(click)
      await expect(step).toContainText(parameter)
      await expect(step.locator('svg').first()).toBeVisible()
    }
  }
  await dialog.getByRole('button',{name:'Commencer',exact:true}).click()
  const board=dialog.getByTestId(`${game}-board`)
  await expect(board).toHaveAttribute('data-mode','playing',{timeout:20000})
  if(game==='digrain') {
   await board.focus();await page.keyboard.press('ArrowLeft');await page.keyboard.down(' ')
   await new Promise(resolve=>setTimeout(resolve,1800));await page.keyboard.up(' ')
   await expect(dialog.locator('meter')).not.toHaveAttribute('value','100')
   await dialog.getByRole('button',{name:'Pause',exact:true}).click();await expect(board).toHaveAttribute('data-mode','paused')
   await dialog.getByRole('button',{name:'Reprendre',exact:true}).first().click();await expect(board).toHaveAttribute('data-mode','playing')
  } else {
   const tapBoard = () => touch ? board.tap() : board.click()
   const shotButton = dialog.getByRole('button', { name: /^(bloquer l[’']angle|lancer)$/i })
   const guide = dialog.getByTestId('coutelas-guide')
   const landing = dialog.getByTestId('coutelas-landing')
   await expect(dialog.getByText('Touche le terrain ou appuie sur Espace. La visée accélère à chaque scolo touché.', { exact: true })).not.toBeVisible()
   await expect(dialog).not.toContainText(/\d\s*°/)
   for (let shot = 1; shot <= 3; shot++) {
     const guided = shot <= 2
     await expect(board).toHaveAttribute('data-phase', 'angle')
     await expect(shotButton).toHaveCount(0)
     await expect(guide).toBeVisible({ visible: guided })
     if (shot === 1) {
       // Aim at the left edge so the automatic shot misses at any power.
       await page.waitForFunction(() =>
         Number(document.querySelector('[data-testid="coutelas-board"]')?.getAttribute('data-angle')) >= 157)
     }
     await tapBoard()
     await expect(board).toHaveAttribute('data-phase', 'power')
     await expect(shotButton).toHaveCount(0)
     await expect(guide).toBeVisible({ visible: guided })
     await expect(landing).toBeVisible({ visible: guided })
     if (shot === 1) {
       await board.press('Escape')
       await expect(board).toHaveAttribute('data-mode', 'paused')
       const frozenPower = await board.getAttribute('data-power')
       await page.waitForTimeout(250)
       assert.equal(await board.getAttribute('data-power'), frozenPower)
       await dialog.getByRole('button',{name:'Reprendre',exact:true}).first().click()
       await expect(board).toHaveAttribute('data-mode', 'playing')
       await expect(board).toHaveAttribute('data-phase', 'power')
       // No second tap. Observe the short flight on the next animation frame.
       await page.waitForFunction(() =>
         document.querySelector('[data-testid="coutelas-board"]')?.getAttribute('data-phase') === 'flight',
       undefined, { timeout: 12000 })
     } else {
       // Throw manually at low power, well short of any target.
       await page.waitForFunction(() => {
         const power = Number(document.querySelector('[data-testid="coutelas-board"]')?.getAttribute('data-power'))
         return power >= 3 && power <= 10
       })
       await tapBoard()
       await expect(board).toHaveAttribute('data-phase', 'flight')
     }
     await expect(landing).toBeVisible({ visible: guided })
     if (shot < 3) await expect(dialog.getByTestId('coutelas-miss')).toHaveCount(shot)
   }
   const ranking = page.getByRole('dialog', { name: 'Classement : le coutelas', exact: true })
   const loss = dialog.getByTestId('coutelas-result')
   await loss.waitFor({ state: 'visible' })
   const lossShownAt = performance.now()
   await expect(loss.getByRole('heading', { name: 'Perdu', exact: true })).toBeVisible()
   await expect(loss.getByText('0 pts', { exact: true })).toBeVisible()
   await expect(dialog.getByRole('button', { name: /^(Rejouer|Classement)$/ })).toHaveCount(0)
   await expect(ranking).not.toBeVisible()
   await ranking.waitFor({ state: 'visible', timeout: 4000 })
   assert.ok(performance.now() - lossShownAt >= 1200, 'The loss and score should stay readable before the standings open')
   await expect(dialog).not.toBeVisible()
   const result = ranking.getByRole('region', { name: 'Résultat de cette partie' })
   await expect(result.getByText('Ton score', { exact: true })).toBeVisible()
   await expect(result.getByText('0 pts', { exact: true })).toBeVisible()
   await expect(result.getByText(/^#\d+$/)).toBeVisible({ timeout: 15000 })
   await ranking.getByRole('button', {name:'Rejouer', exact:true}).click()
   await expect(ranking).not.toBeVisible()
   await expect(board).toHaveAttribute('data-mode', 'playing')
   await expect(board).toHaveAttribute('data-phase', 'angle')
   await expect(guide).toBeVisible()
   await tapBoard()
   await expect(landing).toBeVisible()
  }
  await mkdir('.local',{recursive:true})
  await page.screenshot({path:`.local/${game}-${viewport.width}.png`,fullPage:true})
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
  assert.equal(overflow,false);assert.deepEqual(errors,[])
  await dialog.getByRole('button',{name:'Fermer le mini-jeu'}).click();await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await page.goto(new URL(`/?classement=${game==='digrain'?2:3}`,target).href)
  await expect(page.getByRole('dialog',{name:/Classement :/})).toBeVisible()
  results.push({game,viewport,errors,overflow});await page.close()
 }
 console.log(JSON.stringify({target:target.origin,simulatedAppearance:true,results},null,2))
}finally{await mkdir('.local',{recursive:true});await writeFile('.local/weapon-qa-sessions.json',JSON.stringify(tokens),{mode:0o600});await browser.close()}
