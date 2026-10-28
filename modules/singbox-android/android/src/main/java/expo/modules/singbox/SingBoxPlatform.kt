package expo.modules.singbox

import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.IpPrefix
import android.net.Network
import android.net.NetworkCapabilities
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.system.OsConstants
import io.nekohasekai.libbox.BridgeOptions
import io.nekohasekai.libbox.BridgeSession
import io.nekohasekai.libbox.ConnectionOwner
import io.nekohasekai.libbox.InterfaceUpdateListener
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.LocalDNSTransport
import io.nekohasekai.libbox.NeighborUpdateListener
import io.nekohasekai.libbox.NetworkInterface as LibboxNetworkInterface
import io.nekohasekai.libbox.NetworkInterfaceIterator
import io.nekohasekai.libbox.Notification as LibboxNotification
import io.nekohasekai.libbox.PlatformInterface
import io.nekohasekai.libbox.PlatformUser
import io.nekohasekai.libbox.ShellSession
import io.nekohasekai.libbox.StringIterator
import io.nekohasekai.libbox.TunOptions
import io.nekohasekai.libbox.WIFIState
import java.net.InetSocketAddress
import java.net.NetworkInterface as JavaNetworkInterface
import java.util.Collections

internal class SingBoxPlatform(private val vpnService: VpnService) : PlatformInterface {
    private val connectivity = vpnService.getSystemService(ConnectivityManager::class.java)
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var activeListener: InterfaceUpdateListener? = null

    override fun localDNSTransport(): LocalDNSTransport? = null

    override fun usePlatformAutoDetectInterfaceControl(): Boolean = true

    override fun autoDetectInterfaceControl(fd: Int) {
        check(vpnService.protect(fd)) { "Android gagal mengecualikan socket transport dari tunnel VPN." }
    }

    override fun openTun(options: TunOptions): Int {
        check(VpnService.prepare(vpnService) == null) { "Izin VPN Android belum diberikan." }
        val builder = vpnService.Builder()
            .setSession("Tunelio · sing-box")
            .setMtu(options.mtu)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) builder.setMetered(false)

        addAddresses(options.inet4Address, builder)
        addAddresses(options.inet6Address, builder)

        if (options.autoRoute) {
            if (options.dnsMode.value != Libbox.DNSModeDisabled) {
                val dnsServers = options.dnsServerAddress
                while (dnsServers.hasNext()) builder.addDnsServer(dnsServers.next())
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val ipv4Routes = options.inet4RouteAddress
                if (ipv4Routes.hasNext()) addRoutes(ipv4Routes, builder)
                else if (options.inet4Address.hasNext()) builder.addRoute("0.0.0.0", 0)

                val ipv6Routes = options.inet6RouteAddress
                if (ipv6Routes.hasNext()) addRoutes(ipv6Routes, builder)
                else if (options.inet6Address.hasNext()) builder.addRoute("::", 0)

                addExcludedRoutes(options.inet4RouteExcludeAddress, builder)
                addExcludedRoutes(options.inet6RouteExcludeAddress, builder)
            } else {
                addRoutes(options.inet4RouteRange, builder)
                addRoutes(options.inet6RouteRange, builder)
            }
            addApplications(options.includePackage, builder, allow = true)
            addApplications(options.excludePackage, builder, allow = false)
        }

