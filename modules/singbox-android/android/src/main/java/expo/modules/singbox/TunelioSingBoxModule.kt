package expo.modules.singbox

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class TunelioSingBoxModule : Module() {
    private var receiver: BroadcastReceiver? = null

    override fun definition() = ModuleDefinition {
        Name("TunelioSingBox")
        Events("onVpnStatus", "onVpnTraffic", "onVpnLog")

        OnCreate {
            val context = appContext.reactContext
            if (context != null) {
                val eventReceiver = object : BroadcastReceiver() {
                    override fun onReceive(context: Context, intent: Intent) {
                        when (intent.action) {
                            SingBoxBridge.ACTION_STATUS -> sendEvent(
                                "onVpnStatus",
                                mapOf(
                                    "status" to (intent.getStringExtra(SingBoxBridge.EXTRA_STATE) ?: "disconnected"),
                                    "message" to (intent.getStringExtra(SingBoxBridge.EXTRA_MESSAGE) ?: ""),
                                    "startedAt" to intent.getLongExtra("startedAt", 0L),
                                    "uplinkBytes" to context.getSharedPreferences("tunelio.singbox.runtime", Context.MODE_PRIVATE).getLong("uplinkBytes", 0L),
                                    "downlinkBytes" to context.getSharedPreferences("tunelio.singbox.runtime", Context.MODE_PRIVATE).getLong("downlinkBytes", 0L),
                                    "trafficAvailable" to context.getSharedPreferences("tunelio.singbox.runtime", Context.MODE_PRIVATE).getBoolean("trafficAvailable", false),
                                ),
                            )
                            SingBoxBridge.ACTION_TRAFFIC -> sendEvent(
                                "onVpnTraffic",
                                mapOf(
                                    "uplinkBytes" to intent.getLongExtra(SingBoxBridge.EXTRA_UPLINK, 0L),
                                    "downlinkBytes" to intent.getLongExtra(SingBoxBridge.EXTRA_DOWNLINK, 0L),
                                    "trafficAvailable" to intent.getBooleanExtra(SingBoxBridge.EXTRA_TRAFFIC_AVAILABLE, false),
                                ),
                            )
                            SingBoxBridge.ACTION_LOG -> sendEvent(
                                "onVpnLog",
                                mapOf(
                                    "level" to intent.getIntExtra(SingBoxBridge.EXTRA_LEVEL, 0),
                                    "message" to (intent.getStringExtra(SingBoxBridge.EXTRA_MESSAGE) ?: ""),
                                ),
                            )
                        }
                    }
                }
                val filter = IntentFilter().apply {
                    addAction(SingBoxBridge.ACTION_STATUS)
                    addAction(SingBoxBridge.ACTION_TRAFFIC)
                    addAction(SingBoxBridge.ACTION_LOG)
                }
                if (Build.VERSION.SDK_INT >= 33) {
                    context.registerReceiver(eventReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
                } else {
                    @Suppress("DEPRECATION")
                    context.registerReceiver(eventReceiver, filter)
                }
                receiver = eventReceiver
            }
        }

        OnDestroy {
            val context = appContext.reactContext
            val activeReceiver = receiver
            if (context != null && activeReceiver != null) {
                runCatching { context.unregisterReceiver(activeReceiver) }
            }
            receiver = null
        }

        AsyncFunction("connect") { configJson: String ->
            val context = appContext.reactContext ?: throw IllegalStateException("React context Android belum tersedia.")
            require(configJson.length <= 2_000_000) { "File konfigurasi lebih besar dari batas 2 MB." }
            SingBoxBridge.validateTunnelConfig(configJson)
            val configFile = File(context.noBackupFilesDir, "tunelio-singbox.json")
            val pendingFile = File(context.noBackupFilesDir, "tunelio-singbox.json.pending")
            pendingFile.writeText(configJson, Charsets.UTF_8)
            check(pendingFile.renameTo(configFile)) { "Konfigurasi lokal tidak dapat disimpan." }
            SingBoxBridge.emitStatus(context, "awaiting_permission", "Menunggu persetujuan VPN Android.")
            val permissionActivity = Intent(context, SingBoxPermissionActivity::class.java)
                .putExtra(SingBoxBridge.EXTRA_CONFIG_PATH, configFile.absolutePath)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(permissionActivity)
            mapOf("status" to "awaiting_permission")
        }

        AsyncFunction("disconnect") {
            val context = appContext.reactContext ?: throw IllegalStateException("React context Android belum tersedia.")
            context.stopService(Intent(context, SingBoxVpnService::class.java))
            SingBoxBridge.emitStatus(context, "disconnected", "VPN diputuskan oleh pengguna.")
        }

        Function("getSnapshot") {
            val context = appContext.reactContext ?: throw IllegalStateException("React context Android belum tersedia.")
            SingBoxBridge.snapshot(context)
        }
    }
}
