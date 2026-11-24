/**
 * SPR-2026-054: keep Rebalance history usable at narrow widths.
 *
 * jsdom cannot measure layout, so this file guards the structural contract
 * (wrap-capable rows, min-w-0 flex containers, preserved API order, trade
 * amounts still rendered) while tests/e2e/rebalance-history-mobile.spec.ts
 * verifies the real 320px and 200% text layout in a browser.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import RebalanceHistory from './RebalanceHistory'

const { useHistoryMock } = vi.hoisted(() => ({
    useHistoryMock: vi.fn(),
}))

vi.mock('../hooks/queries/useHistoryQuery', () => ({
    useRebalanceHistory: useHistoryMock,
}))

vi.mock('../utils/export', () => ({
    downloadCSV: vi.fn(),
    toCSV: vi.fn(() => 'csv-content'),
}))

const SHARED_TIMESTAMP = '2026-02-24T10:00:00.000Z'

const historyEvents = [
    {
        id: 'mobile-1',
        timestamp: SHARED_TIMESTAMP,
        trigger: 'Automatic Rebalancing',
        trades: 2,
        gasUsed: '0.02 XLM',
        status: 'completed',
        portfolioId: 'p-mobile',
        details: { amount: 1200, fromAsset: 'XLM', toAsset: 'USDC' },
    },
    {
        id: 'mobile-2',
        timestamp: SHARED_TIMESTAMP,
        trigger: 'Manual Rebalance',
        trades: 3,
        gasUsed: '0.03 XLM',
        status: 'completed',
        portfolioId: 'p-mobile',
        details: { amount: 800, fromAsset: 'USDC', toAsset: 'BTC' },
    },
]

function renderHistory(total = historyEvents.length) {
    useHistoryMock.mockReturnValue({
        data: { history: historyEvents, total },
        isLoading: false,
        error: null,
        refetch: vi.fn(),
        isFetching: false,
    })

    return render(<RebalanceHistory portfolioId="p-mobile" />)
}

describe('RebalanceHistory responsive structure (SPR-2026-054)', () => {
    beforeEach(() => {
        cleanup()
        useHistoryMock.mockReset()
    })

    it('preserves API order and keeps trade amounts rendered', () => {
        const { container } = renderHistory()

        const first = screen.getByText('Automatic Rebalancing')
        const second = screen.getByText('Manual Rebalance')
        expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

        expect(screen.getByText(/Amount: \$1,200/)).toBeTruthy()
        expect(screen.getByText(/Amount: \$800/)).toBeTruthy()
        expect(container.querySelectorAll('[role="listitem"]')).toHaveLength(2)
    })

    it('lets the header, event metadata, and pagination wrap instead of clipping', () => {
        renderHistory(25)

        const section = document.querySelector('section')
        expect(section).toHaveClass('min-w-0')

        const exportButton = screen.getByRole('button', { name: /Export CSV/i })
        expect(exportButton.parentElement).toHaveClass('flex-wrap')
        expect(exportButton.parentElement).toHaveClass('gap-2')

        for (const item of screen.getAllByRole('listitem')) {
            // Mobile-first padding, restored at the small breakpoint.
            expect(item).toHaveClass('p-2')
            expect(item).toHaveClass('sm:p-6')
            // Trigger/badges, date/time, and gas/amount rows must all wrap
            // rather than force the card wider than the viewport.
            expect(item.querySelectorAll('.flex-wrap').length).toBeGreaterThanOrEqual(4)
            expect(item.querySelector('.space-x-2')).toBeNull()
            expect(item.querySelector('.space-x-4')).toBeNull()
            // The status icon is fixed in px so 200% text cannot collapse the
            // content column to zero width.
            expect(item.querySelector('.w-10')).toBeNull()
            expect(screen.getByText(/Amount: \$1,200/)).not.toHaveClass('whitespace-nowrap')
        }

        const pagination = screen.getByRole('navigation', { name: /Rebalance history pagination/i })
        expect(pagination).toHaveClass('flex-wrap')
        expect(pagination).toHaveClass('max-w-full')

        fireEvent.click(screen.getByRole('button', { name: '2' }))
        expect(screen.getByRole('button', { name: '2' })).toHaveAttribute('aria-current', 'page')
        expect(screen.getByText(/Showing rebalance history page 2 of 3/i)).toBeTruthy()
    })
})
