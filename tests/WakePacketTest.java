package app.lovable.cosmorentpro;

public final class WakePacketTest {
    static void check(boolean condition) { if (!condition) throw new AssertionError(); }
    static byte[] ip(int a, int b, int c, int d) { return new byte[]{(byte)a, (byte)b, (byte)c, (byte)d}; }
    public static void main(String[] args) {
        byte[] packet = WakePacket.magic("1c:d1:d7:b8:30:68");
        check(packet.length == 102);
        for (int i = 0; i < 6; i++) check(packet[i] == (byte)255);
        byte[] mac = new byte[]{0x1c, (byte)0xd1, (byte)0xd7, (byte)0xb8, 0x30, 0x68};
        for (int i = 0; i < 96; i++) check(packet[6 + i] == mac[i % 6]);
        check(java.util.Arrays.equals(WakePacket.broadcast(ip(192,168,80,10), (short)24, ip(192,168,80,22)), ip(192,168,80,255)));
        check(java.util.Arrays.equals(WakePacket.broadcast(ip(192,168,80,10), (short)23, ip(192,168,81,22)), ip(192,168,81,255)));
        check(java.util.Arrays.equals(WakePacket.broadcast(ip(192,168,80,130), (short)25, ip(192,168,80,150)), ip(192,168,80,255)));
        check(WakePacket.broadcast(ip(192,168,80,10), (short)24, ip(192,168,81,22)) == null);
        check(WakePacket.broadcast(ip(192,168,80,10), (short)32, ip(192,168,80,22)) == null);
        try { WakePacket.magic("bad"); throw new AssertionError(); } catch (IllegalArgumentException expected) { }
        System.out.println("WoL packet and subnet broadcast tests passed");
    }
}