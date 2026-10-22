package app.rentoplay.tv;

public final class SplashRemoteKeysTest {
    public static void main(String[] args) {
        // Android key values: Home 3, TV_INPUT 178, HDMI1..4 243..246.
        for (int key : new int[]{3, 178, 243, 244, 245, 246}) {
            if (!SplashRemoteKeys.blocked(true, key)) throw new AssertionError("Locked input escaped: " + key);
            if (SplashRemoteKeys.blocked(false, key)) throw new AssertionError("Release must restore input: " + key);
        }
        // Directions/OK, Power, Volume must remain available during the splash.
        for (int key : new int[]{19, 20, 21, 22, 23, 26, 24, 25, 164})
            if (SplashRemoteKeys.blocked(true, key)) throw new AssertionError("Allowed remote key blocked: " + key);
        System.out.println("3 remote rules passed (21 concrete key cases)");
    }
}