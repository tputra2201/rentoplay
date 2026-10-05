package app.lovable.cosmorentpro;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.nio.charset.Charset;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class PrintBridge {
    private static final UUID SERIAL_PORT = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final Charset PRINTER_CHARSET = Charset.forName("CP437");
    private final Activity activity;
    private final WebView webView;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    PrintBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    private boolean hasPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S
                || activity.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    @JavascriptInterface
    public String getPairedPrinters() {
        JSONArray result = new JSONArray();
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !hasPermission()) return result.toString();
        try {
            Set<BluetoothDevice> devices = adapter.getBondedDevices();
            for (BluetoothDevice device : devices) {
                JSONObject item = new JSONObject();
                item.put("name", device.getName() == null ? "Printer Bluetooth" : device.getName());
                item.put("address", device.getAddress());
                result.put(item);
            }
        } catch (Exception ignored) {
            return new JSONArray().toString();
        }
        return result.toString();
    }

    @JavascriptInterface
    public void printBase64(String address, String payload) {
        executor.execute(() -> print(address, payload));
    }

    private void print(String address, String payload) {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            notifyPage(false, "Bluetooth tidak tersedia di perangkat ini");
            return;
        }
        if (!hasPermission()) {
            notifyPage(false, "Izin Bluetooth belum diberikan");
            return;
        }

        BluetoothSocket socket = null;
        try {
            BluetoothDevice device = adapter.getRemoteDevice(address);
            adapter.cancelDiscovery();
            socket = device.createRfcommSocketToServiceRecord(SERIAL_PORT);
            socket.connect();
            String text = new String(Base64.decode(payload, Base64.DEFAULT), java.nio.charset.StandardCharsets.UTF_8);
            OutputStream output = socket.getOutputStream();
            output.write(new byte[]{0x1B, 0x40});
            output.write(text.getBytes(PRINTER_CHARSET));
            // The web app supplies spacing + cut for thermal rolls. Never feed after cutting.
            // Preserve legacy behavior for sticker printers and older web clients.
            if (!text.endsWith("\u001D\u0056\u0000")) {
                output.write(new byte[]{0x0A, 0x0A, 0x0A});
            }
            output.flush();
            notifyPage(true, "Cetak berhasil dikirim ke " + safeName(device));
        } catch (Exception error) {
            notifyPage(false, "Gagal terhubung ke printer. Pastikan printer menyala dan sudah dipasangkan.");
        } finally {
            if (socket != null) {
                try { socket.close(); } catch (Exception ignored) { }
            }
        }
    }

    private String safeName(BluetoothDevice device) {
        try {
            String name = device.getName();
            return name == null ? "printer" : name;
        } catch (SecurityException ignored) {
            return "printer";
        }
    }

    private void notifyPage(boolean ok, String message) {
        String quoted = JSONObject.quote(message);
        String script = "window.dispatchEvent(new CustomEvent('billing-android-print',{detail:{ok:"
                + ok + ",message:" + quoted + "}}));";
        activity.runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }
}