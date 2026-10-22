package app.rentoplay.tv;

import android.view.KeyEvent;

final class SplashRemoteKeys {
    static boolean blocked(boolean locked, int code) {
        if (!locked) return false;
        switch (code) {
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
            case KeyEvent.KEYCODE_WINDOW: return true;
            default: return false;
        }
    }
}