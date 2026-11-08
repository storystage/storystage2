package org.storystage.managedconfig

import android.app.Activity
import android.content.Context
import android.content.RestrictionsManager
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/**
 * Hands the native layer whatever the school pushed. Every value becomes a string, so
 * `storystage-policy` checks it exactly as it checks a line in the policy file (spec 05
 * section 3.5). `getApplicationRestrictions` returns only what was pushed, never the defaults.
 */
@TauriPlugin
class ManagedConfigPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun read(invoke: Invoke) {
        val manager =
            activity.getSystemService(Context.RESTRICTIONS_SERVICE) as RestrictionsManager
        val pushed = manager.applicationRestrictions
        val values = JSObject()
        for (key in pushed.keySet()) {
            @Suppress("DEPRECATION")
            values.put(key, pushed.get(key).toString())
        }
        val reply = JSObject()
        reply.put("values", values)
        invoke.resolve(reply)
    }
}
