package app.rentoplay.tv;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
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
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.net.URLConnection;
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
            BufferedInputStream in = new BufferedInputStream(sock.getInputStream());
            String line = readHttpLine(in);
            if (line == null) return;
            String[] parts = line.split(" ");
            String method = parts[0], path = parts.length > 1 ? parts[1] : "/";
            int len = 0;
            String h;
            while ((h = readHttpLine(in)) != null && !h.isEmpty())
                if (h.toLowerCase().startsWith("content-length:")) len = Integer.parseInt(h.substring(15).trim());
            if (len < 0 || len > 2 * 1024 * 1024) return;
            byte[] body = new byte[len];
            int read = 0;
            while (read < len) { int r = in.read(body, read, len - read); if (r < 0) break; read += r; }
            String title = "RenToPlay", msg = "", level = "info", subtitle = "", logo = "";
            boolean block = false;
            int dur = 10;
            if (method.equals("POST") && read > 0) {
                if (read != len) return;
                JSONObject j = new JSONObject(new String(body, 0, read, StandardCharsets.UTF_8));
                title = j.optString("title", title); msg = j.optString("message", msg);
                level = j.optString("level", level); dur = j.optInt("duration", dur);
                block = j.optBoolean("block", false); subtitle = j.optString("subtitle", "");
                logo = j.optString("logo", "");
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
            if (path.startsWith("/dismiss")) dismissBlock();
            else if (show && block) showBlock(this, title, subtitle, msg, logo);
            else if (show) showLocal(this, title, msg, level, dur);
            String res = "{\"ok\":true,\"app\":\"rentoplay-tv\"}";
            OutputStream out = sock.getOutputStream();
            out.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\n"
                    + "Access-Control-Allow-Headers: Content-Type\r\nAccess-Control-Allow-Private-Network: true\r\n"
                    + "Content-Length: " + res.length() + "\r\nConnection: close\r\n\r\n" + res).getBytes(StandardCharsets.UTF_8));
            out.flush();
        } catch (Exception ignored) { }
    }

    /** Content-Length counts bytes, not Unicode characters. */
    private static String readHttpLine(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        int b;
        while ((b = in.read()) != -1) {
            if (b == '\n') break;
            if (b != '\r') line.write(b);
            if (line.size() > 8192) throw new java.io.IOException("Header too long");
        }
        if (b == -1 && line.size() == 0) return null;
        return new String(line.toByteArray(), StandardCharsets.US_ASCII);
    }

    private static View blockView;

    /** Lepas layar penuh (dipanggil kasir). */
    static void dismissBlock() {
        MAIN.post(() -> {
            if (blockView == null) return;
            WindowManager wm = (WindowManager) blockView.getContext().getSystemService(WINDOW_SERVICE);
            try { wm.removeView(blockView); } catch (Exception ignored) { }
            blockView = null;
        });
    }

    /** Layar penuh semi transparan + logo store; tetap tampil sampai dilepas kasir. */
    static void showBlock(Context ctx, String title, String subtitle, String msg, String logoUrl) {
        Context app = ctx.getApplicationContext();
        Bitmap logo = null;
        if (logoUrl != null) {
            try {
                if (logoUrl.startsWith("data:image/") && logoUrl.contains(";base64,")) {
                    byte[] bytes = Base64.decode(logoUrl.substring(logoUrl.indexOf(',') + 1), Base64.DEFAULT);
                    logo = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                } else if (logoUrl.startsWith("https://") || logoUrl.startsWith("http://")) {
                    URLConnection connection = new URL(logoUrl).openConnection();
                    connection.setConnectTimeout(3000);
                    connection.setReadTimeout(3000);
                    try (InputStream is = connection.getInputStream()) { logo = BitmapFactory.decodeStream(is); }
                }
            } catch (Exception ignored) { }
        }
        final Bitmap bmp = logo;
        MAIN.post(() -> {
            if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(app)) return;
            WindowManager wm = (WindowManager) app.getSystemService(WINDOW_SERVICE);
            if (blockView != null) { try { wm.removeView(blockView); } catch (Exception ignored) { } blockView = null; }
            LinearLayout box = new LinearLayout(app);
            box.setOrientation(LinearLayout.VERTICAL);
            box.setGravity(Gravity.CENTER);
            box.setPadding(96, 64, 96, 64);
            box.setBackgroundColor(Color.parseColor("#CC0B0F1A"));
            if (bmp != null) {
                ImageView iv = new ImageView(app);
                iv.setImageBitmap(bmp);
                iv.setAdjustViewBounds(true);
                iv.setMaxHeight(260);
                LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT, 260);
                ip.bottomMargin = 40;
                box.addView(iv, ip);
            }
            TextView t = new TextView(app);
            t.setText(title); t.setTextColor(Color.parseColor("#F87171")); t.setTextSize(64);
            t.setTypeface(null, android.graphics.Typeface.BOLD); t.setGravity(Gravity.CENTER);
            TextView sub = new TextView(app);
            sub.setText(subtitle); sub.setTextColor(Color.parseColor("#CBD5E1")); sub.setTextSize(24);
            sub.setGravity(Gravity.CENTER);
            TextView m = new TextView(app);
            m.setText(msg); m.setTextColor(Color.WHITE); m.setTextSize(34); m.setGravity(Gravity.CENTER);
            m.setPadding(0, 32, 0, 0);
            box.addView(t); if (subtitle != null && !subtitle.isEmpty()) box.addView(sub); box.addView(m);
            int type = Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                    : WindowManager.LayoutParams.TYPE_PHONE;
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(
                    WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT, type,
                    WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                            | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
                    PixelFormat.TRANSLUCENT);
            try { wm.addView(box, lp); } catch (Exception e) { return; }
            blockView = box;
            if (current != null) { try { wm.removeView(current); } catch (Exception ignored) { } current = null; }
            try { new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 90).startTone(ToneGenerator.TONE_CDMA_ALERT_CALL_GUARD, 1200); }
            catch (Exception ignored) { }
        });
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
