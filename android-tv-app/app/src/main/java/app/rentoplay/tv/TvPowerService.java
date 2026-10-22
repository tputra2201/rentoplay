package app.rentoplay.tv;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.KeyEvent;

/** Opt-in key/window protection; no screen content is read or collected. */
public final class TvPowerService extends AccessibilityService {
    private static TvPowerService active;
    private long lastRestore;
    @Override protected void onServiceConnected() { active = this; }
    @Override public void onDestroy() { if (active == this) active = null; super.onDestroy(); }
    @Override public void onAccessibilityEvent(AccessibilityEvent e) {
        if (!OverlayService.splashLocked() || e.getEventType() != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        CharSequence name = e.getPackageName();
        if (name == null || getPackageName().contentEquals(name)) return;
        long now = android.os.SystemClock.elapsedRealtime();
        if (now - lastRestore < 1500) return;
        lastRestore = now;
        // Best effort only: OEM HDMI/system surfaces can bypass application overlays.
        performGlobalAction(GLOBAL_ACTION_HOME);
        OverlayService.restoreSplashFocus();
    }
    @Override protected boolean onKeyEvent(KeyEvent event) {
        return SplashRemoteKeys.blocked(OverlayService.splashLocked(), event.getKeyCode());
    }
    @Override public void onInterrupt() { }
    static boolean standby() {
        return android.os.Build.VERSION.SDK_INT >= 28 && active != null
                && active.performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN);
    }
}