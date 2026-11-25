package com.weepwood.todo.mobile

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import app.tauri.annotation.InvokeArg
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

@InvokeArg
class UpdateArgs {
    lateinit var version: String
    var versionCode: Long = 0
    lateinit var url: String
    lateinit var sha256: String
    var size: Long = 0
    lateinit var certificate: String
}
internal object ApkUpdates {
    private const val PACKAGE = "com.weepwood.todo"
    private const val MAX = 200L * 1024 * 1024
    private val hex = Regex("^[a-f0-9]{64}$")
    private val versionPattern = Regex("^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?$")
    private val cancel = AtomicBoolean(false)
    private val busy = AtomicBoolean(false)
    @Volatile private var state = "idle"
    @Volatile private var received = 0L
    @Volatile private var total = 0L
    @Volatile private var message = ""
    @Volatile private var candidate: UpdateArgs? = null
    @Volatile private var confirmation: Intent? = null
    @Volatile private var sessionId = -1
    private fun file(context: Context) = File(context.cacheDir,"todo-update.apk")
    private fun partial(context: Context) = File(context.cacheDir,"todo-update.part")
    private fun supported(context: Context) = context.packageName == PACKAGE &&
        (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) == 0 &&
        Build.SUPPORTED_ABIS.contains("arm64-v8a")
    private fun allowed(args: UpdateArgs) =
        args.version.length <= 80 && versionPattern.matches(args.version) &&
        args.versionCode in 1..2100000000L && args.size in 1..MAX &&
        hex.matches(args.sha256) && hex.matches(args.certificate) &&
        args.url == "https://github.com/weepwood/TODO/releases/download/v${args.version}/TODO_${args.version}_arm64.apk"
    private fun flags() = if(Build.VERSION.SDK_INT>=28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
    @Suppress("DEPRECATION")
    private fun code(info: PackageInfo): Long = if(Build.VERSION.SDK_INT>=28) info.longVersionCode else info.versionCode.toLong()
    @Suppress("DEPRECATION")
    private fun signers(info: PackageInfo): Set<String> {
        val signatures = if(Build.VERSION.SDK_INT>=28) info.signingInfo?.apkContentsSigners else info.signatures
        return signatures.orEmpty().map { digest(it.toByteArray()) }.toSet()
    }
    private fun digest(data: ByteArray) = MessageDigest.getInstance("SHA-256").digest(data).joinToString(""){"%02x".format(it)}
    private fun fileDigest(file: File): String {
        val hash=MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input -> val buf=ByteArray(65536);while(true){val n=input.read(buf);if(n<0)break;hash.update(buf,0,n)} }
        return hash.digest().joinToString(""){"%02x".format(it)}
    }
    @Suppress("DEPRECATION")
    private fun verify(context: Context,args: UpdateArgs,apk: File) {
        require(supported(context)&&allowed(args)&&apk.length()==args.size&&fileDigest(apk)==args.sha256)
        val pm=context.packageManager
        val installed=pm.getPackageInfo(PACKAGE,flags())
        val archive=requireNotNull(pm.getPackageArchiveInfo(apk.absolutePath,flags()))
        require(archive.packageName==PACKAGE&&archive.versionName==args.version&&code(archive)==args.versionCode&&code(archive)>code(installed))
        require((installed.versionName?.contains("-")==true)==args.version.contains("-"))
        require(archive.applicationInfo?.let{(it.flags and ApplicationInfo.FLAG_DEBUGGABLE)==0}==true)
        // Android verifies APK signatures again when committing the install session.
        val certs=signers(installed)
        require(certs==setOf(args.certificate)&&signers(archive)==certs)
    }
    private fun connection(start: String): HttpURLConnection {
        var url=URL(start)
        repeat(6) {
            require(url.protocol=="https"&&url.userInfo==null&&url.port in listOf(-1,443)&&
                url.host in setOf("github.com","release-assets.githubusercontent.com","objects.githubusercontent.com"))
            val conn=url.openConnection() as HttpURLConnection
            conn.instanceFollowRedirects=false;conn.connectTimeout=15000;conn.readTimeout=30000
            conn.requestMethod="GET";conn.setRequestProperty("Accept","application/octet-stream")
            val status=conn.responseCode
            if(status==200)return conn
            val location=conn.getHeaderField("Location");conn.disconnect()
            require(status in setOf(301,302,303,307,308)&&location!=null)
            url=URL(url,location)
        }
        error("更新资源跳转过多")
    }
    fun prepare(context: Context,args: UpdateArgs) {
        require(supported(context)&&allowed(args))
        check(state !in setOf("installing","confirmation"))
        check(busy.compareAndSet(false,true))
        candidate=null;confirmation=null;cancel.set(false);received=0;total=args.size;message="";state="downloading"
        Thread {
            var conn:HttpURLConnection?=null
            try {
                partial(context).delete();file(context).delete()
                val http=connection(args.url);conn=http
                http.inputStream.use { input -> partial(context).outputStream().use { output ->
                    val buf=ByteArray(65536)
                    while(true){if(cancel.get())throw InterruptedException();val n=input.read(buf);if(n<0)break
                        received+=n;check(received<=args.size&&received<=MAX);output.write(buf,0,n)}
                }}
                check(!cancel.get());verify(context,args,partial(context))
                check(partial(context).renameTo(file(context)));candidate=args;state="ready"
            }catch(_:Exception){partial(context).delete();file(context).delete();state=if(cancel.get())"cancelled" else "failed";message=if(cancel.get())"下载已取消" else "下载或签名、版本、校验和验证失败"}
            finally{conn?.disconnect();busy.set(false)}
        }.start()
    }
    fun cancelDownload(){check(state=="downloading");cancel.set(true)}
    fun status(): Map<String,Any> = mapOf("state" to state,"received" to received,"total" to total,"message" to message)
    fun install(activity: Activity): Map<String,Any> {
        require(supported(activity)&&state=="ready"&&!busy.get())
        val args=requireNotNull(candidate)
        if(!activity.packageManager.canRequestPackageInstalls()){
            activity.runOnUiThread { activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+activity.packageName))) }
            return mapOf("state" to "permission","message" to "允许此来源后返回应用重试安装")
        }
        check(busy.compareAndSet(false,true));state="installing";message="";confirmation=null
        val context=activity.applicationContext
        Thread {
            var id=-1
            try{
                verify(context,args,file(context))
                val installer=context.packageManager.packageInstaller
                val params=PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
                params.setAppPackageName(PACKAGE);params.setSize(args.size)
                if(Build.VERSION.SDK_INT>=31)params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED)
                id=installer.createSession(params);sessionId=id
                installer.openSession(id).use{session ->
                    session.openWrite("base.apk",0,args.size).use{stream -> file(context).inputStream().use{it.copyTo(stream)};session.fsync(stream)}
                    val intent=Intent(context,UpdateResultReceiver::class.java).setAction("com.weepwood.todo.UPDATE_RESULT").putExtra("todoSession",id)
                    val pending=PendingIntent.getBroadcast(context,id,intent,PendingIntent.FLAG_UPDATE_CURRENT or (if(Build.VERSION.SDK_INT>=31)PendingIntent.FLAG_MUTABLE else 0))
                    session.commit(pending.intentSender)
                }
            }catch(_:Exception){if(id>=0)try{context.packageManager.packageInstaller.abandonSession(id)}catch(_:Exception){};sessionId=-1;state="failed";message="系统安装请求失败，可重新下载"}
            finally{busy.set(false)}
        }.start()
        return status()
    }
    fun confirm(activity: Activity){
        check(state=="confirmation")
        val intent=requireNotNull(confirmation)
        activity.runOnUiThread{try{activity.startActivity(intent)}catch(_:Exception){state="failed";message="无法打开系统安装确认"}}
    }
    @Suppress("DEPRECATION")
    fun result(context: Context,intent: Intent){
        if(intent.action!="com.weepwood.todo.UPDATE_RESULT"||intent.getIntExtra("todoSession",-2)!=sessionId)return
        when(intent.getIntExtra(PackageInstaller.EXTRA_STATUS,PackageInstaller.STATUS_FAILURE)){
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {confirmation=intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT);state=if(confirmation!=null)"confirmation" else "failed";message="请通过应用打开系统安装确认"}
            PackageInstaller.STATUS_SUCCESS -> {file(context).delete();candidate=null;confirmation=null;sessionId=-1;state="installed";message="安装成功"}
            else -> {confirmation=null;sessionId=-1;state="ready";message="安装未完成，可重试"}
        }
    }
}
class UpdateResultReceiver: BroadcastReceiver(){
    override fun onReceive(context: Context,intent: Intent){ApkUpdates.result(context,intent)}
}
