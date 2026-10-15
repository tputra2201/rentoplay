package app.lovable.cosmorentpro;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class TvAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        int stage = i.getIntExtra("stage", 0);
        String name = i.getStringExtra("name");
        String msg = stage == 0 ? "Waktu bermain sudah habis. Terima kasih!"
                : stage == 120 ? "Sisa waktu bermain 2 menit. Hubungi kasir untuk tambah waktu."
                : "Sisa waktu bermain 10 menit.";
        String level = stage == 0 ? "danger" : stage == 120 ? "warning" : "info";
        PendingResult pr = goAsync();
        new Thread(() -> {
            send(i.getStringExtra("ip"), "RenToPlay - " + name, msg, level);
            pr.finish();
        }).start();
    }

    static void post(String ip, String title, String message, String level) {
        new Thread(() -> send(ip, title, message, level)).start();
    }

    static void send(String ip, String title, String message, String level) {
        if (ip == null || ip.isEmpty()) return;
        try {
            JSONObject j = new JSONObject();
            j.put("title", title); j.put("message", message); j.put("level", level);
            j.put("duration", "danger".equals(level) ? 30 : 12);
            HttpURLConnection con = (HttpURLConnection) new URL("http://" + ip + ":8765/notify").openConnection();
            con.setConnectTimeout(4000); con.setReadTimeout(4000);
            con.setRequestMethod("POST"); con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json");
            try (OutputStream o = con.getOutputStream()) { o.write(j.toString().getBytes(StandardCharsets.UTF_8)); }
            con.getResponseCode();
            con.disconnect();
        } catch (Exception ignored) { }
    }
}
