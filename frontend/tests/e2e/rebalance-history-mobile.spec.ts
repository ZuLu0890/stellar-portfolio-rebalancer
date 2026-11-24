/**
 * SPR-2026-054: Rebalance history at 320px and 200% text sizing.
 *
 * The history endpoint is answered with two events that share a timestamp so
 * the list's stable order and trade amounts are checked against fixed data,
 * while `total` forces the pagination controls to render.
 */
import { test, expect, type Locator, type Page } from '@playwright/test'
import { connectMockWallet } from './helpers'

const VIEWPORT = { width: 320, height: 800 }
const SHARED_TIMESTAMP = '2026-02-24T10:00:00.000Z'

const HISTORY_EVENTS = [
  {
    id: 'mobile-first',
    timestamp: SHARED_TIMESTAMP,
    trigger: 'Automatic Rebalancing',
    trades: 2,
    gasUsed: '0.02 XLM',
    status: 'completed',
    portfolioId: 'p-mobile',
    details: { amount: 1200, fromAsset: 'XLM', toAsset: 'USDC' },
  },
  {
    id: 'mobile-second',
    timestamp: SHARED_TIMESTAMP,
    trigger: 'Manual Rebalance',
    trades: 3,
    gasUsed: '0.03 XLM',
    status: 'completed',
    portfolioId: 'p-mobile',
    details: { amount: 800, fromAsset: 'USDC', toAsset: 'BTC' },
  },
]

test.use({ viewport: VIEWPORT })

const PORTFOLIO = {
  id: 'p-mobile',
  totalValue: 10000,
  dayChange: 0.85,
  needsRebalance: false,
  lastRebalance: '2 hours ago',
  allocations: [
    { asset: 'XLM', target: 40, current: 40.2, amount: 4020 },
    { asset: 'USDC', target: 60, current: 59.8, amount: 5980 },
  ],
}

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
}

async function mockBackend(page: Page) {
  await page.route('**/api/auth/login', (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify({ data: {} }),
    })
  })

  await page.route('**/strategies', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true, data: [] }),
    })
  )

  await page.route('**/consent/status**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true, data: { accepted: true } }),
    })
  )

  await page.route('**/user/*/portfolios', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true, data: { portfolios: [PORTFOLIO] } }),
    })
  )

  await page.route('**/portfolio/p-mobile', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true, data: { portfolio: PORTFOLIO } }),
    })
  )

  await page.route('**/rebalance/history**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS_HEADERS })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: CORS_HEADERS,
      body: JSON.stringify({
        success: true,
        data: { history: HISTORY_EVENTS, total: 25 },
      }),
    })
  })
}

async function openHistory(page: Page) {
  await mockBackend(page)
  await page.addInitScript(() => {
    window.localStorage.setItem('onboarding-completed', '1')
    window.localStorage.setItem('onboarding-checklist-dismissed', '1')
  })
  await page.goto('/')
  await connectMockWallet(page)

  const heading = page.getByRole('heading', { name: /Rebalance History/i })
  await expect(heading).toBeVisible({ timeout: 30_000 })
  await heading.scrollIntoViewIfNeeded()
  return page.locator('section[aria-labelledby="rebalance-history-heading"]')
}

async function expectInsideViewport(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box, 'element should be laid out').not.toBeNull()
  expect(box!.x, 'left edge must not be clipped').toBeGreaterThanOrEqual(-1)
  expect(box!.x + box!.width, 'right edge must not be clipped').toBeLessThanOrEqual(VIEWPORT.width + 1)
}

async function expectHistoryUsable(page: Page, section: Locator) {
  // The global price ticker is a marquee wider than the viewport; normalise the
  // page scroll so history geometry is measured at its resting position.
  await page.evaluate(() => window.scrollTo(0, window.scrollY))
  await expectInsideViewport(section)

  // Export stays visible and operable at this width.
  const exportButton = section.getByRole('button', { name: /Export CSV/i })
  await expect(exportButton).toBeVisible()
  await expect(exportButton).toBeEnabled()
  await expectInsideViewport(exportButton)
  const download = page.waitForEvent('download')
  await exportButton.click()
  expect((await download).suggestedFilename()).toMatch(/^rebalance_history_/)

  // Both events keep their API order, and their trade amounts stay visible.
  const rows = section.getByRole('listitem')
  await expect(rows).toHaveCount(2)
  const firstBox = await rows.nth(0).boundingBox()
  const secondBox = await rows.nth(1).boundingBox()
  expect(firstBox!.y).toBeLessThan(secondBox!.y)
  await expectInsideViewport(rows.nth(0))
  await expectInsideViewport(rows.nth(1))

  const firstAmount = section.getByText(/Amount: \$1,200/)
  const secondAmount = section.getByText(/Amount: \$800/)
  await expect(firstAmount).toBeVisible()
  await expect(secondAmount).toBeVisible()
  await expectInsideViewport(firstAmount)
  await expectInsideViewport(secondAmount)

  // The section itself must not scroll horizontally.
  const overflow = await section.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1)

  // Pagination controls remain visible, inside the viewport, and operable.
  const pagination = section.getByRole('navigation', { name: /Rebalance history pagination/i })
  await expect(pagination).toBeVisible()
  await expectInsideViewport(pagination)
  await pagination.getByRole('button', { name: '2', exact: true }).click()
  await expect(pagination.getByRole('button', { name: '2', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText(/Showing rebalance history page 2 of 3/i)).toBeAttached()
}

test('keeps controls, event order, and trade amounts visible at 320px', async ({ page }) => {
  const section = await openHistory(page)
  await expectHistoryUsable(page, section)
})

test('keeps the same controls and amounts usable at 200% text', async ({ page }) => {
  const section = await openHistory(page)
  await page.addStyleTag({ content: 'html { font-size: 32px !important; }' })
  await page.getByRole('heading', { name: /Rebalance History/i }).scrollIntoViewIfNeeded()

  await expectHistoryUsable(page, section)
})
