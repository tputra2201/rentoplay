package app.rentoplay.tv;

public final class SplashStateTest {
    static void check(boolean value, String rule) { if (!value) throw new AssertionError(rule); }
    public static void main(String[] args) {
        SplashState state = new SplashState(true);
        int first = state.request(true);
        check(state.accepts(first), "screen on allows splash");
        state.screenOff();
        check(!state.accepts(first) && !state.locked(), "screen off stops pending video and lock");
        check(state.request(true) == -1, "no playback while TV off");
        state.screenOn(); int second = state.request(true);
        check(state.accepts(second) && !state.accepts(first), "wake creates a fresh video session");
        check(state.request(true) == -1 && state.accepts(second), "duplicate wake preserves active session");
        state.release();
        check(!state.accepts(second) && !state.locked(), "cashier or pattern release cancels late prepare");
        check(state.request(false) == -1, "disabled splash never locks TV");
        state.screenOff(); state.screenOn(); int third = state.request(true);
        check(state.accepts(third), "PS/CEC screen wake follows same lifecycle");
        System.out.println("7 splash lifecycle rules passed");
    }
}