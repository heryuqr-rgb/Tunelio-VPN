package expo.modules.singbox

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.IBinder
import android.os.ParcelFileDescriptor
import android.util.Log
import org.json.JSONObject
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
import io.nekohasekai.libbox.SystemProxyStatus
import java.io.File
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

class SingBoxVpnService : VpnService(), CommandServerHandler {
    @Volatile private var commandServer: CommandServer? = null
    @Volatile private var commandClient: CommandClient? = null
    @Volatile private var platform: SingBoxPlatform? = null
    @Volatile private var tunnelDescriptor: ParcelFileDescriptor? = null
    @Volatile private var tunnelEstablished = false
    @Volatile private var sessionStartedAt = 0L
    private val stopping = AtomicBoolean(false)
    private val sessionGeneration = AtomicLong(0L)
    private val lifecycleLock = Any()
    private var worker: Future<*>? = null
    @Volatile private var activeConfigPath: String? = null
    @Volatile private var lastCacheFilePath: String? = null

    override fun onCreate() {
        super.onCreate()
        tunnelServiceAlive = true
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
        val configPath = intent.getStringExtra(SingBoxBridge.EXTRA_CONFIG_PATH)
        if (worker?.isDone == false) {
            configPath?.let { File(it).delete() }
            Log.w(TAG, "Permintaan start diabaikan karena startup VPN masih berjalan.")
            return START_NOT_STICKY
        }
        if (configPath.isNullOrBlank()) {
            failAndStop("Lokasi konfigurasi privat tidak tersedia.", startId)
            return START_NOT_STICKY
        }
        val generation = synchronized(lifecycleLock) {
            tunnelConnected = false
            stopping.set(false)
            sessionGeneration.incrementAndGet().also { activeConfigPath = configPath }
        }
        tunnelEstablished = false
        SingBoxBridge.emitStatus(this, "connecting", "Memulai VPNService dan memvalidasi inbound TUN.")
        worker = CORE_EXECUTOR.submit { startCore(configPath, startId, generation) }
        return START_NOT_STICKY
    }

    private fun startCore(configPath: String, startId: Int, generation: Long) {
        val configFile = File(configPath)
        var startingPlatform: SingBoxPlatform? = null
        var startingServer: CommandServer? = null
        try {
            check(configFile.isFile) { "Berkas konfigurasi privat tidak ditemukan." }
            val config = configFile.readText(Charsets.UTF_8)
            SingBoxBridge.validateTunnelConfig(config)
            if (!isCurrentSession(generation)) { configFile.delete(); clearActiveConfigPath(configPath); return }
            setupLibboxOnce()
            if (!isCurrentSession(generation)) { configFile.delete(); clearActiveConfigPath(configPath); return }
            preflightCacheStorage(config)

            val existingServer = commandServer
            val platformBridge = if (existingServer == null) {
                SingBoxPlatform(this)
            } else {
                platform ?: error("Platform VPN yang dipakai CommandServer aktif tidak tersedia untuk reload.")
            }
            startingPlatform = platformBridge
            val server = existingServer ?: CommandServer(this, platformBridge)
            startingServer = server
            if (existingServer == null) {
                platform = platformBridge
                commandServer = server
                server.start()
            } else {
                commandClient?.let { oldClient -> runCatching { oldClient.disconnect() } }
                commandClient = null
            }
            server.startOrReloadService(config, OverrideOptions())
            if (!isCurrentSession(generation)) {
                releaseCore(server, platformBridge)
                configFile.delete()
                clearActiveConfigPath(configPath)
                return
            }
            check(tunnelEstablished && tunnelDescriptor != null) {
                "Core tidak membuka interface TUN; pastikan inbound `type: tun` dan `auto_route: true`."
            }
            configFile.delete()
            clearActiveConfigPath(configPath)
            val committed = synchronized(lifecycleLock) {
                if (sessionGeneration.get() != generation || stopping.get()) false
                else {
                    sessionStartedAt = System.currentTimeMillis()
                    tunnelConnected = true
                    SingBoxBridge.emitStatus(this, "connected", "Tunnel TUN sing-box aktif.", sessionStartedAt)
                    true
                }
            }
            if (!committed) {
                releaseCore(server, platformBridge)
                return
            }
            updateNotification("Tunnel aktif · sing-box")
            startStatusClient()
            SingBoxBridge.emitLog(this, 1, "CommandServer started; Android TUN descriptor established.")
        } catch (error: Exception) {
            if (!isCurrentSession(generation)) {
                runCatching { commandClient?.disconnect() }
                commandClient = null
                releaseCore(startingServer, startingPlatform)
                configFile.delete()
                clearActiveConfigPath(configPath)
                return
            }
            val message = error.message ?: "Core sing-box gagal memulai tunnel."
            if (message.contains("initialize cache-file", ignoreCase = true) && message.contains("timeout", ignoreCase = true)) {
                val cacheFile = lastCacheFilePath?.let(::File)
                Log.e(
                    TAG,
                    "Cache-file bbolt lock timeout: path=${cacheFile?.absolutePath}, exists=${cacheFile?.exists()}, readable=${cacheFile?.canRead()}, writable=${cacheFile?.canWrite()}",
                    error,
                )
            } else {
                Log.e(TAG, "Gagal memulai sing-box", error)
            }
            synchronized(lifecycleLock) {
                if (sessionGeneration.get() == generation) {
                    stopping.set(true)
                    tunnelConnected = false
                }
            }
            runCatching { commandClient?.disconnect() }
            commandClient = null
            releaseCore(startingServer, startingPlatform)
            configFile.delete()
            clearActiveConfigPath(configPath)
            stopForeground(STOP_FOREGROUND_REMOVE)
            if (sessionGeneration.get() == generation) SingBoxBridge.emitStatus(this, "failed", message)
            stopSelf(startId)
        }
    }

