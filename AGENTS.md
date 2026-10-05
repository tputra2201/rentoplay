<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Financial screens use one shared vocabulary: Revenue, Payments, Pay-In, Pay-Out, Cash In/Out, Cash Expected/Actual, Balance Cash, and Next Start Cash, so cashier and owner figures reconcile.
- Cash items carry a standard account (sales/other/payin/expense/payout) and automatic modules resolve their item via Account Mapping (mapFor + entry.source); reports must read entryAccount/entrySource, never hardcoded category ids — so stores can name their own COA.
- Per-store module toggles and SALES labels live in the synced setting businessProfile; nav/route access checks businessProfile.modules — so each store can switch off Kafe/Reservasi/Playing Card.
- On app open while online, a device first pulls central changes since its last sync; rows changed centrally discard that device's stale queued edits (server wins). Offline uses the local cache. Logout keeps the cache. Why: stale devices overwrote live cashier data without costing a full re-download.
- Each payment split carries the time it was received (`PaymentSplit.at`), and `shiftSummary` counts cash by that time, so money stays with the shift that received it even when the bill is closed in a later shift.
- Closing a shift freezes its final figures into `CashShift.snapshot`; closed-shift reports read the snapshot and never recompute.
- A component whose props can be empty must not return early before its hooks: keep a thin wrapper that returns null and renders a body component with non-null props, so hook count never changes. Why: `StationDialog` crashed the cashier screen with "Rendered fewer hooks than expected" when a TV panel closed.
- Thermal roll print transports share the ending in `thermalCutText`; the Android bridge must not append feed after a supplied cut command. Why: labels, bills, and receipts need consistent final spacing without feeding a new blank slip; sticker media keeps its legacy behavior.
