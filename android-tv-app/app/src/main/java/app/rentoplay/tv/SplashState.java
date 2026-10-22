package app.rentoplay.tv;

/** Main-thread lifecycle gate: obsolete loads must never revive released/off splashes. */
final class SplashState {
    private int generation;
    private boolean interactive;
    private boolean locked;
    SplashState(boolean interactive) { this.interactive = interactive; }
    int request(boolean enabled) {
        if (!enabled || !interactive || locked) return -1;
        locked = true;
        return ++generation;
    }
    void screenOff() { interactive = false; release(); }
    void screenOn() { interactive = true; }
    void release() { locked = false; generation++; }
    boolean accepts(int ticket) { return ticket == generation && locked && interactive; }
    boolean locked() { return locked && interactive; }
}