        val descriptor = builder.establish()
            ?: error("Android tidak dapat membentuk TUN. Izin VPN mungkin dicabut atau konfigurasi alamat tidak valid.")
        (vpnService as? SingBoxVpnService)?.setTunnelDescriptor(descriptor)
            ?: run { descriptor.close(); error("Service VPN Tunelio tidak tersedia.") }
        return descriptor.fd
    }

    private fun addAddresses(iterator: io.nekohasekai.libbox.RoutePrefixIterator, builder: VpnService.Builder) {
        while (iterator.hasNext()) {
            val address = iterator.next()
            builder.addAddress(address.address(), address.prefix())
        }
    }

    private fun addRoutes(iterator: io.nekohasekai.libbox.RoutePrefixIterator, builder: VpnService.Builder) {
        while (iterator.hasNext()) {
            val route = iterator.next()
            builder.addRoute(route.address(), route.prefix())
        }
    }

    private fun addExcludedRoutes(iterator: io.nekohasekai.libbox.RoutePrefixIterator, builder: VpnService.Builder) {
        while (iterator.hasNext()) {
            val route = iterator.next()
            val prefix = IpPrefix(java.net.InetAddress.getByName(route.address()), route.prefix())
            builder.excludeRoute(prefix)
        }
    }

    private fun addApplications(iterator: StringIterator, builder: VpnService.Builder, allow: Boolean) {
        while (iterator.hasNext()) {
            val packageName = iterator.next()
            try {
                if (allow) builder.addAllowedApplication(packageName) else builder.addDisallowedApplication(packageName)
            } catch (error: PackageManager.NameNotFoundException) {
                throw IllegalArgumentException("Paket aplikasi tidak ditemukan untuk aturan TUN.", error)
            }
        }
    }

    override fun useProcFS(): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q

    override fun findConnectionOwner(
        ipProtocol: Int,
        sourceAddress: String,
        sourcePort: Int,
        destinationAddress: String,
        destinationPort: Int,
    ): ConnectionOwner {
        check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) { "Pencarian pemilik koneksi memerlukan Android 10 atau lebih baru." }
        val uid = connectivity.getConnectionOwnerUid(
            ipProtocol,
            InetSocketAddress(sourceAddress, sourcePort),
            InetSocketAddress(destinationAddress, destinationPort),
        )
        check(uid >= 0) { "Android tidak menemukan pemilik koneksi." }
        val packages = vpnService.packageManager.getPackagesForUid(uid)?.toList().orEmpty()
        return ConnectionOwner().apply {
            userId = uid
            userName = packages.firstOrNull() ?: ""
            setAndroidPackageNames(StringArray(packages))
        }
    }

    override fun startDefaultInterfaceMonitor(listener: InterfaceUpdateListener) {
        activeListener = listener
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N || networkCallback != null) return
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = notifyDefaultNetwork(network)
            override fun onLost(network: Network) = notifyDefaultNetwork(connectivity.activeNetwork)
            override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) = notifyDefaultNetwork(network)
        }
        networkCallback = callback
        connectivity.registerDefaultNetworkCallback(callback)
        notifyDefaultNetwork(connectivity.activeNetwork)
    }

    @Volatile private var lastPhysicalNetwork: Network? = null
    @Volatile private var lastPhysicalInterfaceName: String? = null
    private var lastNoPhysicalInterfaceLogAt = 0L
    private var lastSelectedInterfaceLog = ""

    private fun notifyDefaultNetwork(network: Network?) {
        val listener = activeListener ?: return
        val physicalNetwork = resolvePhysicalNetwork(network)
        val properties = physicalNetwork?.let { runCatching { connectivity.getLinkProperties(it) }.getOrNull() }
        var name = properties?.interfaceName.orEmpty()
        var interfaceIndex = if (name.isBlank()) 0 else runCatching { JavaNetworkInterface.getByName(name)?.index ?: 0 }.getOrDefault(0)
        var expensive = physicalNetwork?.let { current ->
            runCatching { connectivity.getNetworkCapabilities(current)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) == false }
                .getOrDefault(false)
        } ?: false

        if (name.isBlank() || interfaceIndex <= 0) {
            val fallback = availableInterfaces()
                .firstOrNull { it.name == lastPhysicalInterfaceName }
                ?: availableInterfaces().firstOrNull()
            if (fallback != null) {
                name = fallback.name
                interfaceIndex = fallback.index
                expensive = fallback.metered
            } else {
                // -1 is libbox's explicit "no default interface" value; index 0 leaves a stale default in place.
                listener.updateDefaultInterface("", -1, false, false)
                listener.updateNetworkPath("android:unavailable")
                logMissingPhysicalInterface()
                return
            }
        }

        lastPhysicalInterfaceName = name
        listener.updateDefaultInterface(name, interfaceIndex, expensive, false)
        listener.updateNetworkPath("android:$name")
        val shouldLog = synchronized(this) {
            if (lastSelectedInterfaceLog == name) false
            else {
                lastSelectedInterfaceLog = name
                true
            }
        }
        if (shouldLog) SingBoxBridge.emitLog(vpnService, 2, "Interface jaringan fisik Android: $name")
    }

    private fun resolvePhysicalNetwork(preferred: Network?): Network? {
        if (preferred != null && isPhysicalNetworkCandidate(preferred)) {
            lastPhysicalNetwork = preferred
            return preferred
        }
        lastPhysicalNetwork?.takeIf { isPhysicalNetworkCandidate(it) }?.let { return it }
        val candidates = runCatching { connectivity.allNetworks.toList() }
            .getOrDefault(emptyList())
            .filter { isPhysicalNetworkCandidate(it) }
        val selected = candidates.firstOrNull { candidate ->
            runCatching {
                connectivity.getNetworkCapabilities(candidate)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
            }.getOrDefault(false)
        } ?: candidates.firstOrNull()
        lastPhysicalNetwork = selected
        return selected
    }

    private fun availableInterfaces(): List<LibboxNetworkInterface> {
        val iterator = getInterfaces()
        val interfaces = mutableListOf<LibboxNetworkInterface>()
        while (iterator.hasNext()) interfaces += iterator.next()
        return interfaces
    }

    private fun logMissingPhysicalInterface() {
        val now = System.currentTimeMillis()
        val shouldLog = synchronized(this) {
            if (now - lastNoPhysicalInterfaceLogAt < 15_000L) false
            else {
                lastNoPhysicalInterfaceLogAt = now
                true
            }
        }
        if (shouldLog) {
            SingBoxBridge.emitLog(
                vpnService,
                3,
                "Android belum menemukan interface fisik Wi-Fi/seluler/Ethernet; interface VPN tidak dipakai sebagai jalur luar.",
            )
        }
    }

    private fun isPhysicalNetworkCandidate(network: Network): Boolean {
        val capabilities = runCatching { connectivity.getNetworkCapabilities(network) }.getOrNull() ?: return false
        if (!capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) ||
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
        ) return false
        return capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
    }

    override fun closeDefaultInterfaceMonitor(listener: InterfaceUpdateListener) {
        activeListener = null
        networkCallback?.let { runCatching { connectivity.unregisterNetworkCallback(it) } }
        networkCallback = null
    }

    override fun getInterfaces(): NetworkInterfaceIterator {
        val allInterfaces = runCatching { Collections.list(JavaNetworkInterface.getNetworkInterfaces()) }.getOrDefault(emptyList())
        val result = mutableListOf<LibboxNetworkInterface>()
        val networks = runCatching { connectivity.allNetworks.toList() }.getOrDefault(emptyList())
        val networkTypeByName = mutableMapOf<String, Int>()
        for (network in networks) {
            val properties = connectivity.getLinkProperties(network) ?: continue
            val capabilities = connectivity.getNetworkCapabilities(network) ?: continue
            if (!isPhysicalNetwork(capabilities)) continue
            val interfaceName = properties.interfaceName.orEmpty()
            if (interfaceName.isBlank()) continue
            networkTypeByName[interfaceName] = interfaceType(capabilities)
            val javaInterface = allInterfaces.firstOrNull { it.name == interfaceName } ?: continue
            if (!isUsableInterface(javaInterface)) continue
            result += makeInterface(
                javaInterface,
                interfaceType(capabilities),
                properties.dnsServers.mapNotNull { it.hostAddress },
                properties.routes
                    .filter { it.destination.prefixLength == 0 }
                    .mapNotNull { it.gateway?.hostAddress }
                    .filter { it != "0.0.0.0" && it != "::" },
                !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED),
            )
        }

        if (result.isEmpty()) {
            val vpnNames = networks.filter { network ->
                runCatching { connectivity.getNetworkCapabilities(network)?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true }
                    .getOrDefault(false)
            }.mapNotNull { network -> runCatching { connectivity.getLinkProperties(network)?.interfaceName }.getOrNull() }.toSet()
            val fallbackInterfaces = allInterfaces.filter { javaInterface ->
                isUsableInterface(javaInterface) && javaInterface.name !in vpnNames && !isLikelyTunnelInterface(javaInterface.name)
            }.sortedBy { if (it.name == lastPhysicalInterfaceName) 0 else 1 }
            for (javaInterface in fallbackInterfaces) {
                val type = networkTypeByName[javaInterface.name] ?: interfaceTypeFromName(javaInterface.name)
                result += makeInterface(javaInterface, type, emptyList(), emptyList(), type == Libbox.InterfaceTypeCellular)
            }
            if (result.isNotEmpty()) {
                SingBoxBridge.emitLog(
                    vpnService,
                    2,
                    "ConnectivityManager tidak memetakan jaringan fisik; memakai interface Android aktif: ${result.joinToString { it.name }}",
                )
            }
        }
        return InterfaceArray(result.iterator())
    }

    private fun isPhysicalNetwork(capabilities: NetworkCapabilities): Boolean {
        if (!capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) ||
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
        ) return false
        return capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
    }

    private fun isUsableInterface(networkInterface: JavaNetworkInterface): Boolean = runCatching {
        networkInterface.index > 0 && networkInterface.isUp && !networkInterface.isLoopback
    }.getOrDefault(false)

    private fun isLikelyTunnelInterface(name: String): Boolean =
        name.startsWith("tun", ignoreCase = true) ||
            name.startsWith("wg", ignoreCase = true) ||
            name.startsWith("utun", ignoreCase = true) ||
            name.startsWith("ipsec", ignoreCase = true) ||
            name.startsWith("dummy", ignoreCase = true)

    private fun interfaceType(capabilities: NetworkCapabilities): Int = when {
        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> Libbox.InterfaceTypeWIFI
        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> Libbox.InterfaceTypeCellular
        capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> Libbox.InterfaceTypeEthernet
        else -> Libbox.InterfaceTypeOther
    }

    private fun interfaceTypeFromName(name: String): Int = when {
        name.startsWith("wlan", ignoreCase = true) || name.startsWith("wifi", ignoreCase = true) -> Libbox.InterfaceTypeWIFI
        name.startsWith("rmnet", ignoreCase = true) ||
            name.startsWith("ccmni", ignoreCase = true) ||
            name.startsWith("pdp", ignoreCase = true) ||
            name.startsWith("wwan", ignoreCase = true) -> Libbox.InterfaceTypeCellular
        name.startsWith("eth", ignoreCase = true) -> Libbox.InterfaceTypeEthernet
        else -> Libbox.InterfaceTypeOther
    }

    private fun makeInterface(
        javaInterface: JavaNetworkInterface,
        type: Int,
        dnsServers: List<String>,
        gateways: List<String>,
        metered: Boolean,
    ): LibboxNetworkInterface = LibboxNetworkInterface().apply {
        name = javaInterface.name
        index = javaInterface.index
        mtu = runCatching { javaInterface.mtu }.getOrDefault(1500)
        addresses = StringArray(javaInterface.interfaceAddresses.mapNotNull { address ->
            address.address.hostAddress?.substringBefore('%')?.let { hostAddress ->
                "$hostAddress/${address.networkPrefixLength}"
            }
        })
        dnsServer = StringArray(dnsServers)
        gateway = StringArray(gateways)
        this.type = type
        var interfaceFlags = 0
        if (javaInterface.isUp) interfaceFlags = interfaceFlags or OsConstants.IFF_UP or OsConstants.IFF_RUNNING
        if (javaInterface.isLoopback) interfaceFlags = interfaceFlags or OsConstants.IFF_LOOPBACK
        if (javaInterface.isPointToPoint) interfaceFlags = interfaceFlags or OsConstants.IFF_POINTOPOINT
        if (javaInterface.supportsMulticast()) interfaceFlags = interfaceFlags or OsConstants.IFF_MULTICAST
        flags = interfaceFlags
        this.metered = metered
    }

    override fun underNetworkExtension(): Boolean = false
    override fun includeAllNetworks(): Boolean = false
    override fun readWIFIState(): WIFIState? = null
    override fun clearDNSCache() = Unit
    override fun sendNotification(notification: LibboxNotification) = Unit
    override fun cancelNotification(identifier: String, typeID: Int) = Unit
    override fun startNeighborMonitor(listener: NeighborUpdateListener?) = Unit
    override fun closeNeighborMonitor(listener: NeighborUpdateListener?) = Unit
    override fun registerMyInterface(name: String?) = Unit
    override fun usePlatformShell(): Boolean = false
    override fun checkPlatformShell() = error("Shell native tidak didukung oleh aplikasi VPN.")
    override fun openShellSession(user: PlatformUser?, command: String?, environ: StringIterator?, term: String?, rows: Int, cols: Int): ShellSession =
        error("Shell native tidak didukung oleh aplikasi VPN.")
    override fun lookupUser(username: String?): PlatformUser = error("Pencarian user OS tidak didukung.")
    override fun lookupSFTPServer(): String = error("SFTP tidak didukung oleh aplikasi VPN.")
    override fun readSystemSSHHostKey(): String = error("SSH tidak didukung oleh aplikasi VPN.")
    override fun tailscaleHostname(): String = "${Build.MANUFACTURER} ${Build.MODEL}"
    override fun usePlatformBridge(): Boolean = false
    override fun createBridge(options: BridgeOptions?): BridgeSession = error("Bridge native tidak didukung.")

    fun close() {
        networkCallback?.let { runCatching { connectivity.unregisterNetworkCallback(it) } }
        networkCallback = null
        activeListener = null
    }
}

internal class StringArray(private val values: List<String>) : StringIterator {
    private var index = 0
    override fun len(): Int = values.size
    override fun hasNext(): Boolean = index < values.size
    override fun next(): String = values[index++]
}

private class InterfaceArray(private val iterator: Iterator<LibboxNetworkInterface>) : NetworkInterfaceIterator {
    override fun hasNext(): Boolean = iterator.hasNext()
    override fun next(): LibboxNetworkInterface = iterator.next()
}
