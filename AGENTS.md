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
- Company Report totals period-filtered incoming PAY-IN independently of later deposit use; test aggregation separately. Why: later check-in must not erase earlier receipts.
- Per-store module toggles and SALES labels live in the synced setting businessProfile; nav/route access checks businessProfile.modules — so each store can switch off Kafe/Reservasi/Playing Card.
- Station ordering uses stationModuleAccess for Cafe entry points; existing bills and rental add-ons stay accessible when Cafe is disabled, so module changes do not alter financial history.
- Sync captures only local billing mutations as explicit entity intents; hydration, storage events and remote application never enqueue writes. Online startup replaces cached lists from a complete central baseline, and reconnect pulls before sending. Offline keeps the cache and explicit queue; legacy unproven queues are quarantined. Why: cached differences must never be mistaken for new transactions.
- Store writes use the atomic store_apply_intents RPC with membership checks and expected base payload comparison; linked entities commit together, conflicting actions yield to central data with a visible warning, and authenticated legacy direct writes are rejected. Retired station/table sessions and closed shifts cannot be resurrected. Why: two cashiers or a remote VOID must not silently overwrite each other.
- `PaymentSplit.at` records receipt time; `shiftSummary` counts cash by it. Why: later bill closure must not move money between shifts.
- Closing a shift freezes its final figures into `CashShift.snapshot`; closed-shift reports read the snapshot and never recompute.
- Nullable component props use a null-check wrapper around a non-null body; never return before hooks. Why: closing StationDialog must not change hook count.
- Thermal print transports share document-specific spacing and feed-to-cut in `thermalCutText`; cutter capability has an explicit printer override independent of paper width, and Android must not feed after supplied cut commands. Why: narrow paper can be used in roll cutters and the last printed line must reach the knife before cutting; sticker printers remain opt-out.
- TV reminders go kasir Android app (`RenToPlayTV` JS bridge → AlarmManager) → `android-tv-app` companion HTTP :8765; per-unit TV IPs live in device localStorage. Why: browser timers freeze in background and HTTPS pages cannot call LAN http.
- Native TV alarms store logos in private per-session preferences and carry only a reference in PendingIntent; the receiver restores images on its worker. Why: large images exceed Android Binder limits and can prevent every reminder from being scheduled.
- TV display control is provided by native Companion via Station settings, not a browser display route, so Setup has no duplicate legacy Connect feature.
- TV controls use an async native LAN bridge, per-TV token and salted unlock hashes preserving legacy PINs. WoL uses matching-subnet broadcasts; never guess Cast endpoints. Standby needs accessibility; always-visible volume/HDMI controls auto-read status and use discovered inputs only. Why: firmware capabilities vary.
- Android WebView file inputs use WebChromeClient's activity-result callback with content URI access, while file-system access remains disabled; otherwise uploads cannot open the system picker.
- TV overlays accept store logos as image data URIs as well as HTTP URLs, and HTTP bodies are read by byte length; store uploads are embedded images and Unicode text must not stall requests.
- Successful store branding updates dispatch `rentoplay:store-info-updated` for every useStoreInfo consumer to refresh; otherwise notification schedules keep stale branding until app restart.
- Station Release dismisses only its configured TV overlay, never billing or session state; expiry eligibility and dispatch are tested in tests/tv-notify.test.js.
- Notification configuration keeps legacy message strings alongside optional structured lines and per-stage titles; Android forwards resolved titles/messages so older configurations remain valid.
- Store logo uploads use the shared PNG processor with bounded payload size and opt-in border-connected background removal; alpha and enclosed logo details must remain intact.

- Station group tones derive from name prefixes (with six-item fallback) and CSS theme tokens, independent of billing status and responsive grid position, so group identity remains stable.
- Station/Cafe/Store setup use focused tabs; TV connections stay in station details and device-local storage. Why: one configuration entry point without sync changes.
