package app.lovable.cosmorentpro;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.webkit.JavascriptInterface;

/** Jadwal notifikasi TV lewat AlarmManager agar tetap jalan saat aplikasi di latar belakang. */
public final class TvBridge {
    private static final int[] STAGES = {600, 120, 0};
    private final Context ctx;

    TvBridge(Context ctx) { this.ctx = ctx.getApplicationContext(); }

    @JavascriptInterface
    public void sendNow(String ip, String title, String message, String level) {
        TvAlarmReceiver.post(ip, title, message, level);
    }

    /** endMs = waktu selesai (epoch ms). Menjadwal ulang 10 mnt, 2 mnt, habis. */
    @JavascriptInterface
    public void schedule(String key, String ip, String name, double endMs) {
        cancel(key);
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        long now = System.currentTimeMillis();
        for (int sec : STAGES) {
            long at = (long) endMs - sec * 1000L;
            if (at < now - 30_000) continue;
            PendingIntent pi = intent(key, sec, ip, name);
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms())
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else if (Build.VERSION.SDK_INT >= 23) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else am.setExact(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    @JavascriptInterface
    public void cancel(String key) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        for (int sec : STAGES) am.cancel(intent(key, sec, "", ""));
    }

    private PendingIntent intent(String key, int sec, String ip, String name) {
        Intent i = new Intent(ctx, TvAlarmReceiver.class);
        i.setAction("rtp.tv." + key + "." + sec);
        i.putExtra("ip", ip); i.putExtra("name", name); i.putExtra("stage", sec);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getBroadcast(ctx, (key + sec).hashCode(), i, flags);
    }
}
