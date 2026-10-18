package app.lovable.cosmorentpro;

/** Pure IPv4 WoL helpers, independent of Android and billing. */
final class WakePacket {
    static byte[] magic(String mac) {
        if (mac == null || !mac.matches("(?i)[0-9a-f]{2}([:-][0-9a-f]{2}){5}")) throw new IllegalArgumentException("MAC tidak valid");
        String[] parts = mac.split("[:-]"); byte[] packet = new byte[102];
        java.util.Arrays.fill(packet, 0, 6, (byte) 255);
        for (int i = 0; i < 16; i++) for (int j = 0; j < 6; j++) packet[6 + i * 6 + j] = (byte) Integer.parseInt(parts[j], 16);
        return packet;
    }
    static byte[] broadcast(byte[] local, short prefix, byte[] target) {
        if (local.length != 4 || target.length != 4 || prefix < 1 || prefix > 30) return null;
        byte[] result = new byte[4];
        for (int i = 0; i < 4; i++) {
            int bits = Math.max(0, Math.min(8, prefix - i * 8));
            int mask = (255 << (8 - bits)) & 255;
            if ((local[i] & mask) != (target[i] & mask)) return null;
            result[i] = (byte) ((local[i] & mask) | (255 ^ mask));
        }
        return result;
    }
}