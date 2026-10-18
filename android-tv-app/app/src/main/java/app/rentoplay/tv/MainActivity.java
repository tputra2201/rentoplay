package app.rentoplay.tv;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;

public final class MainActivity extends Activity {
    private TextView status;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.parseColor("#09111F"));
        root.setPadding(60, 60, 60, 60);
        TextView title = new TextView(this);
        title.setText("RenToPlay TV");
        title.setTextColor(Color.WHITE);
        title.setTextSize(36);
        status = new TextView(this);
        status.setTextColor(Color.parseColor("#CBD5E1"));
        status.setTextSize(22);
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, 30, 0, 30);
        Button perm = new Button(this);
        perm.setText("Izinkan tampil di atas aplikasi lain");
        perm.setOnClickListener(v -> {
            if (Build.VERSION.SDK_INT >= 23) startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getPackageName())));
        });
        Button test = new Button(this);
        test.setText("Tes tampilan");
        test.setOnClickListener(v -> OverlayService.showLocal(this, "RenToPlay - Tes", "Tampilan notifikasi di TV ini.", "warning", 6));
        root.addView(title); root.addView(status); root.addView(perm); root.addView(test);
        Button power = new Button(this); power.setText("Izinkan kontrol standby");
        power.setOnClickListener(v -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))); root.addView(power);
        Button pairing = new Button(this); pairing.setText("Tampilkan kode kontrol kasir");
        pairing.setOnClickListener(v -> new android.app.AlertDialog.Builder(this)
            .setTitle("Kode kontrol kasir — rahasia")
            .setMessage(OverlayService.controlToken(this))
            .setPositiveButton("Tutup", null).show()); root.addView(pairing);
        setContentView(root);
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 1);
    }

    @Override protected void onResume() {
        super.onResume();
        OverlayService.start(this);
        boolean ok = Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(this);
        status.setText("IP TV ini: " + ip() + "\nPort: " + OverlayService.PORT
                + "\nIzin tampil di atas aplikasi: " + (ok ? "AKTIF" : "BELUM — tekan tombol di bawah")
                + "\n\nIsi IP dan kode kontrol di kasir (Setup → Station).");
    }

    static String ip() {
        try {
            for (NetworkInterface n : Collections.list(NetworkInterface.getNetworkInterfaces()))
                for (InetAddress a : Collections.list(n.getInetAddresses()))
                    if (!a.isLoopbackAddress() && a instanceof Inet4Address) return a.getHostAddress();
        } catch (Exception ignored) { }
        return "-";
    }
}
