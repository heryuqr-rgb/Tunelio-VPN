package expo.modules.singbox

import android.content.Context
import android.content.Intent
import org.json.JSONObject

internal object SingBoxBridge {
    const val ACTION_STATUS = "expo.modules.singbox.STATUS"
    const val ACTION_TRAFFIC = "expo.modules.singbox.TRAFFIC"
    const val ACTION_LOG = "expo.modules.singbox.LOG"
    const val ACTION_START = "expo.modules.singbox.START"
    const val ACTION_STOP = "expo.modules.singbox.STOP"
    const val EXTRA_CONFIG_PATH = "configPath"
    const val EXTRA_STATE = "state"
    const val EXTRA_MESSAGE = "message"
    const val EXTRA_UPLINK = "uplinkBytes"
    const val EXTRA_DOWNLINK = "downlinkBytes"
    const val EXTRA_TRAFFIC_AVAILABLE = "trafficAvailable"
    const val EXTRA_LEVEL = "level"

    private const val PREFS = "tunelio.singbox.runtime"
    private const val KEY_STATE = "state"
    private const val KEY_MESSAGE = "message"
    private const val KEY_STARTED_AT = "startedAt"
    private const val KEY_UPLINK = "uplinkBytes"
    private const val KEY_DOWNLINK = "downlinkBytes"
    private const val KEY_TRAFFIC_AVAILABLE = "trafficAvailable"

    fun emitStatus(context: Context, state: String, message: String = "", startedAt: Long? = null) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val started = startedAt ?: if (state == "connected") System.currentTimeMillis() else 0L
        prefs.edit()
            .putString(KEY_STATE, state)
            .putString(KEY_MESSAGE, redact(message))
            .putLong(KEY_STARTED_AT, started)
            .apply()
        context.sendBroadcast(
            Intent(ACTION_STATUS)
                .setPackage(context.packageName)
                .putExtra(EXTRA_STATE, state)
                .putExtra(EXTRA_MESSAGE, redact(message))
                .putExtra(KEY_STARTED_AT, started),
        )
    }

    fun emitTraffic(context: Context, uplink: Long, downlink: Long, available: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putLong(KEY_UPLINK, uplink.coerceAtLeast(0L))
            .putLong(KEY_DOWNLINK, downlink.coerceAtLeast(0L))
            .putBoolean(KEY_TRAFFIC_AVAILABLE, available)
            .apply()
        context.sendBroadcast(
            Intent(ACTION_TRAFFIC)
                .setPackage(context.packageName)
                .putExtra(EXTRA_UPLINK, uplink.coerceAtLeast(0L))
                .putExtra(EXTRA_DOWNLINK, downlink.coerceAtLeast(0L))
                .putExtra(EXTRA_TRAFFIC_AVAILABLE, available),
        )
    }

    fun emitLog(context: Context, level: Int, message: String) {
        context.sendBroadcast(
            Intent(ACTION_LOG)
                .setPackage(context.packageName)
                .putExtra(EXTRA_LEVEL, level)
                .putExtra(EXTRA_MESSAGE, redact(message).take(320)),
        )
    }

    fun snapshot(context: Context): Map<String, Any> {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return mapOf(
            "status" to (prefs.getString(KEY_STATE, "disconnected") ?: "disconnected"),
            "message" to (prefs.getString(KEY_MESSAGE, "") ?: ""),
            "startedAt" to prefs.getLong(KEY_STARTED_AT, 0L),
            "uplinkBytes" to prefs.getLong(KEY_UPLINK, 0L),
            "downlinkBytes" to prefs.getLong(KEY_DOWNLINK, 0L),
            "trafficAvailable" to prefs.getBoolean(KEY_TRAFFIC_AVAILABLE, false),
        )
    }

    fun validateTunnelConfig(raw: String) {
        val root = JSONObject(raw)
        val outbounds = root.optJSONArray("outbounds")
        require(outbounds != null && outbounds.length() > 0) {
            "Konfigurasi harus berisi array outbounds sing-box."
        }
        val inbounds = root.optJSONArray("inbounds")
        require(inbounds != null) {
            "Tambahkan inbound TUN Android pada konfigurasi sing-box."
        }
        val hasTun = (0 until inbounds.length()).any { index ->
            val inbound = inbounds.optJSONObject(index) ?: return@any false
            inbound.optString("type") == "tun" && inbound.optBoolean("auto_route", false)
        }
        require(hasTun) {
            "Diperlukan inbound type=tun dengan auto_route=true agar trafik perangkat masuk ke tunnel."
        }
    }

    private fun redact(message: String): String {
        if (message.isBlank()) return message
        val keyedCredential = Regex("(?i)([\\\"]?(?:password|passwd|uuid|token|secret|private[_-]?key|authorization|bearer)[\\\"]?\\s*[=:]\\s*)(?:\\\"(?:\\\\.|[^\\\"])*\\\"|'(?:\\\\.|[^'])*'|[^,;\\s}]+)")
        val uriUserInfo = Regex("(?i)([a-z][a-z0-9+.-]*://)[^/@\\s]+@")
        val bearerToken = Regex("(?i)(\\bBearer\\s+)[A-Za-z0-9._~+/-]+=*")
        val keyed = keyedCredential.replace(message) { match -> "${match.groupValues[1]}••••" }
        val uri = uriUserInfo.replace(keyed) { match -> "${match.groupValues[1]}••••@" }
        return bearerToken.replace(uri) { match -> "${match.groupValues[1]}••••" }
    }
}
