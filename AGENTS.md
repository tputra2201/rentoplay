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

- Financial vocabulary: Revenue, Payments, Pay-In, Pay-Out, Cash In/Out, Cash Expected/Actual, Balance Cash, Next Start Cash. Why: reconcile cashier/owner figures.
- Cash items carry a standard account (sales/other/payin/expense/payout) and automatic modules resolve their item via Account Mapping (mapFor + entry.source); reports must read entryAccount/entrySource, never hardcoded category ids — so stores can name their own COA.
- Company Report totals period-filtered incoming PAY-IN independently of later deposit use; test aggregation separately. Why: later check-in must not erase earlier receipts.
- Per-store module toggles and SALES labels live in the synced setting businessProfile; nav/route access checks businessProfile.modules — so each store can switch off Kafe/Reservasi/Playing Card.
- Station ordering uses stationModuleAccess for Cafe entry points; existing bills and rental add-ons stay accessible when Cafe is disabled, so module changes do not alter financial history.
- Sync explicit mutations only, never hydration/reads. Atomic store-scoped journal/outbox shards: remove empties, recover/clean old same-store shards only with lifetime Web Lock + fresh read. Pull before push; withhold unscoped legacy queues. Why: protect offline work across tabs/stores.
- Store writes use store_apply_intents: membership/base checks, linked atomic commits, visible conflicts, no legacy direct writes or resurrection of retired sessions/closed shifts. Why: prevent multi-cashier/VOID overwrites.
- `PaymentSplit.at` records receipt time; `shiftSummary` counts cash by it. Why: later bill closure must not move money between shifts.
- Closing a shift freezes its final figures into `CashShift.snapshot`; closed-shift reports read the snapshot and never recompute.
- Nullable component props use a null-check wrapper around a non-null body; never return before hooks. Why: closing StationDialog must not change hook count.
- Thermal transports share thermalCutText spacing/feed-to-cut; cutter override is independent of width, Android never feeds after supplied cuts, stickers opt out. Why: the last line must reach the knife even on narrow roll cutters.
- TV reminders go kasir Android app (`RenToPlayTV` JS bridge → AlarmManager) → `android-tv-app` companion HTTP :8765; per-unit TV IPs live in device localStorage. Why: browser timers freeze in background and HTTPS pages cannot call LAN http.
- Native TV alarm logos stay in private session preferences; PendingIntent carries references restored by the worker. Why: avoid Binder limits.
- TV display control is provided by native Companion via Station settings, not a browser display route, so Setup has no duplicate legacy Connect feature.
- TV controls use async native LAN, per-TV tokens, salted unlock hashes/legacy PINs, subnet WoL, no guessed Cast endpoints. Volume/HDMI auto-read discovered inputs; standby requires accessibility. Why: firmware varies.
- Splash uses TextureView/local MediaPlayer, main-thread generation gates and SCREEN_OFF teardown; optional accessibility filters Home/input and restores focus without resetting unlock attempts. Why: stop standby audio and stale callbacks; OEM HDMI/CEC restrictions remain best-effort.
- Android WebView file inputs use WebChromeClient's activity-result callback with content URI access, while file-system access remains disabled; otherwise uploads cannot open the system picker.
- TV overlays accept image data URIs/HTTP logos; HTTP bodies use byte lengths. Why: embedded logos and Unicode must work.
- Successful store branding updates dispatch `rentoplay:store-info-updated` for every useStoreInfo consumer to refresh; otherwise notification schedules keep stale branding until app restart.
- Station Release dismisses only its configured TV overlay, never billing or session state; expiry eligibility and dispatch are tested in tests/tv-notify.test.js.
- Notification configuration keeps legacy message strings alongside optional structured lines and per-stage titles; Android forwards resolved titles/messages so older configurations remain valid.
- Store logo uploads use the shared PNG processor with bounded payload size and opt-in border-connected background removal; alpha and enclosed logo details must remain intact.

- Station group tones derive from name prefixes (with six-item fallback) and CSS theme tokens, independent of billing status and responsive grid position, so group identity remains stable.
- Station/Cafe/Store setup use focused tabs; TV connections stay in station details and device-local storage. Why: one configuration entry point without sync changes.
