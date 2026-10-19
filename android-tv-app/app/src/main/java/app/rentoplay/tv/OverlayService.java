package app.rentoplay.tv;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.media.ToneGenerator;
import android.media.tv.TvInputManager;
import android.media.tv.TvInputInfo;
import android.media.tv.TvContract;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.VideoView;

import java.io.File;
import java.io.FileOutputStream;

import org.json.JSONObject;
import org.json.JSONArray;

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
    private static View splashView;
    private final BroadcastReceiver screenReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            if (Intent.ACTION_SCREEN_ON.equals(i.getAction())) new Thread(() -> showWelcome(c)).start();
        }
    };
    static SharedPreferences controlPrefs(Context c) { return c.getSharedPreferences("rentoplay.tv-control", MODE_PRIVATE); }
    static synchronized String controlToken(Context c) {
        SharedPreferences p = controlPrefs(c);
        String token = p.getString("token", "");
        if (!token.matches("[0-9]{6}")) token = newControlToken(c);
        return token;
    }
    static synchronized String newControlToken(Context c) {
        String token = String.format(java.util.Locale.US, "%06d", new java.security.SecureRandom().nextInt(1000000));
        controlPrefs(c).edit().putString("token", token).commit();
        return token;
    }
    private static int tokenFailures = 0;
    private static long tokenLockedUntil = 0;

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
        IntentFilter filter = new IntentFilter(Intent.ACTION_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(screenReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(screenReceiver, filter);
        new Thread(() -> showWelcome(this)).start();
    }

    @Override public int onStartCommand(Intent i, int f, int id) { return START_STICKY; }
    @Override public IBinder onBind(Intent i) { return null; }
    @Override public void onDestroy() {
        try { if (server != null) server.close(); } catch (Exception ignored) { }
        unregisterReceiver(screenReceiver);
        dismissSplash();
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
            JSONObject document = new JSONObject();
            boolean block = false;
            int dur = 10;
            if (method.equals("POST") && read > 0) {
                if (read != len) return;
                JSONObject j = new JSONObject(new String(body, 0, read, StandardCharsets.UTF_8));
                document = j;
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
            boolean show = path.equals("/notify") && method.equals("POST");
            JSONObject result = new JSONObject(); result.put("ok", true); result.put("app", "rentoplay-tv");
            if (path.equals("/control") && method.equals("POST")) result = control(document);
            else if (path.equals("/dismiss") && method.equals("POST")) dismissBlock();
            else if (show && block) showBlock(this, title, subtitle, msg, logo);
            else if (show) showLocal(this, title, msg, level, dur);
            String res = result.toString();
            OutputStream out = sock.getOutputStream();
            out.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\n"
                    + "Access-Control-Allow-Headers: Content-Type\r\nAccess-Control-Allow-Private-Network: true\r\n"
                    + "Content-Length: " + res.getBytes(StandardCharsets.UTF_8).length + "\r\nConnection: close\r\n\r\n" + res).getBytes(StandardCharsets.UTF_8));
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

    private JSONObject control(JSONObject j) throws Exception {
        JSONObject result = new JSONObject();
        synchronized (OverlayService.class) {
            if (System.currentTimeMillis() < tokenLockedUntil) {
                result.put("ok", false); result.put("error", "Terlalu banyak kode salah. Coba lagi 1 menit."); return result;
            }
            if (!java.security.MessageDigest.isEqual(controlToken(this).getBytes(StandardCharsets.UTF_8), j.optString("token").trim().getBytes(StandardCharsets.UTF_8))) {
                if (++tokenFailures >= 5) { tokenFailures = 0; tokenLockedUntil = System.currentTimeMillis() + 60000; }
                result.put("ok", false); result.put("error", "Kode kontrol TV tidak cocok."); return result;
            }
            tokenFailures = 0;
        }
        String action = j.optString("action");
        if (action.equals("configure")) {
            String pin = j.optString("unlockPattern");
            if (!RemotePin.validPattern(pin)) { result.put("ok", false); result.put("error", "Pola remote harus 4–6 tombol arah/OK. Perbarui pengaturan kasir."); return result; }
            String salt = java.util.UUID.randomUUID().toString();
            String videoUrl = j.optString("videoUrl");
            boolean saved = controlPrefs(this).edit().putString("salt", salt).putString("pinHash", RemotePin.hash(pin, salt))
                .putInt("pinLength", pin.length()).putBoolean("directionPattern", true)
                .putString("title", j.optString("title")).putString("message", j.optString("message"))
                .putString("logo", j.optString("logo")).putString("store", j.optString("store"))
                .putString("videoUrl", videoUrl).putBoolean("videoMuted", j.optBoolean("videoMuted", true))
                .putBoolean("enabled", j.optBoolean("enabled")).commit();
            if (saved) syncSplashVideo(this, videoUrl);
            if (saved && !j.optBoolean("enabled")) dismissSplash();
            result.put("ok", saved); if (!saved) result.put("error", "Pengaturan TV gagal disimpan."); return result;
        }
        if (action.equals("splash")) { showWelcome(this); result.put("ok", controlPrefs(this).getBoolean("enabled", false)); if (!result.getBoolean("ok")) result.put("error", "Aktifkan dan kirim pengaturan splash terlebih dahulu."); return result; }
        if (action.equals("releaseSplash")) { dismissSplash(); result.put("ok", true); return result; }
        if (action.equals("wake")) {
            // Bangunkan layar dari dalam jaringan: WoL sering diblokir router Wi-Fi,
            // sedangkan Companion tetap bisa dihubungi selama Wi-Fi TV hidup.
            // Wake lock ditahan 10 detik — dilepas langsung membuat layar kembali padam
            // sebelum sempat menyala.
            MAIN.post(() -> {
                try {
                    android.os.PowerManager pm = (android.os.PowerManager) getSystemService(POWER_SERVICE);
                    if (pm != null && !pm.isInteractive()) {
                        android.os.PowerManager.WakeLock lock = pm.newWakeLock(
                            android.os.PowerManager.FULL_WAKE_LOCK | android.os.PowerManager.ACQUIRE_CAUSES_WAKEUP | android.os.PowerManager.ON_AFTER_RELEASE,
                            "rentoplay:wake");
                        lock.acquire(10000);
                        MAIN.postDelayed(() -> { try { if (lock.isHeld()) lock.release(); } catch (Exception ignored) { } }, 10000);
                    }
                } catch (Exception ignored) { }
                if (controlPrefs(this).getBoolean("enabled", false)) showWelcome(this);
            });
            result.put("ok", true); return result;
        }
        java.util.concurrent.FutureTask<JSONObject> task = new java.util.concurrent.FutureTask<>(() -> {
            JSONObject r = new JSONObject(); r.put("ok", true);
            try {
                AudioManager audio = (AudioManager) getSystemService(AUDIO_SERVICE);
                if (action.equals("volume")) {
                    int percent = Math.max(0, Math.min(100, j.optInt("value")));
                    audio.setStreamVolume(AudioManager.STREAM_MUSIC, Math.round(audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC) * percent / 100f), 0);
                } else if (action.equals("home")) {
                    startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                } else if (action.equals("standby")) {
                    if (!TvPowerService.standby()) throw new IllegalStateException("Aktifkan RenToPlay TV — Standby di pengaturan Aksesibilitas TV. TV harus mendukung kunci layar.");
                } else if (action.equals("input")) {
                    TvInputManager manager = (TvInputManager) getSystemService(TV_INPUT_SERVICE);
                    String id = j.optString("inputId"); boolean found = false;
                    for (TvInputInfo info : manager.getTvInputList()) if (info.getId().equals(id)) found = true;
                    if (!found) throw new IllegalArgumentException("Input TV tidak tersedia.");
                    Intent input = new Intent(Intent.ACTION_VIEW, TvContract.buildChannelUriForPassthroughInput(id)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    if (input.resolveActivity(getPackageManager()) == null) throw new IllegalStateException("TV tidak menyediakan pemindahan HDMI melalui aplikasi.");
                    startActivity(input);
                } else if (!action.equals("status")) throw new IllegalArgumentException("Perintah tidak dikenal.");
                r.put("volume", Math.round(audio.getStreamVolume(AudioManager.STREAM_MUSIC) * 100f / Math.max(1, audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC))));
                JSONArray inputs = new JSONArray();
                TvInputManager manager = (TvInputManager) getSystemService(TV_INPUT_SERVICE);
                if (manager != null) for (TvInputInfo info : manager.getTvInputList()) if (info.isPassthroughInput()) {
                    JSONObject entry = new JSONObject(); entry.put("id", info.getId()); entry.put("label", info.loadLabel(this).toString()); inputs.put(entry);
                }
                r.put("inputs", inputs);
            } catch (Exception e) { r.put("ok", false); r.put("error", e.getMessage() == null ? "Perintah tidak didukung TV ini." : e.getMessage()); }
            return r;
        });
        MAIN.post(task); return task.get(5, java.util.concurrent.TimeUnit.SECONDS);
    }

    private static VideoView splashPlayer;

    static void dismissSplash() {
        MAIN.post(() -> { if (splashView == null) return;
            try { if (splashPlayer != null) { splashPlayer.stopPlayback(); splashPlayer = null; } } catch (Exception ignored) { }
            try { ((WindowManager) splashView.getContext().getSystemService(WINDOW_SERVICE)).removeView(splashView); } catch (Exception ignored) { }
            splashView = null;
        });
    }

    /** Unduh video splash sekali ke memori TV; diputar dari berkas lokal agar lancar tanpa internet. */
    private static void syncSplashVideo(Context ctx, String url) {
        File target = new File(ctx.getFilesDir(), "splash.mp4");
        if (url == null || url.isEmpty()) {
            if (target.exists()) target.delete();
            controlPrefs(ctx).edit().remove("videoCached").apply();
            return;
        }
        if (url.equals(controlPrefs(ctx).getString("videoCached", "")) && target.exists()) return;
        Context app = ctx.getApplicationContext();
        new Thread(() -> {
            try {
                URLConnection c = new URL(url).openConnection();
                c.setConnectTimeout(8000); c.setReadTimeout(30000);
                File tmp = new File(app.getFilesDir(), "splash.tmp");
                try (InputStream in = c.getInputStream(); FileOutputStream out = new FileOutputStream(tmp)) {
                    byte[] buf = new byte[65536]; int r; long total = 0;
                    while ((r = in.read(buf)) != -1) {
                        total += r;
                        if (total > 50L * 1024 * 1024) throw new java.io.IOException("Video melebihi 50 MB");
                        out.write(buf, 0, r);
                    }
                }
                if (target.exists()) target.delete();
                if (tmp.renameTo(target)) controlPrefs(app).edit().putString("videoCached", url).apply();
            } catch (Exception e) { android.util.Log.w("RenToPlayTV", "Unduh video splash gagal", e); }
        }, "rtp-splash-video").start();
    }

    static void showWelcome(Context ctx) {
        SharedPreferences p = controlPrefs(ctx);
        if (!p.getBoolean("enabled", false)) return;
        Bitmap decoded = null;
        String logo = p.getString("logo", "");
        try {
            if (logo.startsWith("data:image/") && logo.contains(";base64,")) {
                byte[] bytes = Base64.decode(logo.substring(logo.indexOf(',') + 1), Base64.DEFAULT);
                decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            } else if (logo.startsWith("https://") || logo.startsWith("http://")) {
                URLConnection c = new URL(logo).openConnection(); c.setConnectTimeout(3000); c.setReadTimeout(3000);
                try (InputStream in = c.getInputStream()) { decoded = BitmapFactory.decodeStream(in); }
            }
        } catch (Exception ignored) { }
        final Bitmap image = decoded;
        final File videoFile = new File(ctx.getFilesDir(), "splash.mp4");
        final boolean useVideo = !p.getString("videoUrl", "").isEmpty() && videoFile.exists() && videoFile.length() > 0;
        MAIN.post(() -> {
            if (splashView != null || !Settings.canDrawOverlays(ctx)) return;
            FrameLayout box = new FrameLayout(ctx);
            box.setBackgroundColor(Color.rgb(11, 15, 26));
            if (useVideo) {
                final VideoView vv = new VideoView(ctx);
                vv.setVideoURI(Uri.fromFile(videoFile));
                vv.setOnPreparedListener(mp -> {
                    mp.setLooping(true);
                    if (p.getBoolean("videoMuted", true)) mp.setVolume(0f, 0f);
                    vv.start();
                });
                box.addView(vv, new FrameLayout.LayoutParams(-1, -1, Gravity.CENTER));
                splashPlayer = vv;
            } else {
                LinearLayout content = new LinearLayout(ctx); content.setOrientation(LinearLayout.VERTICAL); content.setGravity(Gravity.CENTER);
                content.setPadding(64, 48, 64, 48);
                if (image != null) { ImageView iv = new ImageView(ctx); iv.setImageBitmap(image); iv.setScaleType(ImageView.ScaleType.FIT_CENTER); content.addView(iv, new LinearLayout.LayoutParams(360, 240)); }
                TextView title = new TextView(ctx); title.setText(p.getString("title", "Selamat Datang")); title.setTextSize(44); title.setTextColor(Color.WHITE); title.setGravity(Gravity.CENTER); content.addView(title);
                TextView store = new TextView(ctx); store.setText(p.getString("store", "")); store.setTextSize(28); store.setTextColor(Color.LTGRAY); store.setGravity(Gravity.CENTER); content.addView(store);
                TextView message = new TextView(ctx); message.setText(p.getString("message", "")); message.setTextSize(26); message.setTextColor(Color.WHITE); message.setGravity(Gravity.CENTER); content.addView(message);
                box.addView(content, new FrameLayout.LayoutParams(-1, -1));
            }
            TextView dots = new TextView(ctx); dots.setTextSize(24); dots.setTextColor(Color.LTGRAY);
            FrameLayout.LayoutParams dotsLp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
            dotsLp.bottomMargin = 40; box.addView(dots, dotsLp);
            StringBuilder entered = new StringBuilder(); int[] attempts = {0}; long[] blockedUntil = {0};
            box.setFocusableInTouchMode(true);
            box.setOnKeyListener((view, code, event) -> {
                if (code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN || code == KeyEvent.KEYCODE_VOLUME_MUTE || code == KeyEvent.KEYCODE_POWER) return false;
                if (event.getAction() != KeyEvent.ACTION_DOWN || event.getRepeatCount() > 0) return true;
                if (System.currentTimeMillis() < blockedUntil[0]) return true;
                if (code == KeyEvent.KEYCODE_DEL || code == KeyEvent.KEYCODE_BACK) { entered.setLength(0); dots.setText(""); return true; }
                boolean direction = p.getBoolean("directionPattern", false);
                String key = direction ? remoteDirection(code) : (code >= KeyEvent.KEYCODE_0 && code <= KeyEvent.KEYCODE_9 ? String.valueOf(code - KeyEvent.KEYCODE_0) : "");
                if (!key.isEmpty()) {
                    entered.append(key); dots.setText(new String(new char[entered.length()]).replace('\0', '•'));
                    boolean match = direction ? RemotePin.matchesPattern(entered.toString(), p.getString("salt", ""), p.getString("pinHash", "")) : RemotePin.matches(entered.toString(), p.getString("salt", ""), p.getString("pinHash", ""));
                    if (match) { dismissSplash(); return true; }
                    // A shorter PIN prefix may be valid, but unmatched inputs reset at the configured length.
                    if (entered.length() >= p.getInt("pinLength", 6)) {
                        entered.setLength(0); attempts[0]++; dots.setText(direction ? "Pola salah" : "PIN salah");
                        if (attempts[0] >= 5) { attempts[0] = 0; blockedUntil[0] = System.currentTimeMillis() + 30000; dots.setText("Coba lagi dalam 30 detik"); }
                    }
                }
                return true;
            });
            int type = Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE;
            WindowManager.LayoutParams lp = new WindowManager.LayoutParams(-1, -1, type, WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN, PixelFormat.TRANSLUCENT);
            try { ((WindowManager) ctx.getSystemService(WINDOW_SERVICE)).addView(box, lp); splashView = box; box.requestFocus(); } catch (Exception e) { android.util.Log.w("RenToPlayTV", "Splash not supported", e); }
        });
    }

    /** Lepas layar penuh (dipanggil kasir). */
    static String remoteDirection(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_DPAD_UP: return "U";
            case KeyEvent.KEYCODE_DPAD_DOWN: return "D";
            case KeyEvent.KEYCODE_DPAD_LEFT: return "L";
            case KeyEvent.KEYCODE_DPAD_RIGHT: return "R";
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER: return "C";
            default: return "";
        }
    }

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
            box.setBackgroundColor(Color.rgb(0, 0, 0));
            if (bmp != null) {
                ImageView iv = new ImageView(app);
                iv.setImageBitmap(bmp);
                iv.setScaleType(ImageView.ScaleType.FIT_CENTER);
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
            card.setPadding(28, 18, 28, 18);
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(Color.parseColor("#E609111F"));
            bg.setCornerRadius(16);
            bg.setStroke(4, color);
            card.setBackground(bg);
            TextView brand = new TextView(app);
            brand.setText("RenToPlay");
            brand.setTextColor(color); brand.setTextSize(12);
            TextView t = new TextView(app);
            t.setText(title); t.setTextColor(Color.WHITE); t.setTextSize(danger ? 34 : 21);
            t.setTypeface(null, android.graphics.Typeface.BOLD);
            TextView m = new TextView(app);
            m.setText(msg); m.setTextColor(Color.parseColor("#E2E8F0")); m.setTextSize(danger ? 26 : 17);
            int compactWidth = Math.min(app.getResources().getDisplayMetrics().widthPixels / 3,
                    Math.round(360 * app.getResources().getDisplayMetrics().density));
            if (!danger) { t.setMaxWidth(compactWidth); m.setMaxWidth(compactWidth); }
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
