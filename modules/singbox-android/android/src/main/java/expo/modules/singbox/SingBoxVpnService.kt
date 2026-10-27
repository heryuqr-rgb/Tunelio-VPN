package expo.modules.singbox

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.VpnService
import android.os.Build
import android.os.IBinder
import android.os.ParcelFileDescriptor
import android.util.Log
import io.nekohasekai.libbox.CommandClient
import io.nekohasekai.libbox.CommandClientHandler
import io.nekohasekai.libbox.CommandClientOptions
import io.nekohasekai.libbox.CommandServer
import io.nekohasekai.libbox.CommandServerHandler
import io.nekohasekai.libbox.ConnectionEvents
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.LogIterator
import io.nekohasekai.libbox.OutboundGroupItemIterator
import io.nekohasekai.libbox.OutboundGroupIterator
import io.nekohasekai.libbox.OverrideOptions
import io.nekohasekai.libbox.SetupOptions
import io.nekohasekai.libbox.StatusMessage
import io.nekohasekai.libbox.StringIterator
import java.io.File
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

class SingBoxVpnService : VpnService(), CommandServerHandler {
    @Volatile private var commandServer: CommandServer? = null
    @Volatile private var commandClient: CommandClient? = null
    @Volatile private var platform: SingBoxPlatform? = null
    @Volatile private var tunnelDescriptor: ParcelFileDescriptor? = null
    @Volatile private var tunnelEstablished = false
    @Volatile private var sessionStartedAt = 0L
    private val stopping = AtomicBoolean(false)
    private var worker: Thread? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startAsForeground("Menyiapkan koneksi sing-box…")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == SingBoxBridge.ACTION_STOP) {
            stopCore("VPN diputuskan oleh pengguna.", true)
            return START_NOT_STICKY
        }
        if (intent?.action != SingBoxBridge.ACTION_START) {
            SingBoxBridge.emitStatus(this, "failed", "Service hanya dapat dimulai dari alur izin aplikasi.")
            stopSelf(startId)
            return START_NOT_STICKY
        }
        if (worker?.isAlive == true) return START_NOT_STICKY
        val configPath = intent.getStringExtra(SingBoxBridge.EXTRA_CONFIG_PATH)
        if (configPath.isNullOrBlank()) {
            failAndStop("Lokasi konfigurasi privat tidak tersedia.", startId)
            return START_NOT_STICKY
        }
        stopping.set(false)
        tunnelEstablished = false
        SingBoxBridge.emitStatus(this, "connecting", "Memulai VPNService dan memvalidasi inbound TUN.")
        worker = Thread({ startCore(configPath, startId) }, "tunelio-singbox-start").apply { start() }
        return START_NOT_STICKY
    }

    private fun startCore(configPath: String, startId: Int) {
        val configFile = File(configPath)
        try {
            check(configFile.isFile) { "Berkas konfigurasi privat tidak ditemukan." }
            val config = configFile.readText(Charsets.UTF_8)
            SingBoxBridge.validateTunnelConfig(config)
            setupLibboxOnce()

            val platformBridge = SingBoxPlatform(this)
            platform = platformBridge
            val server = CommandServer(this, platformBridge)
            commandServer = server
            server.start()
            server.startOrReloadService(config, OverrideOptions())
            check(tunnelEstablished && tunnelDescriptor != null) {
                "Core tidak membuka interface TUN; pastikan inbound `type: tun` dan `auto_route: true`."
            }
            configFile.delete()
            sessionStartedAt = System.currentTimeMillis()
            SingBoxBridge.emitStatus(this, "connected", "Tunnel TUN sing-box aktif.", sessionStartedAt)
            updateNotification("Tunnel aktif · sing-box")
            startStatusClient()
            SingBoxBridge.emitLog(this, 1, "CommandServer started; Android TUN descriptor established.")
        } catch (error: Exception) {
            Log.e(TAG, "Gagal memulai sing-box", error)
            configFile.delete()
            stopCore(error.message ?: "Core sing-box gagal memulai tunnel.", false)
            SingBoxBridge.emitStatus(this, "failed", error.message ?: "Core sing-box gagal memulai tunnel.")
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf(startId)
        }
    }

    private fun setupLibboxOnce() {
        synchronized(SETUP_LOCK) {
            if (libboxReady) return
            Libbox.setLocale(Locale.getDefault().toLanguageTag())
            val baseDirectory = filesDir
            val workingDirectory = File(noBackupFilesDir, "sing-box-work").apply { mkdirs() }
            val temporaryDirectory = File(cacheDir, "sing-box-temp").apply { mkdirs() }
            val setup = SetupOptions().apply {
                basePath = baseDirectory.absolutePath
                workingPath = workingDirectory.absolutePath
                tempPath = temporaryDirectory.absolutePath
                fixAndroidStack = true
                logMaxLines = 400
                debug = false
                crashReportSource = "Tunelio"
                appVersion = "1"
                appMarketingVersion = "1.0.0"
                oomKillerEnabled = false
                oomKillerDisabled = true
                oomMemoryLimit = 0L
                powerReportEnabled = false
                platformMetadata = "{\"os\":\"Android ${Build.VERSION.RELEASE}\",\"manufacturer\":\"${Build.MANUFACTURER}\",\"model\":\"${Build.MODEL}\"}"
            }
            Libbox.setup(setup)
            libboxReady = true
        }
    }

    private fun startStatusClient() {
        val options = CommandClientOptions().apply {
            addCommand(Libbox.CommandStatus)
            addCommand(Libbox.CommandLog)
            statusInterval = 1000L
        }
        val client = CommandClient(object : CommandClientHandler {
            override fun connected() {
                SingBoxBridge.emitLog(this@SingBoxVpnService, 1, "Statistik dan log libbox tersambung.")
            }
            override fun disconnected(message: String?) {
                if (!stopping.get() && message != null) SingBoxBridge.emitLog(this@SingBoxVpnService, 2, "Stream diagnostik berhenti: $message")
            }
            override fun setDefaultLogLevel(level: Int) = Unit
            override fun clearLogs() = Unit
            override fun writeLogs(messageList: LogIterator) {
                var emitted = 0
                while (messageList.hasNext() && emitted < 8) {
                    val entry = messageList.next() ?: break
                    SingBoxBridge.emitLog(this@SingBoxVpnService, entry.level, entry.message ?: "")
                    emitted++
                }
            }
            override fun writeStatus(message: StatusMessage?) {
                if (message == null) return
                SingBoxBridge.emitTraffic(this@SingBoxVpnService, message.uplinkTotal, message.downlinkTotal, message.trafficAvailable)
            }
            override fun writeGroups(message: OutboundGroupIterator?) = Unit
            override fun writeOutbounds(message: OutboundGroupItemIterator?) = Unit
            override fun initializeClashMode(modeList: StringIterator?, currentMode: String?) = Unit
            override fun updateClashMode(newMode: String?) = Unit
            override fun writeConnectionEvents(events: ConnectionEvents?) = Unit
        }, options)
        commandClient = client
        Thread({
            try {
                client.connect()
            } catch (error: Exception) {
                if (!stopping.get()) Log.w(TAG, "CommandClient berakhir", error)
            }
        }, "tunelio-singbox-status").apply { isDaemon = true; start() }
    }

    internal fun setTunnelDescriptor(descriptor: ParcelFileDescriptor) {
        synchronized(this) {
            if (stopping.get()) {
                descriptor.close()
                error("Service VPN sedang berhenti.")
            }
            tunnelDescriptor?.let { previous -> runCatching { previous.close() } }
            tunnelDescriptor = descriptor
            tunnelEstablished = true
        }
    }

    override fun serviceStop() {
        stopCore("Core sing-box menghentikan service.", true)
    }

    override fun serviceReload() {
        SingBoxBridge.emitLog(this, 2, "Reload diminta; mulai ulang dengan profil melalui aplikasi.")
    }

    override fun getSystemProxyStatus() = io.nekohasekai.libbox.SystemProxyStatus().apply {
        available = false
        enabled = false
    }

    override fun setSystemProxyEnabled(isEnabled: Boolean) = Unit
    override fun triggerNativeCrash() = Unit
    override fun writeDebugMessage(message: String?) {
        if (message != null) Log.d(TAG, message)
    }
    override fun connectSSHAgent(): Int = -1

    override fun onRevoke() {
        stopCore("Android mencabut izin VPN; tunnel ditutup.", true)
        super.onRevoke()
    }

    override fun onDestroy() {
        stopCore("Service VPN dihentikan.", true)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = super.onBind(intent)

    private fun failAndStop(message: String, startId: Int) {
        SingBoxBridge.emitStatus(this, "failed", message)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf(startId)
    }

    private fun stopCore(message: String, stopSelfAfter: Boolean) {
        if (!stopping.compareAndSet(false, true)) return
        runCatching { commandClient?.disconnect() }
        commandClient = null
        commandServer?.let { server ->
            runCatching { server.closeService() }
            runCatching { server.close() }
        }
        commandServer = null
        platform?.close()
        platform = null
        synchronized(this) {
            runCatching { tunnelDescriptor?.close() }
            tunnelDescriptor = null
            tunnelEstablished = false
        }
        File(noBackupFilesDir, "tunelio-singbox.json").delete()
        runCatching { stopForeground(STOP_FOREGROUND_REMOVE) }
        SingBoxBridge.emitTraffic(this, 0L, 0L, false)
        SingBoxBridge.emitStatus(this, "disconnected", message)
        if (stopSelfAfter) stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Tunelio VPN", NotificationManager.IMPORTANCE_LOW))
        }
    }

    private fun startAsForeground(text: String) {
        val notification = buildNotification(text)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun updateNotification(text: String) {
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification(text))
    }

    private fun buildNotification(text: String): Notification {
        val openApp = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = openApp?.let {
            PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID) else Notification.Builder(this)
        return builder
            .setSmallIcon(R.drawable.ic_stat_tunelio)
            .setContentTitle("Tunelio VPN")
            .setContentText(text)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(pendingIntent)
            .build()
    }

    companion object {
        private const val TAG = "TunelioSingBox"
        private const val CHANNEL_ID = "tunelio.vpn.tunnel"
        private const val NOTIFICATION_ID = 14024
        private val SETUP_LOCK = Any()
        @Volatile private var libboxReady = false
    }
}
