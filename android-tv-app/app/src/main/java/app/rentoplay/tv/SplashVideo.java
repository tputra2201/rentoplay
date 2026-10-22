package app.rentoplay.tv;

import android.content.Context;
import android.graphics.SurfaceTexture;
import android.graphics.Matrix;
import android.media.MediaPlayer;
import android.view.Surface;
import android.view.TextureView;
import java.io.File;

/** Texture-backed playback: no separate SurfaceView layer can fall behind HDMI. */
final class SplashVideo extends TextureView implements TextureView.SurfaceTextureListener {
    private final File file;
    private final boolean muted;
    private final java.util.function.BooleanSupplier allowed;
    private MediaPlayer player;
    private Surface surface;
    private boolean closed;
    SplashVideo(Context context, File file, boolean muted, java.util.function.BooleanSupplier allowed) {
        super(context);
        this.file = file; this.muted = muted; this.allowed = allowed;
        setSurfaceTextureListener(this);
    }
    @Override public void onSurfaceTextureAvailable(SurfaceTexture texture, int width, int height) {
        if (closed || !allowed.getAsBoolean()) return;
        try {
            surface = new Surface(texture);
            MediaPlayer mp = new MediaPlayer(); player = mp;
            mp.setSurface(surface);
            mp.setDataSource(file.getAbsolutePath());
            mp.setLooping(true); mp.setVolume(muted ? 0f : 1f, muted ? 0f : 1f);
            mp.setOnPreparedListener(ready -> {
                if (closed || player != ready || !allowed.getAsBoolean()) { stop(); return; }
                fit(ready); ready.start();
            });
            mp.setOnVideoSizeChangedListener((ready, w, h) -> fit(ready));
            mp.setOnErrorListener((failed, what, extra) -> { stop(); return true; });
            mp.prepareAsync();
        } catch (Exception e) { stop(); android.util.Log.w("RenToPlayTV", "Video splash gagal", e); }
    }
    private void fit(MediaPlayer mp) {
        int w = getWidth(), h = getHeight(), vw = mp.getVideoWidth(), vh = mp.getVideoHeight();
        if (w <= 0 || h <= 0 || vw <= 0 || vh <= 0) return;
        float scale = Math.min(w / (float) vw, h / (float) vh);
        Matrix matrix = new Matrix();
        matrix.setScale(vw * scale / w, vh * scale / h, w / 2f, h / 2f);
        setTransform(matrix);
    }
    void stop() {
        MediaPlayer old = player; player = null;
        if (old != null) { try { old.reset(); } catch (Exception ignored) { } old.release(); }
        if (surface != null) { surface.release(); surface = null; }
    }
    void close() { closed = true; stop(); }
    @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture texture) { stop(); return true; }
    @Override public void onSurfaceTextureSizeChanged(SurfaceTexture texture, int w, int h) { if (player != null) fit(player); }
    @Override public void onSurfaceTextureUpdated(SurfaceTexture texture) { }
}