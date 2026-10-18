package app.rentoplay.tv;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

final class RemotePin {
    static boolean valid(String pin) { return pin != null && pin.matches("[0-9]{4,6}"); }
    static boolean validPattern(String pattern) { return pattern != null && pattern.matches("[UDLRC]{4,6}"); }
    static boolean matchesPattern(String input, String salt, String expected) {
        return validPattern(input) && MessageDigest.isEqual(hash(input, salt).getBytes(StandardCharsets.UTF_8), expected.getBytes(StandardCharsets.UTF_8));
    }
    static String hash(String pin, String salt) {
        try {
            byte[] bytes = MessageDigest.getInstance("SHA-256").digest((salt + ":" + pin).getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(); for (byte b : bytes) result.append(String.format("%02x", b & 255));
            return result.toString();
        } catch (Exception e) { throw new IllegalStateException(e); }
    }
    static boolean matches(String input, String salt, String expected) {
        return valid(input) && MessageDigest.isEqual(hash(input, salt).getBytes(StandardCharsets.UTF_8), expected.getBytes(StandardCharsets.UTF_8));
    }
}