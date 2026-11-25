package com.weepwood.todo.mobile

import android.app.Activity
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.Plugin
import org.json.JSONObject

@InvokeArg
class SessionArgs { lateinit var key: String; var value: String? = null }
@InvokeArg
class RevisionArgs {
    lateinit var scope: String; lateinit var url: String; lateinit var key: String
    var revision: Long? = null; var dirty: Boolean = false
}
@TauriPlugin
class TodoMobilePlugin(private val activity: Activity): Plugin(activity) {
    private val context = activity.applicationContext
    private val vault = Vault(context)
    private var view: WebView? = null
    private var back: OnBackPressedCallback? = null
    private fun run(invoke: Invoke, action: ()->Unit) {
        try { action() } catch (_: Exception) {
            // Do not leak plaintext session, token, or native exception details.
            invoke.reject("Android 安全存储或后台任务不可用")
        }
    }
    private fun clearRevision() {
        synchronized(MobileLock) { vault.remove(CONFIG); vault.remove(STATUS) }
        RevisionJobs.cancel(context)
    }
    @Command fun sessionRead(invoke: Invoke) = run(invoke) {
        val args=invoke.parseArgs(SessionArgs::class.java); require(args.key in SESSION_KEYS)
        invoke.resolveObject(mapOf("value" to vault.read(args.key)))
    }
    @Command fun sessionWrite(invoke: Invoke) = run(invoke) {
        val args=invoke.parseArgs(SessionArgs::class.java); require(args.key in SESSION_KEYS)
        val value=requireNotNull(args.value)
        if(args.key==SESSION) synchronized(MobileLock) {
            val prior=vault.read(SESSION)?.let { JSONObject(it).optJSONObject("user")?.optString("id") }
            val next=JSONObject(value).optJSONObject("user")?.optString("id")
            if(prior!=next) clearRevision()
            vault.write(args.key,value)
        } else vault.write(args.key,value)
        invoke.resolve()
    }
    @Command fun sessionRemove(invoke: Invoke) = run(invoke) {
        val args=invoke.parseArgs(SessionArgs::class.java); require(args.key in SESSION_KEYS)
        if(args.key==SESSION) synchronized(MobileLock) { vault.remove(args.key); clearRevision() }
        else vault.remove(args.key)
        invoke.resolve()
    }
    @Command fun revisionConfigure(invoke: Invoke) = run(invoke) {
        val args=invoke.parseArgs(RevisionArgs::class.java)
        require(UID.matches(args.scope)&&HOST.matches(args.url)&&validPublicKey(args.key))
        require(args.revision==null||args.revision!! in 1..9007199254740991L)
        synchronized(MobileLock) {
            val session=JSONObject(requireNotNull(vault.read(SESSION)))
            require(verifiedAccess(session,args.scope,args.url)!=null)
            val next=JSONObject().put("scope",args.scope).put("url",args.url).put("key",args.key)
                .put("revision",args.revision ?: JSONObject.NULL).put("dirty",args.dirty).toString()
            if(vault.read(CONFIG)!=next) { vault.write(CONFIG,next); vault.remove(STATUS) }
        }
        RevisionJobs.schedule(context); invoke.resolve()
    }
    @Command fun revisionStatus(invoke: Invoke) = run(invoke) {
        val raw=vault.read(STATUS); val data=raw?.let { JSONObject(it) }
        invoke.resolveObject(mapOf("state" to (data?.optString("state") ?: "waiting"),
            "scope" to data?.optString("scope"),"checkedAt" to data?.optLong("checkedAt")))
    }
    @Command fun revisionCancel(invoke: Invoke) = run(invoke) { clearRevision(); invoke.resolve() }

    @Command fun updatePrepare(invoke: Invoke) = run(invoke) {
        ApkUpdates.prepare(context,invoke.parseArgs(UpdateArgs::class.java));invoke.resolve()
    }
    @Command fun updateStatus(invoke: Invoke) = run(invoke) { invoke.resolveObject(ApkUpdates.status()) }
    @Command fun updateInstall(invoke: Invoke) = run(invoke) { invoke.resolveObject(ApkUpdates.install(activity)) }
    @Command fun updateConfirm(invoke: Invoke) = run(invoke) { ApkUpdates.confirm(activity);invoke.resolve() }
    @Command fun updateCancel(invoke: Invoke) = run(invoke) { ApkUpdates.cancelDownload();invoke.resolve() }

    override fun load(webView: WebView) {
        super.load(webView); view=webView
        val host=activity as? AppCompatActivity ?: return
        back?.remove()
        val callback=object: OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("typeof window.__todoAndroidBack === 'function' && window.__todoAndroidBack()", { handled ->
                    if(handled!="true") { isEnabled=false; try { host.onBackPressedDispatcher.onBackPressed() } finally { isEnabled=true } }
                })
            }
        }
        back=callback
        host.onBackPressedDispatcher.addCallback(host,callback)
    }
    override fun onPause(activity: AppCompatActivity) {
        super.onPause(activity)
        view?.post { view?.evaluateJavascript("window.dispatchEvent(new Event('todo-native-pause'))",null) }
        try { if(vault.read(CONFIG)!=null) RevisionJobs.wake(context) } catch (_: Exception) {}
    }
    override fun onResume(activity: AppCompatActivity) {
        super.onResume(activity)
        view?.post { view?.evaluateJavascript("window.dispatchEvent(new Event('todo-native-resume'))",null) }
    }
    override fun onDestroy(activity: AppCompatActivity) {
        back?.remove(); back=null; view=null; super.onDestroy(activity)
    }
}
