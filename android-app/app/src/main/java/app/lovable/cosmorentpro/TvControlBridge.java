package app.lovable.cosmorentpro;

import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONObject;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** Native LAN control, with explicit asynchronous replies to the cashier UI. */
public final class TvControlBridge {
    private final WebView web;
    TvControlBridge(WebView web) { this.web = web; }
    private void reply(String id, JSONObject result) {
        try {
            JSONObject event = new JSONObject(); event.put("id", id); event.put("result", result);
            String script = "window.dispatchEvent(new CustomEvent('rentoplay:tv-control-result',{detail:" + event + "}))";
            web.post(() -> web.evaluateJavascript(script, null));
        } catch (Exception ignored) { }
    }
    private JSONObject error(String message) {
        JSONObject j = new JSONObject(); try { j.put("ok", false); j.put("error", message); } catch (Exception ignored) { } return j;
    }
    private boolean validIp(String ip) { return ip != null && ip.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}"); }
    @JavascriptInterface public void request(String id, String ip, String json) {
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                if (!validIp(ip)) throw new IOException("IP TV tidak valid.");
                c = (HttpURLConnection) new URL("http://" + ip + ":8765/control").openConnection();
                c.setConnectTimeout(4000); c.setReadTimeout(8000);
                c.setRequestMethod("POST"); c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                try (OutputStream out = c.getOutputStream()) { out.write(json.getBytes(StandardCharsets.UTF_8)); }
                InputStream stream = c.getResponseCode() < 400 ? c.getInputStream() : c.getErrorStream();
                if (stream == null) throw new IOException();
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                try (InputStream in = stream) { byte[] buf = new byte[4096]; int n; while ((n = in.read(buf)) > 0) { bytes.write(buf, 0, n); if (bytes.size() > 65536) throw new IOException(); } }
                reply(id, new JSONObject(bytes.toString("UTF-8")));
            } catch (Exception e) { reply(id, error("TV tidak merespons. Periksa IP, kode kontrol, dan APK TV terbaru.")); }
            finally { if (c != null) c.disconnect(); }
        }, "rtp-control").start();
    }
    @JavascriptInterface public void wake(String id, String mac, String ip) {
        new Thread(() -> {
            try {
                if (!validIp(ip) || mac == null || !mac.matches("(?i)[0-9a-f]{2}([:-][0-9a-f]{2}){5}")) throw new IOException();
                String[] parts = mac.split("[:-]"); byte[] packet = new byte[102];
                java.util.Arrays.fill(packet, 0, 6, (byte) 255);
                for (int i = 0; i < 16; i++) for (int j = 0; j < 6; j++) packet[6 + i * 6 + j] = (byte) Integer.parseInt(parts[j], 16);
                try (DatagramSocket socket = new DatagramSocket()) {
                    socket.setBroadcast(true);
                    for (int port : new int[]{9, 7}) {
                        socket.send(new DatagramPacket(packet, packet.length, InetAddress.getByName("255.255.255.255"), port));
                        socket.send(new DatagramPacket(packet, packet.length, InetAddress.getByName(ip), port));
                    }
                }
                JSONObject j = new JSONObject(); j.put("ok", true); reply(id, j);
            } catch (Exception e) { reply(id, error("Periksa MAC TV. Wake-on-LAN perlu didukung TV dan mode standby jaringan.")); }
        }, "rtp-wake").start();
    }
}