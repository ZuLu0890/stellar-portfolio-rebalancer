# Rebalance history at narrow widths

SPR-2026-054. The history section in `frontend/src/components/RebalanceHistory.tsx`
must stay readable and operable at **320 CSS px** and with **200% text sizing**,
without horizontal clipping.

## Behaviour

- The section header stacks the title above the export control on narrow
  screens and switches to a single row at `sm`. The export button keeps its
  full label and remains a normal, focusable button.
- History rows, badge groups, date/time metadata, gas/amount/slippage details,
  and trade breakdowns wrap onto additional lines instead of forcing the card
  wider than its container. The `Amount:` label may wrap above the figure, but
  the `$…` number itself stays intact.
- The overview grid uses an explicit single column at mobile widths, and its
  left column is `min-w-0`. Without this, the implicit `auto` track and the
  default grid-item minimum could grow the column past the viewport and clip the
  history card even when the card itself wraps correctly.
- Horizontal padding tightens on mobile (`p-3` page, `p-2` card) and the status
  icon is fixed at 40px, so 200% text cannot consume the row's content width.
- The API order of events is preserved. Events that share a timestamp render in
  the order returned by the endpoint; the layout change does not reorder rows.
- Pagination wraps below the list at narrow widths. Page buttons keep their
  accessible names, `aria-current="page"`, and the existing page-change
  announcement in the polite live region.
- The error banner (retry/dismiss) now occupies its own full-width row, so the
  message and both actions remain reachable at 320 px and 200% text.

No data fetching, settlement, or rebalance behavior is changed.

## Verification

- `frontend/src/components/RebalanceHistory.responsive.test.tsx` guards the
  structural contract (wrap-capable rows, `min-w-0` containers, preserved order
  and amounts, pagination announcement).
- `frontend/tests/e2e/rebalance-history-mobile.spec.ts` runs in Chromium and
  Firefox at a 320×800 viewport, and again with `html { font-size: 32px }` to
  emulate 200% text. It asserts that the section, export control, event rows, trade amounts,
  and pagination stay inside the viewport; that the history section has no
  horizontal overflow; that export still produces a CSV download; and that
  pagination remains clickable.
- `npm test` (Vitest) and `npm run build` cover the unit and type/build gates.
