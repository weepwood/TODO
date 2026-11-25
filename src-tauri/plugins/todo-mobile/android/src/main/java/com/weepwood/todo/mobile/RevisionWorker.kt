package com.weepwood.todo.mobile

import android.content.Context
import android.net.Uri
import android.util.Base64
import androidx.work.*
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

private const val PERIODIC = "todo-revision-periodic-v1"
private const val ONCE = "todo-revision-once-v1"
internal val UID = Regex("^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$")
internal val HOST = Regex("^https://[a-z0-9]+\\.supabase\\.co$")
internal fun validPublicKey(s: String) = s.startsWith("sb_publishable_") && s.length in 20..500
internal fun verifiedAccess(session: JSONObject, scope: String, url: String): String? {
    val token = session.optString("access_token")
    if (!UID.matches(scope) || !HOST.matches(url) || token.length !in 20..16384) return null
    if (session.optJSONObject("user")?.optString("id") != scope) return null
    val parts = token.split(".")
    if (parts.size != 3) return null
    val claims = try { JSONObject(String(Base64.decode(parts[1],Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING),Charsets.UTF_8)) }
        catch (_: Exception) { return null }
    if (claims.optString("sub") != scope || claims.optString("iss") != "$url/auth/v1" ||
        claims.optLong("exp",0) <= System.currentTimeMillis()/1000 + 30) return null
    // These claims only constrain token routing; Supabase authenticates the JWT.
    return token
}
internal object RevisionJobs {
    private fun constraints() = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
    fun schedule(context: Context) {
        val work = PeriodicWorkRequest.Builder(RevisionWorker::class.java,15,TimeUnit.MINUTES)
            .setConstraints(constraints()).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC,ExistingPeriodicWorkPolicy.KEEP,work)
    }
    fun wake(context: Context) {
        val work = OneTimeWorkRequest.Builder(RevisionWorker::class.java).setConstraints(constraints()).build()
        WorkManager.getInstance(context).enqueueUniqueWork(ONCE,ExistingWorkPolicy.KEEP,work)
    }
    fun cancel(context: Context) {
        val manager = WorkManager.getInstance(context)
        manager.cancelUniqueWork(PERIODIC); manager.cancelUniqueWork(ONCE)
    }
}
/** Background check only: no database writes, refresh-token rotation or cloud mutations.
 * The foreground engine remains the sole workspace writer and revalidates CAS. */
class RevisionWorker(context: Context, params: WorkerParameters): Worker(context,params) {
    override fun doWork(): Result {
        val vault = Vault(applicationContext)
        val configRaw = try { vault.read(CONFIG) } catch (_: Exception) { return Result.success() } ?: return Result.success()
        val config = try { JSONObject(configRaw) } catch (_: Exception) { return Result.success() }
        val scope = config.optString("scope"); val url = config.optString("url"); val key = config.optString("key")
        if (!UID.matches(scope) || !HOST.matches(url) || !validPublicKey(key)) return Result.success()
        val sessionRaw = try { vault.read(SESSION) } catch (_: Exception) { null }
        fun record(state: String, revision: Long? = null) {
            synchronized(MobileLock) {
                // Account changes / sign-out / updated intent invalidate stale results.
                if (vault.read(CONFIG) != configRaw || vault.read(SESSION) != sessionRaw || isStopped) return
                vault.write(STATUS, JSONObject().put("scope",scope).put("state",state)
                    .put("checkedAt",System.currentTimeMillis()).put("revision",revision ?: JSONObject.NULL).toString())
            }
        }
        val token = try { sessionRaw?.let { verifiedAccess(JSONObject(it),scope,url) } } catch (_: Exception) { null }
        if (token == null) { try { record("needs-login") } catch (_: Exception) {}; return Result.success() }
        var conn: HttpURLConnection? = null
        return try {
            if (isStopped || vault.read(CONFIG) != configRaw || vault.read(SESSION) != sessionRaw) return Result.success()
            val endpoint = Uri.parse("$url/rest/v1/todo_workspaces").buildUpon()
                .appendQueryParameter("select","revision").appendQueryParameter("user_id","eq.$scope").build()
            val http = URL(endpoint.toString()).openConnection() as HttpURLConnection
            conn = http
            http.instanceFollowRedirects = false; http.requestMethod = "GET"
            http.connectTimeout = 10000; http.readTimeout = 10000
            http.setRequestProperty("apikey",key); http.setRequestProperty("Authorization","Bearer $token")
            http.setRequestProperty("Accept","application/json")
            when (val status = http.responseCode) {
                200 -> {
                    val bytes = http.inputStream.use { stream ->
                        val output = java.io.ByteArrayOutputStream()
                        val buffer = ByteArray(4096)
                        while (true) {
                            val n = stream.read(buffer); if (n < 0) break
                            check(output.size()+n<=16384); output.write(buffer,0,n)
                        }
                        output.toByteArray()
                    }
                    val rows = JSONArray(String(bytes,Charsets.UTF_8))
                    check(rows.length()<=1)
                    val revision = if(rows.length()==1) rows.getJSONObject(0).getLong("revision").also { check(it in 1..9007199254740991L) } else null
                    val baseline = if(config.isNull("revision")) null else config.getLong("revision")
                    val dirty = config.optBoolean("dirty")
                    record(when {
                        revision != baseline && dirty -> "reconcile"
                        revision != baseline -> "remote-changed"
                        dirty -> "pending-upload"
                        else -> "unchanged"
                    }, revision)
                    Result.success()
                }
                401,403 -> { record("needs-login"); Result.success() }
                408,429,500,502,503,504 -> { record("offline"); if(runAttemptCount<3) Result.retry() else Result.success() }
                else -> { record("unavailable"); Result.success() }
            }
        } catch (_: Exception) {
            try { record("offline") } catch (_: Exception) {}
            if(runAttemptCount<3) Result.retry() else Result.success()
        } finally { conn?.disconnect() }
    }
}
