package app.lovable.cosmorentpro;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.BluetoothSocket;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.lang.reflect.Method;
import java.nio.charset.Charset;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Cetak langsung dari APK ke printer thermal: Bluetooth Classic (SPP) dan
 * Bluetooth Low Energy (BLE/GATT, mis. Kassen) — tanpa aplikasi tambahan.
 */
public final class PrintBridge {
    private static final UUID SERIAL_PORT = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final Charset PRINTER_CHARSET = Charset.forName("CP437");
    private final Activity activity;
    private final WebView webView;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    /** Printer BLE hasil pindai: alamat -> nama. */
    private final Map<String, String> scanned = new LinkedHashMap<>();
    private boolean scanning = false;

    PrintBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    private boolean hasPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S
                || activity.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasScanPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            return activity.checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED;
        return activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @JavascriptInterface
    public String getPairedPrinters() {
        JSONArray result = new JSONArray();
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !hasPermission()) return result.toString();
        Map<String, String> all = new LinkedHashMap<>();
        try {
            Set<BluetoothDevice> devices = adapter.getBondedDevices();
            for (BluetoothDevice device : devices) {
                all.put(device.getAddress(), device.getName() == null ? "Printer Bluetooth" : device.getName());
            }
        } catch (Exception ignored) { }
        synchronized (scanned) {
            for (Map.Entry<String, String> e : scanned.entrySet()) {
                if (!all.containsKey(e.getKey())) all.put(e.getKey(), e.getValue() + " (BLE)");
            }
        }
        try {
            for (Map.Entry<String, String> e : all.entrySet()) {
                JSONObject item = new JSONObject();
                item.put("name", e.getValue());
                item.put("address", e.getKey());
                result.put(item);
            }
        } catch (Exception ignored) { }
        return result.toString();
    }

    /** Pindai printer BLE di sekitar selama 6 detik, lalu beri tahu halaman. */
    @JavascriptInterface
    public void scanPrinters() {
        main.post(() -> {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            if (adapter == null || !adapter.isEnabled()) {
                notifyScan("Bluetooth mati. Nyalakan Bluetooth lalu pindai lagi.");
                return;
            }
            if (!hasPermission() || !hasScanPermission()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    activity.requestPermissions(new String[]{
                            Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN}, 42);
                } else {
                    activity.requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, 42);
                }
                notifyScan("Izinkan akses Bluetooth/Perangkat sekitar, lalu tekan Pindai lagi.");
                return;
            }
            BluetoothLeScanner scanner = adapter.getBluetoothLeScanner();
            if (scanner == null || scanning) { notifyScan(null); return; }
            scanning = true;
            ScanCallback callback = new ScanCallback() {
                @Override
                public void onScanResult(int type, ScanResult result) {
                    try {
                        BluetoothDevice d = result.getDevice();
                        String name = d.getName();
                        if (name == null && result.getScanRecord() != null) name = result.getScanRecord().getDeviceName();
                        if (name == null || name.trim().isEmpty()) return;
                        synchronized (scanned) { scanned.put(d.getAddress(), name); }
                    } catch (SecurityException ignored) { }
                }
            };
            try {
                scanner.startScan(callback);
            } catch (SecurityException e) {
                scanning = false;
                notifyScan("Izin pindai Bluetooth ditolak.");
                return;
            }
            main.postDelayed(() -> {
                try { scanner.stopScan(callback); } catch (Exception ignored) { }
                scanning = false;
                notifyScan(null);
            }, 6000);
        });
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
        BluetoothDevice device;
        byte[] bytes;
        try {
            device = adapter.getRemoteDevice(address);
            String text = new String(Base64.decode(payload, Base64.DEFAULT), java.nio.charset.StandardCharsets.UTF_8);
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            buf.write(new byte[]{0x1B, 0x40});
            buf.write(text.getBytes(PRINTER_CHARSET));
            // The web app supplies spacing + cut for thermal rolls. Never feed after cutting.
            if (!text.endsWith("\035V\000") && !text.endsWith("\035VB\000")) {
                buf.write(new byte[]{0x0A, 0x0A, 0x0A});
            }
            bytes = buf.toByteArray();
        } catch (Exception error) {
            notifyPage(false, "Alamat printer tidak valid. Pilih ulang printer.");
            return;
        }
        try { adapter.cancelDiscovery(); } catch (Exception ignored) { }

        int type = BluetoothDevice.DEVICE_TYPE_UNKNOWN;
        try { type = device.getType(); } catch (Exception ignored) { }
        boolean bleOnly = type == BluetoothDevice.DEVICE_TYPE_LE;
        boolean inScan;
        synchronized (scanned) { inScan = scanned.containsKey(address); }

        if (!bleOnly && printClassic(device, bytes)) {
            notifyPage(true, "Cetak berhasil dikirim ke " + safeName(device));
            return;
        }
        if (bleOnly || inScan || type == BluetoothDevice.DEVICE_TYPE_DUAL || type == BluetoothDevice.DEVICE_TYPE_UNKNOWN) {
            String err = printBle(device, bytes);
            if (err == null) {
                notifyPage(true, "Cetak berhasil dikirim ke " + safeName(device));
                return;
            }
            notifyPage(false, err);
            return;
        }
        notifyPage(false, "Gagal terhubung ke printer. Pastikan printer menyala dan tidak tersambung ke perangkat lain.");
    }

    private boolean printClassic(BluetoothDevice device, byte[] bytes) {
        for (int attempt = 0; attempt < 3; attempt++) {
            BluetoothSocket socket = null;
            try {
                if (attempt == 0) socket = device.createRfcommSocketToServiceRecord(SERIAL_PORT);
                else if (attempt == 1) socket = device.createInsecureRfcommSocketToServiceRecord(SERIAL_PORT);
                else {
                    Method m = device.getClass().getMethod("createRfcommSocket", int.class);
                    socket = (BluetoothSocket) m.invoke(device, 1);
                }
                socket.connect();
                OutputStream output = socket.getOutputStream();
                output.write(bytes);
                output.flush();
                Thread.sleep(300);
                return true;
            } catch (Exception ignored) {
            } finally {
                if (socket != null) {
                    try { socket.close(); } catch (Exception ignored) { }
                }
            }
        }
        return false;
    }

    /** Kirim byte ke karakteristik tulis printer BLE. Null bila berhasil, selain itu pesan error. */
    private String printBle(BluetoothDevice device, byte[] bytes) {
        final BluetoothGattCharacteristic[] target = new BluetoothGattCharacteristic[1];
        final CountDownLatch ready = new CountDownLatch(1);
        final Object writeLock = new Object();
        final boolean[] writeDone = new boolean[1];
        final int[] mtu = new int[]{23};

        BluetoothGattCallback cb = new BluetoothGattCallback() {
            @Override
            public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
                try {
                    if (newState == BluetoothProfile.STATE_CONNECTED) {
                        if (!gatt.requestMtu(185)) gatt.discoverServices();
                    } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                        ready.countDown();
                        synchronized (writeLock) { writeDone[0] = true; writeLock.notifyAll(); }
                    }
                } catch (SecurityException ignored) { ready.countDown(); }
            }

            @Override
            public void onMtuChanged(BluetoothGatt gatt, int value, int status) {
                if (status == BluetoothGatt.GATT_SUCCESS) mtu[0] = value;
                try { gatt.discoverServices(); } catch (SecurityException ignored) { ready.countDown(); }
            }

            @Override
            public void onServicesDiscovered(BluetoothGatt gatt, int status) {
                BluetoothGattCharacteristic fallback = null;
                for (BluetoothGattService s : gatt.getServices()) {
                    for (BluetoothGattCharacteristic c : s.getCharacteristics()) {
                        int p = c.getProperties();
                        boolean noResp = (p & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0;
                        boolean resp = (p & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0;
                        if (noResp && target[0] == null) target[0] = c;
                        if (resp && fallback == null) fallback = c;
                    }
                }
                if (target[0] == null) target[0] = fallback;
                ready.countDown();
            }

            @Override
            public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic c, int status) {
                synchronized (writeLock) { writeDone[0] = true; writeLock.notifyAll(); }
            }
        };

        BluetoothGatt gatt = null;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                gatt = device.connectGatt(activity, false, cb, BluetoothDevice.TRANSPORT_LE);
            else gatt = device.connectGatt(activity, false, cb);
            if (!ready.await(12, TimeUnit.SECONDS) || target[0] == null) {
                return "Printer BLE tidak merespons. Nyalakan printer, dekatkan tablet, lalu coba lagi.";
            }
            BluetoothGattCharacteristic ch = target[0];
            boolean noResp = (ch.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0;
            ch.setWriteType(noResp ? BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
                    : BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
            int chunk = Math.max(20, Math.min(180, mtu[0] - 3));
            for (int i = 0; i < bytes.length; i += chunk) {
                byte[] part = java.util.Arrays.copyOfRange(bytes, i, Math.min(bytes.length, i + chunk));
                boolean sent = false;
                for (int retry = 0; retry < 5 && !sent; retry++) {
                    synchronized (writeLock) { writeDone[0] = false; }
                    ch.setValue(part);
                    sent = gatt.writeCharacteristic(ch);
                    if (!sent) Thread.sleep(40);
                }
                if (!sent) return "Pengiriman ke printer BLE terputus. Coba cetak lagi.";
                synchronized (writeLock) {
                    if (!writeDone[0]) writeLock.wait(noResp ? 200 : 2000);
                }
                Thread.sleep(noResp ? 20 : 5);
            }
            Thread.sleep(500);
            return null;
        } catch (SecurityException e) {
            return "Izin Bluetooth belum diberikan";
        } catch (Exception e) {
            return "Gagal mencetak ke printer BLE. Pastikan printer menyala dan tidak tersambung ke perangkat lain.";
        } finally {
            if (gatt != null) {
                try { gatt.disconnect(); gatt.close(); } catch (Exception ignored) { }
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

    private void notifyScan(String error) {
        String detail = error == null ? "{ok:true}" : "{ok:false,message:" + JSONObject.quote(error) + "}";
        String script = "window.dispatchEvent(new CustomEvent('billing-android-printers',{detail:" + detail + "}));";
        activity.runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }

    private void notifyPage(boolean ok, String message) {
        String quoted = JSONObject.quote(message);
        String script = "window.dispatchEvent(new CustomEvent('billing-android-print',{detail:{ok:"
                + ok + ",message:" + quoted + "}}));";
        activity.runOnUiThread(() -> webView.evaluateJavascript(script, null));
    }
}
