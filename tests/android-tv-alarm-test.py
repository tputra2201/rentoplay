"""JVM regression test of the actual bridge/receiver using small Android test doubles.

Run: nix shell nixpkgs#jdk --command python3 tests/android-tv-alarm-test.py
This does not replace an Android device or APK build test.
"""
import pathlib
import subprocess
import tempfile
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCES = {
    "android/content/SharedPreferences.java": '''package android.content;
public interface SharedPreferences {
 String getString(String k, String d); Editor edit();
 interface Editor { Editor putString(String k,String v); Editor remove(String k); boolean commit(); void apply(); }
}''',
    "android/content/Context.java": '''package android.content;
import java.util.*;
public class Context {
 public static final int MODE_PRIVATE=0;
 public static final String ALARM_SERVICE="alarm", POWER_SERVICE="power";
 public final android.app.AlarmManager alarms=new android.app.AlarmManager();
 public final Map<String,String> data=new HashMap<>(); public boolean save=true;
 public Context getApplicationContext(){return this;}
 public Object getSystemService(String k){return k.equals(ALARM_SERVICE)?alarms:new android.os.PowerManager();}
 public SharedPreferences getSharedPreferences(String n,int m){return new SharedPreferences(){
 public String getString(String k,String d){return data.getOrDefault(k,d);}
 public Editor edit(){return new Editor(){String key,value;boolean remove;
 public Editor putString(String k,String v){key=k;value=v;return this;}
 public Editor remove(String k){key=k;remove=true;return this;}
 public boolean commit(){if(!save)return false;if(remove)data.remove(key);else data.put(key,value);return true;}
 public void apply(){commit();}};}};
 }
}''',
    "android/content/Intent.java": '''package android.content;
import java.util.*;
public class Intent {
 public String action; public final Map<String,Object> extras=new HashMap<>();
 public Intent(Context c,Class<?> k){} public void setAction(String a){action=a;}
 public void putExtra(String k,String v){extras.put(k,v);} public void putExtra(String k,int v){extras.put(k,v);}
 public String getStringExtra(String k){return (String)extras.get(k);}
 public int getIntExtra(String k,int d){return (Integer)extras.getOrDefault(k,d);}
}''',
    "android/content/BroadcastReceiver.java": '''package android.content;
public abstract class BroadcastReceiver {
 public abstract void onReceive(Context c,Intent i);
 public PendingResult goAsync(){return new PendingResult();}
 public static class PendingResult {public void finish(){}}
}''',
    "android/app/PendingIntent.java": '''package android.app;
import android.content.*;
public class PendingIntent {
 public static final int FLAG_UPDATE_CURRENT=1,FLAG_IMMUTABLE=2;
 public final Intent intent; public PendingIntent(Intent i){intent=i;}
 public static PendingIntent getBroadcast(Context c,int r,Intent i,int f){
  int chars=0;for(Object v:i.extras.values())chars+=v.toString().length();
  if(chars*2>1000000)throw new IllegalArgumentException("Binder limit exceeded");
  return new PendingIntent(i);
 }
}''',
    "android/app/AlarmManager.java": '''package android.app;
import java.util.*;
public class AlarmManager {
 public static final int RTC_WAKEUP=0; public final List<PendingIntent> scheduled=new ArrayList<>();
 public boolean canScheduleExactAlarms(){return true;}
 public void cancel(PendingIntent p){scheduled.removeIf(x->x.intent.action.equals(p.intent.action));}
 public void setAndAllowWhileIdle(int t,long a,PendingIntent p){scheduled.add(p);}
 public void setExactAndAllowWhileIdle(int t,long a,PendingIntent p){scheduled.add(p);}
 public void setExact(int t,long a,PendingIntent p){scheduled.add(p);}
}''',
    "android/os/Build.java": '''package android.os; public class Build {public static class VERSION {public static int SDK_INT=35;}}''',
    "android/os/PowerManager.java": '''package android.os;
public class PowerManager {
 public static final int PARTIAL_WAKE_LOCK=1;
 public WakeLock newWakeLock(int f,String k){return new WakeLock();}
 public static class WakeLock {boolean held;public void acquire(long n){held=true;}public boolean isHeld(){return held;}public void release(){held=false;}}
}''',
    "android/util/Log.java": '''package android.util;
public class Log {public static int w(String t,String m){return 0;}public static int w(String t,String m,Throwable e){return 0;}public static int e(String t,String m,Throwable e){throw new AssertionError(m,e);}}''',
    "android/webkit/JavascriptInterface.java": '''package android.webkit; public @interface JavascriptInterface {}''',
    "app/lovable/cosmorentpro/TvAlarmRegression.java": '''package app.lovable.cosmorentpro;
import android.content.*;import org.json.*;import java.util.concurrent.*;import com.sun.net.httpserver.HttpServer;import java.net.*;import java.nio.charset.StandardCharsets;
public class TvAlarmRegression {
 static void check(boolean b,String m){if(!b)throw new AssertionError(m);}
 public static void main(String[] args)throws Exception {
  String logo="data:image/png;base64,"+"A".repeat(1800000);
  JSONObject cfg=new JSONObject().put("endMs",System.currentTimeMillis()+3600000).put("logo",logo).put("block",true);
  JSONArray stages=new JSONArray();for(int sec:new int[]{600,300,120,0})stages.put(new JSONObject().put("sec",sec).put("title","Title").put("message","Message"));cfg.put("stages",stages);
  Context c=new Context();TvBridge bridge=new TvBridge(c);bridge.scheduleJson("station:session","127.0.0.1",cfg.toString());
  check(c.alarms.scheduled.size()==4,"all 10/5/2/0 alarms must schedule with 1.8M-char logo");
  for(var alarm:c.alarms.scheduled){check(alarm.intent.getStringExtra("payload").length()<1000,"alarm payload must remain small");check(!new JSONObject(alarm.intent.getStringExtra("payload")).has("logo"),"no image in Binder");}
  var other=new JSONObject(cfg.toString()).put("logo","other-logo");bridge.scheduleJson("other:session","127.0.0.1",other.toString());
  var queue=new LinkedBlockingQueue<String>();HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",8765),0);
  server.createContext("/notify",e->{queue.add(new String(e.getRequestBody().readAllBytes(),StandardCharsets.UTF_8));e.sendResponseHeaders(200,0);e.close();});server.start();
  try {
   new TvAlarmReceiver().onReceive(c,c.alarms.scheduled.get(3).intent);
   String received=queue.poll(10,TimeUnit.SECONDS);check(received!=null,"time-up delivered");JSONObject doc=new JSONObject(received);
   check(doc.getBoolean("block"),"fullscreen preserved");check(doc.getString("logo").equals(logo),"full logo restored after delivery");
   new TvAlarmReceiver().onReceive(c,c.alarms.scheduled.get(7).intent);
   check(new JSONObject(queue.poll(10,TimeUnit.SECONDS)).getString("logo").equals("other-logo"),"stations isolated");
  }finally{server.stop(0);}
  bridge.cancel("station:session");check(c.alarms.scheduled.size()==4,"cancel only chosen station");check(!c.data.containsKey("logo:station:session"),"cancel cleans stored logo");
  Context failed=new Context();failed.save=false;new TvBridge(failed).scheduleJson("failed","127.0.0.1",cfg.toString());
  check(failed.alarms.scheduled.size()==4,"storage failure cannot block alerts");check(failed.alarms.scheduled.get(3).intent.getStringExtra("logoKey")==null,"failed storage has no stale image reference");
  System.out.println("PASS: large-logo scheduling, receiver restoration, fullscreen, station isolation, cleanup, storage-failure fallback");
 }
}''',
}

with tempfile.TemporaryDirectory(prefix="rentoplay-tv-test-") as temp:
    folder = pathlib.Path(temp)
    jar = folder / "json.jar"
    urllib.request.urlretrieve("https://repo.maven.apache.org/maven2/org/json/json/20240303/json-20240303.jar", jar)
    files = []
    for name, content in SOURCES.items():
        path = folder / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        files.append(str(path))
    actual = ROOT / "android-app/app/src/main/java/app/lovable/cosmorentpro"
    files += [str(actual / name) for name in ("TvBridge.java", "TvAlarmReceiver.java")]
    subprocess.run(["javac", "-cp", str(jar), "-d", str(folder / "classes"), *files], check=True)
    subprocess.run(["java", "-cp", f"{folder / 'classes'}:{jar}", "app.lovable.cosmorentpro.TvAlarmRegression"], check=True)