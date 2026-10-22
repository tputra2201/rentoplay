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
        if (!OverlayService.splashLocked()) return false;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_HOME:
            case KeyEvent.KEYCODE_MENU:
            case KeyEvent.KEYCODE_APP_SWITCH:
            case KeyEvent.KEYCODE_TV_INPUT:
            case KeyEvent.KEYCODE_TV_INPUT_HDMI_1:
            case KeyEvent.KEYCODE_TV_INPUT_HDMI_2:
            case KeyEvent.KEYCODE_TV_INPUT_HDMI_3:
            case KeyEvent.KEYCODE_TV_INPUT_HDMI_4:
            case KeyEvent.KEYCODE_TV_INPUT_COMPONENT_1:
            case KeyEvent.KEYCODE_TV_INPUT_COMPONENT_2:
            case KeyEvent.KEYCODE_TV_INPUT_COMPOSITE_1:
            case KeyEvent.KEYCODE_TV_INPUT_COMPOSITE_2:
            case KeyEvent.KEYCODE_TV_INPUT_VGA_1:
            case KeyEvent.KEYCODE_WINDOW:
                return true;
            default: return false; // Pattern, power and volume still reach the TV/overlay.
        }
    }
    @Override public void onInterrupt() { }
    static boolean standby() {
        return android.os.Build.VERSION.SDK_INT >= 28 && active != null
                && active.performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN);
    }
}