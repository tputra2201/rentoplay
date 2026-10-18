package app.rentoplay.tv;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;

/** Optional user-enabled service; no accessibility content is read or collected. */
public final class TvPowerService extends AccessibilityService {
    private static TvPowerService active;
    @Override protected void onServiceConnected() { active = this; }
    @Override public void onDestroy() { if (active == this) active = null; super.onDestroy(); }
    @Override public void onAccessibilityEvent(AccessibilityEvent e) { }
    @Override public void onInterrupt() { }
    static boolean standby() {
        return android.os.Build.VERSION.SDK_INT >= 28 && active != null
                && active.performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN);
    }
}