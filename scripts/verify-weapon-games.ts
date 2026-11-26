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
  await page.route('**/api/trpc/**', async route => {
    try {
    const path = new URL(route.request().url()).pathname
    const response = await route.fetch()
    if (path.endsWith('/arcade.start') && response.ok()) {
      const body = await response.json()
      const token = (Array.isArray(body) ? body[0] : body)?.result?.data?.json?.token
      if (typeof token === 'string') tokens.push({game,token})
    }
    // An explicitly simulated appearance, in browser memory only. No appearance is written.
    if (route.request().method() === 'GET' && path.includes('app.game')) {
      const body = await response.json()
      for(const item of Array.isArray(body) ? body : [body]) {
        const state = item?.result?.data?.json
        if (state && 'lastAppearance' in state) {
          state.lastAppearance = {id:-1,occurredAt:new Date().toISOString(),tool:game}
          state.history = [state.lastAppearance]
        }
      }
      return route.fulfill({response,json:body})
    }
    await route.fulfill({response})
    } catch { if (!page.isClosed()) await route.abort().catch(() => undefined) }
  })
  await page.goto(target.href, { waitUntil:'networkidle' })
  const trigger = page.getByRole('button',{name:game==='digrain'?'Jouer avec Digrain':'Jouer avec le coutelas',exact:true})
  await expect(trigger).toBeVisible({timeout:30000});await trigger.click()
  const dialog=page.getByRole('dialog',{name:`Mini-jeu : ${game==='digrain'?'Digrain':'le coutelas'}`,exact:true})
  await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Commencer',exact:true}).click()
  const board=dialog.getByTestId(`${game}-board`)
  await expect(board).toHaveAttribute('data-mode','playing',{timeout:20000})
  if(game==='digrain') {
   await board.focus();await page.keyboard.press('ArrowLeft');await page.keyboard.down(' ')
   await new Promise(resolve=>setTimeout(resolve,1800));await page.keyboard.up(' ')
   await expect(dialog.locator('meter')).not.toHaveAttribute('value','100')
   await dialog.getByRole('button',{name:'Pause',exact:true}).click();await expect(board).toHaveAttribute('data-mode','paused')
   await dialog.getByRole('button',{name:'Reprendre',exact:true}).first().click();await expect(board).toHaveAttribute('data-mode','playing')
  } else {
   const action = dialog.getByTestId('coutelas-action')
   await expect(board).toHaveAttribute('data-phase', 'angle')
   if (touch) await board.tap()
   else await action.press('Enter')
   await expect(board).toHaveAttribute('data-phase', 'power')
   await expect(dialog.getByTestId('coutelas-landing')).toBeVisible()
   // Throw at low power, well short of any target.
   await page.waitForFunction(() => {
     const power = Number(document.querySelector('[data-testid="coutelas-board"]')?.getAttribute('data-power'))
     return power >= 3 && power <= 10
   })
   if (touch) await action.tap()
   else await action.click()
   await expect(board).toHaveAttribute('data-phase', 'flight')
   await expect(board).toHaveAttribute('data-phase', 'angle')
   await expect(dialog.getByTestId('coutelas-miss')).toHaveCount(1)
   await expect(dialog.getByText('2 lancers',{exact:true})).toBeVisible({timeout:8000})
   await action.press('Escape')
   await expect(board).toHaveAttribute('data-mode', 'paused')
   await dialog.getByRole('button',{name:'Reprendre',exact:true}).first().click()
   await expect(board).toHaveAttribute('data-mode', 'playing')
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
