package com.weepwood.todo.mobile

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal const val SESSION = "todo-android-auth-v1"
internal const val CONFIG = "revision-intent"
internal const val STATUS = "revision-status"
internal val SESSION_KEYS = setOf(SESSION, SESSION + "-code-verifier", SESSION + "-user")
internal object MobileLock
private const val ALIAS = "todo.mobile.vault.v1"
private const val MAX_BYTES = 262144

/** Only ciphertext is persisted. Files are excluded from Android Auto Backup. */
internal class Vault(private val context: Context) {
    private val allowed = SESSION_KEYS + setOf(CONFIG, STATUS)
    private fun file(name: String): AtomicFile {
        require(name in allowed)
        val dir = File(context.noBackupFilesDir, "todo-mobile-v1")
        check(dir.isDirectory || dir.mkdirs())
        return AtomicFile(File(dir, name))
    }
    private fun key(create: Boolean): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = ks.getKey(ALIAS, null)
        if (existing is SecretKey) return existing
        check(create && !ks.containsAlias(ALIAS))
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).setRandomizedEncryptionRequired(true).build())
        }.generateKey()
    }
    private fun aad(name: String) = (context.packageName + ":" + name + ":1").toByteArray(Charsets.UTF_8)
    fun read(name: String): String? = synchronized(MobileLock) {
        val raw = try { file(name).readFully() } catch (_: java.io.FileNotFoundException) { return@synchronized null }
        check(raw.size in 29..(MAX_BYTES + 29) && raw[0] == 1.toByte())
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(false), GCMParameterSpec(128, raw.copyOfRange(1,13)))
        cipher.updateAAD(aad(name))
        String(cipher.doFinal(raw.copyOfRange(13,raw.size)), Charsets.UTF_8)
    }
    fun write(name: String, value: String) = synchronized(MobileLock) {
        val bytes = value.toByteArray(Charsets.UTF_8)
        require(bytes.size <= MAX_BYTES)
        val target = file(name)
        // A missing key for an existing file must not silently destroy the old value.
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key(!target.baseFile.exists()))
        cipher.updateAAD(aad(name))
        check(cipher.iv.size == 12)
        val encrypted = byteArrayOf(1) + cipher.iv + cipher.doFinal(bytes)
        val stream = target.startWrite()
        try { stream.write(encrypted); target.finishWrite(stream) }
        catch (e: Exception) { target.failWrite(stream); throw e }
    }
    fun remove(name: String) = synchronized(MobileLock) { file(name).delete() }
}
