package expo.modules.singbox

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.Bundle

class SingBoxPermissionActivity : Activity() {
    private var configPath: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configPath = intent.getStringExtra(SingBoxBridge.EXTRA_CONFIG_PATH)
        if (configPath.isNullOrBlank()) {
            SingBoxBridge.emitStatus(this, "failed", "Berkas konfigurasi privat tidak ditemukan.")
            finish()
            return
        }
        val consentIntent = VpnService.prepare(this)
        if (consentIntent == null) {
            startVpnService()
        } else {
            @Suppress("DEPRECATION")
            startActivityForResult(consentIntent, REQUEST_VPN_PERMISSION)
        }
    }

    @Deprecated("Android VPN consent activity returns through the legacy activity result contract")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_VPN_PERMISSION) return
        if (resultCode == Activity.RESULT_OK) {
            startVpnService()
        } else {
            configPath?.let { java.io.File(it).delete() }
            SingBoxBridge.emitStatus(this, "disconnected", "Izin VPN tidak diberikan; tunnel tidak dimulai.")
            finish()
        }
    }

    private fun startVpnService() {
        val path = configPath ?: run {
            SingBoxBridge.emitStatus(this, "failed", "Berkas konfigurasi privat tidak ditemukan.")
            finish()
            return
        }
        val serviceIntent = Intent(this, SingBoxVpnService::class.java)
            .setAction(SingBoxBridge.ACTION_START)
            .putExtra(SingBoxBridge.EXTRA_CONFIG_PATH, path)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent)
            } else {
                startService(serviceIntent)
            }
        } catch (error: Exception) {
            java.io.File(path).delete()
            SingBoxBridge.emitStatus(this, "failed", error.message ?: "Android menolak memulai service VPN.")
        } finally {
            finish()
        }
    }

    companion object {
        private const val REQUEST_VPN_PERMISSION = 7024
    }
}
