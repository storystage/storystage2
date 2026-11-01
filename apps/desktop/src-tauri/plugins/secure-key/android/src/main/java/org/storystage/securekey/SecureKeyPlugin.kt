package org.storystage.securekey

import android.app.Activity
import android.app.AlertDialog
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.text.InputType
import android.widget.EditText
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

private const val KEYSTORE = "AndroidKeyStore"
private const val ALIAS = "StoryStage2.anthropic-api-key"
private const val TRANSFORMATION = "AES/GCM/NoPadding"
private const val IV_BYTES = 12
private const val TAG_BITS = 128

@InvokeArg
class SaveArgs {
    lateinit var text: String
}

/**
 * The Claude key on Android (spec 05 sections 1.2, 2.1). The file is in `noBackupFilesDir`, so
 * it never goes into a cloud backup, and it's useless without the Keystore key, which can't
 * leave the device. If the Keystore refuses, the error reaches the native layer, and the
 * Prompter stays off: there's no fallback.
 */
@TauriPlugin
class SecureKeyPlugin(private val activity: Activity) : Plugin(activity) {
    private val file: File
        get() = File(activity.noBackupFilesDir, "anthropic-api-key.bin")

    private fun secretKey(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getKey(ALIAS, null) as SecretKey?)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return generator.generateKey()
    }

    private fun reply(invoke: Invoke, text: String?) {
        val answer = JSObject()
        answer.put("text", text ?: JSONObject.NULL)
        invoke.resolve(answer)
    }

    @Command
    fun ask(invoke: Invoke) {
        activity.runOnUiThread {
            val field =
                EditText(activity).apply {
                    inputType =
                        InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                }
            AlertDialog.Builder(activity)
                .setTitle("Add your Claude key")
                .setMessage(
                    "Paste the key from the Claude Console. " +
                        "It goes straight to this device's secure store.",
                )
                .setView(field)
                .setPositiveButton("Add") { _, _ ->
                    val text = field.text.toString()
                    field.text.clear()
                    reply(invoke, text)
                }
                .setNegativeButton("Cancel") { _, _ -> reply(invoke, null) }
                .setOnCancelListener { reply(invoke, null) }
                .show()
        }
    }

    @Command
    fun load(invoke: Invoke) {
        if (!file.exists()) return reply(invoke, null)
        try {
            val bytes = file.readBytes()
            val cipher = Cipher.getInstance(TRANSFORMATION)
            val iv = GCMParameterSpec(TAG_BITS, bytes, 0, IV_BYTES)
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), iv)
            val plain = cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES)
            val text = String(plain, Charsets.UTF_8)
            plain.fill(0)
            reply(invoke, text)
        } catch (error: Exception) {
            invoke.reject("The key couldn't be read.")
        }
    }

    @Command
    fun save(invoke: Invoke) {
        try {
            val text = invoke.parseArgs(SaveArgs::class.java).text
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, secretKey())
            val sealed = cipher.doFinal(text.toByteArray(Charsets.UTF_8))
            file.writeBytes(cipher.iv + sealed)
            invoke.resolve()
        } catch (error: Exception) {
            invoke.reject("The key couldn't be stored.")
        }
    }

    @Command
    fun delete(invoke: Invoke) {
        file.delete()
        invoke.resolve()
    }
}
