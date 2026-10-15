package app.rentoplay.tv;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;

/** Penerima perintah lokal (HTTP port 8765) dan penampil kartu notifikasi di atas HDMI. */
public final class OverlayService extends Service {
    static final int PORT = 8765;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static View current;
    private ServerSocket server;

    static void start(Context c) {
        Intent i = new Intent(c, OverlayService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }

    @Override public void onCreate() {
        super.onCreate();
        Notification.Builder nb;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            nm.createNotificationChannel(new NotificationChannel("rtp", "RenToPlay TV", NotificationManager.IMPORTANCE_MIN));
            nb = new Notification.Builder(this, "rtp");
        } else nb = new Notification.Builder(this);
        Notification n = nb.setContentTitle("RenToPlay TV aktif").setSmallIcon(android.R.drawable.ic_dialog_info).build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(1, n);
        new Thread(this::serve, "rtp-server").start();
    }

    @Override public int onStartCommand(Intent i, int f, int id) { return START_STICKY; }
    @Override public IBinder onBind(Intent i) { return null; }
    @Override public void onDestroy() {
        try { if (server != null) server.close(); } catch (Exception ignored) { }
        super.onDestroy();
    }

    private void serve() {
        try {
            server = new ServerSocket(PORT);
            while (!server.isClosed()) {
                Socket s = server.accept();
                new Thread(() -> handle(s)).start();
            }
        } catch (Exception ignored) { }
    }

    private void handle(Socket s) {
        try (Socket sock = s) {
            sock.setSoTimeout(5000);
            BufferedReader in = new BufferedReader(new InputStreamReader(sock.getInputStream(), StandardCharsets.UTF_8));
            String line = in.readLine();
            if (line == null) return;
            String[] parts = line.split(" ");
            String method = parts[0], path = parts.length > 1 ? parts[1] : "/";
            int len = 0;
            String h;
            while ((h = in.readLine()) != null && !h.isEmpty())
                if (h.toLowerCase().startsWith("content-length:")) len = Integer.parseInt(h.substring(15).trim());
            char[] body = new char[len];
            int read = 0;
            while (read < len) { int r = in.read(body, read, len - read); if (r < 0) break; read += r; }
            String title = "RenToPlay", msg = "", level = "info";
            int dur = 10;
            if (method.equals("POST") && read > 0) {
                JSONObject j = new JSONObject(new String(body, 0, read));
                title = j.optString("title", title); msg = j.optString("message", msg);
                level = j.optString("level", level); dur = j.optInt("duration", dur);
            } else if (path.contains("?")) {
                for (String kv : path.substring(path.indexOf('?') + 1).split("&")) {
                    String[] p = kv.split("=", 2);
                    String v = p.length > 1 ? URLDecoder.decode(p[1], "UTF-8") : "";
                    if (p[0].equals("title")) title = v;
                    else if (p[0].equals("message")) msg = v;
                    else if (p[0].equals("level")) level = v;
                    else if (p[0].equals("duration")) dur = Integer.parseInt(v);
                }
            }
            boolean show = path.startsWith("/notify") && !method.equals("OPTIONS");
            if (show) showLocal(this, title, msg, level, dur);
            String res = "{\"ok\":true,\"app\":\"rentoplay-tv\"}";
            OutputStream out = sock.getOutputStream();
            out.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\n"
                    + "Access-Control-Allow-Headers: Content-Type\r\nAccess-Control-Allow-Private-Network: true\r\n"
                    + "Content-Length: " + res.length() + "\r\nConnection: close\r\n\r\n" + res).getBytes(StandardCharsets.UTF_8));
            out.flush();
        } catch (Exception ignored) { }
    }

    static void showLocal(Context ctx, String title, String msg, String level, int seconds) {
        Context app = ctx.getApplicationContext();
        MAIN.post(() -> {
            if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(app)) return;
            WindowManager wm = (WindowManager) app.getSystemService(WINDOW_SERVICE);
            if (current != null) { try { wm.removeView(current); } catch (Exception ignored) { } current = null; }
            boolean danger = "danger".equals(level);
            int color = danger ? Color.parseColor("#DC2626") : "warning".equals(level)
                    ? Color.parseColor("#F59E0B") : Color.parseColor("#0891B2");
            LinearLayout card = new LinearLayout(app);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setPadding(48, 32, 48, 32);
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(Color.parseColor("#E609111F"));
            bg.setCornerRadius(28);
            bg.setStroke(8, color);
            card.setBackground(bg);
            TextView brand = new TextView(app);
            brand.setText("RenToPlay");
            brand.setTextColor(color); brand.setTextSize(16);
            TextView t = new TextView(app);
            t.setText(title); t.setTextColor(Color.WHITE); t.setTextSize(danger ? 34 : 26);
            t.setTypeface(null, android.graphics.Typeface.BOLD);
            TextView m = new TextView(app);
            m.setText(msg); m.setTextColor(Color.parseColor("#E2E8F0")); m.setTextSize(danger ? 26 : 20);
            card.addView(brand); card.addView(t); card.addView(m);
            int type = Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                    : WindowManager.LayoutParams.TYPE_PHONE;
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                    danger ? WindowManager.LayoutParams.MATCH_PARENT : WindowManager.LayoutParams.WRAP_CONTENT,
                    WindowManager.LayoutParams.WRAP_CONTENT, type,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
                    PixelFormat.TRANSLUCENT);
            lp.gravity = danger ? Gravity.CENTER : Gravity.TOP | Gravity.END;
            lp.x = 40; lp.y = 40;
            if (danger) lp.horizontalMargin = 0.1f;
            card.setAlpha(0f);
            try { wm.addView(card, lp); } catch (Exception e) { return; }
            current = card;
            card.animate().alpha(1f).setDuration(300).start();
            try { new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 80).startTone(ToneGenerator.TONE_PROP_BEEP2, 400); }
            catch (Exception ignored) { }
            final View shown = card;
            MAIN.postDelayed(() -> shown.animate().alpha(0f).setDuration(300).withEndAction(() -> {
                try { wm.removeView(shown); } catch (Exception ignored) { }
                if (current == shown) current = null;
            }).start(), Math.max(3, Math.min(seconds, 120)) * 1000L);
        });
    }
}