    private fun isCurrentSession(generation: Long): Boolean = synchronized(lifecycleLock) {
        sessionGeneration.get() == generation && !stopping.get()
    }

    private fun setupLibboxOnce() {
        synchronized(SETUP_LOCK) {
            val baseDirectory = filesDir
            val workingDirectory = File(noBackupFilesDir, "sing-box-work")
            val temporaryDirectory = File(cacheDir, "sing-box-temp")
            ensureWritablePrivateDirectory("base", baseDirectory)
            ensureWritablePrivateDirectory("working", workingDirectory)
            ensureWritablePrivateDirectory("temporary", temporaryDirectory)
            if (libboxReady) return
            Libbox.setLocale(Locale.getDefault().toLanguageTag())
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

    private fun preflightCacheStorage(config: String) {
        val cacheOptions = JSONObject(config).optJSONObject("experimental")?.optJSONObject("cache_file")
        val configuredPath = cacheOptions?.optString("path")?.takeIf { it.isNotBlank() } ?: "cache.db"
        val configuredFile = File(configuredPath)
        val cacheBase = File(noBackupFilesDir, "sing-box-work")
        val cacheFile = (if (configuredFile.isAbsolute) configuredFile else File(cacheBase, configuredPath)).canonicalFile
        val cachePath = cacheFile.canonicalPath
        val privateRoots = listOf(filesDir, noBackupFilesDir, cacheDir).map { it.canonicalPath }
        check(privateRoots.any { root ->
            cachePath == root || cachePath.startsWith(root.trimEnd(File.separatorChar) + File.separator)
        }) {
            "Lokasi cache-file harus berada dalam penyimpanan privat aplikasi Android."
        }
        val parent = cacheFile.parentFile ?: error("Direktori induk cache-file tidak tersedia.")
        ensureWritablePrivateDirectory("cache-file", parent)
        if (cacheFile.exists()) {
            check(cacheFile.isFile && cacheFile.canRead() && cacheFile.canWrite()) {
                "Berkas cache-file tidak dapat dibaca atau ditulis oleh aplikasi Android."
            }
        }
        lastCacheFilePath = cachePath
        Log.i(
            TAG,
            "Cache-file preflight: path=$cachePath, exists=${cacheFile.exists()}, readable=${cacheFile.canRead()}, writable=${cacheFile.canWrite()}",
        )
    }

    private fun ensureWritablePrivateDirectory(label: String, directory: File) {
        if (!directory.isDirectory && !directory.mkdirs()) {
            error("Direktori privat $label tidak dapat dibuat.")
        }
        check(directory.isDirectory && directory.canRead() && directory.canWrite()) {
            "Direktori privat $label tidak dapat dibaca/ditulis."
        }
        val probe = File.createTempFile("tunelio-check-", ".tmp", directory)
        check(probe.delete()) { "File pemeriksaan direktori privat $label tidak dapat dihapus." }
    }

    private fun clearActiveConfigPath(configPath: String) {
        synchronized(lifecycleLock) {
            if (activeConfigPath == configPath) activeConfigPath = null
        }
    }

    private fun startStatusClient() {
        val options = CommandClientOptions().apply {
            addCommand(Libbox.CommandStatus)
            addCommand(Libbox.CommandLog)
            statusInterval = 1_000_000_000L
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
            override fun writeLogs(messageList: LogIterator?) {
                if (messageList == null) return
                var emitted = 0
                while (messageList.hasNext() && emitted < 8) {
                    val entry = messageList.next() ?: break
                    SingBoxBridge.emitLog(this@SingBoxVpnService, entry.level, entry.message)
                    emitted++
                }
            }
            override fun writeStatus(message: StatusMessage) {
                val upload = message.uplinkTotal.coerceAtLeast(0L)
                val download = message.downlinkTotal.coerceAtLeast(0L)
                SingBoxBridge.emitTraffic(this@SingBoxVpnService, upload, download, message.trafficAvailable)
                if (!stopping.get() && message.trafficAvailable) {
                    updateNotification("↑ ${formatTraffic(upload)}  ·  ↓ ${formatTraffic(download)}")
                }
            }
            override fun writeGroups(message: OutboundGroupIterator?) = Unit
            override fun writeOutbounds(message: OutboundGroupItemIterator?) = Unit
            override fun initializeClashMode(modeList: StringIterator, currentMode: String) = Unit
            override fun updateClashMode(newMode: String) = Unit
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

    override fun getSystemProxyStatus(): SystemProxyStatus = SystemProxyStatus().apply {
        available = false
        enabled = false
    }

    override fun setSystemProxyEnabled(isEnabled: Boolean) = Unit
    override fun triggerNativeCrash() = Unit
    override fun writeDebugMessage(message: String?) { if (message != null) Log.d(TAG, message) }
    override fun connectSSHAgent(): Int = -1

    override fun onRevoke() {
        stopCore("Android mencabut izin VPN; tunnel ditutup.", true)
        super.onRevoke()
    }

    override fun onDestroy() {
        tunnelServiceAlive = false
        tunnelConnected = false
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
        val stopRequest = synchronized(lifecycleLock) {
            if (!stopping.compareAndSet(false, true)) return
            tunnelConnected = false
            val stopGeneration = sessionGeneration.incrementAndGet()
            val configPath = activeConfigPath
            activeConfigPath = null
            stopGeneration to configPath
        }
        CORE_EXECUTOR.execute {
            runCatching { commandClient?.disconnect() }
            commandClient = null
            releaseCore(commandServer, platform)
            stopRequest.second?.let { File(it).delete() }
            synchronized(lifecycleLock) {
                if (sessionGeneration.get() == stopRequest.first) {
                    runCatching { stopForeground(STOP_FOREGROUND_REMOVE) }
                    SingBoxBridge.emitTraffic(this, 0L, 0L, false)
                    SingBoxBridge.emitStatus(this, "disconnected", message)
                    if (stopSelfAfter) stopSelf()
                }
            }
        }
    }

    private fun releaseCore(server: CommandServer?, platformBridge: SingBoxPlatform?) {
        server?.let {
            runCatching { it.closeService() }
            runCatching { it.close() }
        }
        runCatching { platformBridge?.close() }
        synchronized(this) {
            runCatching { tunnelDescriptor?.close() }
            tunnelDescriptor = null
            tunnelEstablished = false
            if (commandServer === server) commandServer = null
            if (platform === platformBridge) platform = null
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "CoreBox VPN", NotificationManager.IMPORTANCE_LOW))
        }
    }

    private fun startAsForeground(text: String) {
        val notification = buildNotification(text)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SYSTEM_EXEMPTED)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun updateNotification(text: String) {
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification(text))
    }

    private fun formatTraffic(bytes: Long): String {
        if (bytes < 1024L) return "$bytes B"
        val units = arrayOf("KB", "MB", "GB", "TB")
        var value = bytes.toDouble()
        var unit = -1
        do {
            value /= 1024.0
            unit++
        } while (value >= 1024.0 && unit < units.lastIndex)
        val formatted = if (value >= 100) "%.0f".format(Locale.US, value)
            else if (value >= 10) "%.1f".format(Locale.US, value)
            else "%.2f".format(Locale.US, value)
        return "$formatted ${units[unit]}"
    }

    private fun buildNotification(text: String): Notification {
        val openApp = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = openApp?.let {
            PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID) else Notification.Builder(this)
        return builder
            .setSmallIcon(R.drawable.ic_stat_tunelio)
            .setContentTitle("CoreBox VPN")
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
        private val CORE_EXECUTOR = Executors.newSingleThreadExecutor { task ->
            Thread(task, "tunelio-singbox-core").apply { isDaemon = true }
        }
        @Volatile private var libboxReady = false
        @Volatile internal var tunnelServiceAlive = false
            private set
        @Volatile internal var tunnelConnected = false
            private set
    }
}
