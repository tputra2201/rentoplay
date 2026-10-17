package app.lovable.cosmorentpro;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.PowerManager;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class TvAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String ip = i.getStringExtra("ip");
        String body = i.getStringExtra("payload");
        if (body == null) {
            int stage = i.getIntExtra("stage", 0);
            String name = i.getStringExtra("name");
            String msg = stage == 0 ? "Waktu bermain sudah habis. Terima kasih!"
                    : stage == 120 ? "Sisa waktu bermain 2 menit. Hubungi kasir untuk tambah waktu."
                    : "Sisa waktu bermain 10 menit.";
            String level = stage == 0 ? "danger" : stage == 120 ? "warning" : "info";
            body = json("RenToPlay - " + name, msg, level);
        }
        final String payload = body;
        final String logoKey = i.getStringExtra("logoKey");
        PendingResult pr = goAsync();
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wl = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "rentoplay:tv");
        wl.acquire(15_000);
        new Thread(() -> {
            try {
                // Restore the logo after alarm delivery, outside Binder and on the worker.
                String outgoing = payload;
                if (logoKey != null) {
                    try {
                        JSONObject document = new JSONObject(payload);
                        document.put("logo", c.getSharedPreferences(TvBridge.LOGO_PREFS, Context.MODE_PRIVATE)
                                .getString(logoKey, ""));
                        outgoing = document.toString();
                    } catch (Exception e) {
                        android.util.Log.w("RenToPlayTV", "Sending alert without stored logo", e);
                    }
                }
                // Coba ulang bila Wi-Fi HP baru bangun dari tidur.
                for (int n = 0; n < 3 && !sendRaw(ip, "/notify", outgoing); n++) {
                    try { Thread.sleep(1500); } catch (InterruptedException ignored) { }
                }
            } finally {
                if (wl.isHeld()) wl.release();
                pr.finish();
            }
        }).start();
    }

    static void post(String ip, String title, String message, String level) {
        new Thread(() -> sendRaw(ip, "/notify", json(title, message, level))).start();
    }

    static String json(String title, String message, String level) {
        try {
            JSONObject j = new JSONObject();
            j.put("title", title); j.put("message", message); j.put("level", level);
            j.put("duration", "danger".equals(level) ? 30 : 12);
            return j.toString();
        } catch (Exception e) { return "{}"; }
    }

    static boolean sendRaw(String ip, String path, String body) {
        if (ip == null || ip.isEmpty()) return true;
        try {
            HttpURLConnection con = (HttpURLConnection) new URL("http://" + ip + ":8765" + path).openConnection();
            con.setConnectTimeout(4000); con.setReadTimeout(4000);
            con.setRequestMethod("POST"); con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json");
            try (OutputStream o = con.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
            int code = con.getResponseCode();
            con.disconnect();
            return code < 500;
        } catch (Exception ignored) { return false; }
    }
}
