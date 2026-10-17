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
- Station ordering uses stationModuleAccess for Cafe entry points; existing bills and rental add-ons stay accessible when Cafe is disabled, so module changes do not alter financial history.
- On app open while online, a device first pulls central changes since its last sync; rows changed centrally discard that device's stale queued edits (server wins). Offline uses the local cache. Logout keeps the cache. Why: stale devices overwrote live cashier data without costing a full re-download.
- Each payment split carries the time it was received (`PaymentSplit.at`), and `shiftSummary` counts cash by that time, so money stays with the shift that received it even when the bill is closed in a later shift.
- Closing a shift freezes its final figures into `CashShift.snapshot`; closed-shift reports read the snapshot and never recompute.
- A component whose props can be empty must not return early before its hooks: keep a thin wrapper that returns null and renders a body component with non-null props, so hook count never changes. Why: `StationDialog` crashed the cashier screen with "Rendered fewer hooks than expected" when a TV panel closed.
- Thermal print transports share document-specific spacing and feed-to-cut in `thermalCutText`; cutter capability has an explicit printer override independent of paper width, and Android must not feed after supplied cut commands. Why: narrow paper can be used in roll cutters and the last printed line must reach the knife before cutting; sticker printers remain opt-out.
- TV reminders go kasir Android app (`RenToPlayTV` JS bridge → AlarmManager) → `android-tv-app` companion HTTP :8765; per-unit TV IPs live in device localStorage. Why: browser timers freeze in background and HTTPS pages cannot call LAN http.
- Native TV alarms store logos in private per-session preferences and carry only a reference in PendingIntent; the receiver restores images on its worker. Why: large images exceed Android Binder limits and can prevent every reminder from being scheduled.
- TV display control is provided by native Companion via Station settings, not a browser display route, so Setup has no duplicate legacy Connect feature.
- Android WebView file inputs use WebChromeClient's activity-result callback with content URI access, while file-system access remains disabled; otherwise uploads cannot open the system picker.
- TV overlays accept store logos as image data URIs as well as HTTP URLs, and HTTP bodies are read by byte length; store uploads are embedded images and Unicode text must not stall requests.
- Successful store branding updates dispatch `rentoplay:store-info-updated` for every useStoreInfo consumer to refresh; otherwise notification schedules keep stale branding until app restart.
- Station Release dismisses only its configured TV overlay, never billing or session state; expiry eligibility and dispatch are tested in tests/tv-notify.test.js.
- Notification configuration keeps legacy message strings alongside optional structured lines and per-stage titles; Android forwards resolved titles/messages so older configurations remain valid.
- Store logo uploads use the shared PNG processor with bounded payload size and opt-in border-connected background removal; alpha and enclosed logo details must remain intact.
