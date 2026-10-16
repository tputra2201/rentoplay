package app.lovable.cosmorentpro;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

/** Jadwal notifikasi TV lewat AlarmManager agar tetap jalan saat aplikasi di latar belakang. */
public final class TvBridge {
    private static final int[] STAGES = {600, 120, 0};
    private static final int MAX_SLOTS = 8;
    private final Context ctx;

    TvBridge(Context ctx) { this.ctx = ctx.getApplicationContext(); }

    @JavascriptInterface
    public void sendNow(String ip, String title, String message, String level) {
        TvAlarmReceiver.post(ip, title, message, level);
    }

    @JavascriptInterface
    public void sendJson(String ip, String json) {
        new Thread(() -> TvAlarmReceiver.sendRaw(ip, "/notify", json)).start();
    }

    @JavascriptInterface
    public void dismiss(String ip) {
        new Thread(() -> TvAlarmReceiver.sendRaw(ip, "/dismiss", "{}")).start();
    }

    /** Versi lama: 10 mnt, 2 mnt, habis dengan pesan bawaan. */
    @JavascriptInterface
    public void schedule(String key, String ip, String name, double endMs) {
        cancel(key);
        long now = System.currentTimeMillis();
        for (int sec : STAGES) {
            long at = (long) endMs - sec * 1000L;
            if (at < now - 30_000) continue;
            set(at, intent(key, "s" + sec, ip, name, sec, null));
        }
    }

    /** Versi baru: pesan, menit, judul, logo dan layar penuh dari pengaturan Station. */
    @JavascriptInterface
    public void scheduleJson(String key, String ip, String json) {
        cancel(key);
        try {
            JSONObject cfg = new JSONObject(json);
            long endMs = cfg.getLong("endMs");
            JSONArray stages = cfg.getJSONArray("stages");
            long now = System.currentTimeMillis();
            for (int n = 0; n < stages.length() && n < MAX_SLOTS; n++) {
                JSONObject st = stages.getJSONObject(n);
                int sec = st.getInt("sec");
                long at = endMs - sec * 1000L;
                if (at < now - 30_000) continue;
                JSONObject payload = new JSONObject();
                boolean end = sec == 0;
                payload.put("title", st.optString("title", end ? cfg.optString("endTitle", "WAKTU HABIS") : cfg.optString("title")));
                payload.put("subtitle", cfg.optString("title"));
                payload.put("message", st.optString("message"));
                payload.put("level", st.optString("level", "info"));
                payload.put("duration", end ? 30 : 12);
                payload.put("block", end && cfg.optBoolean("block", false));
                payload.put("logo", cfg.optString("logo", ""));
                set(at, intent(key, "j" + n, ip, "", sec, payload.toString()));
            }
        } catch (Exception ignored) { }
    }

    @JavascriptInterface
    public void cancel(String key) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        for (int sec : STAGES) am.cancel(intent(key, "s" + sec, "", "", sec, null));
        for (int n = 0; n < MAX_SLOTS; n++) am.cancel(intent(key, "j" + n, "", "", 0, null));
    }

    private void set(long at, PendingIntent pi) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms())
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else if (Build.VERSION.SDK_INT >= 23) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        else am.setExact(AlarmManager.RTC_WAKEUP, at, pi);
    }

    private PendingIntent intent(String key, String slot, String ip, String name, int sec, String payload) {
        Intent i = new Intent(ctx, TvAlarmReceiver.class);
        i.setAction("rtp.tv." + key + "." + slot);
        i.putExtra("ip", ip); i.putExtra("name", name); i.putExtra("stage", sec);
        if (payload != null) i.putExtra("payload", payload);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getBroadcast(ctx, (key + slot).hashCode(), i, flags);
    }
}
