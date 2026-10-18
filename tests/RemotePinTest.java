package app.rentoplay.tv;

public final class RemotePinTest {
    static void check(boolean condition) { if (!condition) throw new AssertionError(); }
    public static void main(String[] args) {
        check(RemotePin.valid("0123")); check(RemotePin.valid("987654"));
        check(!RemotePin.valid("12a4")); check(!RemotePin.valid("123"));
        String stored = RemotePin.hash("0123", "salt");
        check(!stored.equals("0123")); check(RemotePin.matches("0123", "salt", stored));
        check(!RemotePin.matches("0124", "salt", stored));
        check(!RemotePin.matches("0123", "other-salt", stored));
        String changed = RemotePin.hash("6789", "new-salt");
        check(!RemotePin.matches("0123", "new-salt", changed));
        check(RemotePin.matches("6789", "new-salt", changed));
        System.out.println("Remote PIN digits, verification and PIN change passed");
    }
}