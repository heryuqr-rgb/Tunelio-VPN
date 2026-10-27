package expo.modules.singbox

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
import io.nekohasekai.libbox.Notification
import io.nekohasekai.libbox.PlatformInterface
import io.nekohasekai.libbox.PlatformUser
import io.nekohasekai.libbox.ShellSession
import io.nekohasekai.libbox.StringIterator
import io.nekohasekai.libbox.TunOptions
import io.nekohasekai.libbox.WIFIState
import java.io.File
import java.net.Inet6Address
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
        check(vpnService.protect(fd)) { "Android gagal mengecualikan socket core dari tunnel VPN." }
    }
    override fun useProcFS(): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q

    override fun openTun(options: TunOptions): Int {
        val builder = vpnService.Builder()
            .setSession("Tunelio · sing-box")
            .setMtu(options.mtu)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) builder.setMetered(false)

        addPrefixes(options.inet4Address, builder, isAddress = true)
        addPrefixes(options.inet6Address, builder, isAddress = true)

        if (options.autoRoute) {
            if (options.dnsMode.value != Libbox.DNSModeDisabled) {
                val dnsServers = options.dnsServerAddress
                while (dnsServers.hasNext()) builder.addDnsServer(dnsServers.next())
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val ipv4Routes = options.inet4RouteAddress
                val hasIpv4Routes = ipv4Routes.hasNext()
                addPrefixes(ipv4Routes, builder, isAddress = false)
                if (!hasIpv4Routes && options.inet4Address.hasNext()) builder.addRoute("0.0.0.0", 0)

                val ipv6Routes = options.inet6RouteAddress
                val hasIpv6Routes = ipv6Routes.hasNext()
                addPrefixes(ipv6Routes, builder, isAddress = false)
                if (!hasIpv6Routes && options.inet6Address.hasNext()) builder.addRoute("::", 0)

                addExcludedPrefixes(options.inet4RouteExcludeAddress, builder)
                addExcludedPrefixes(options.inet6RouteExcludeAddress, builder)
            } else {
                addPrefixes(options.inet4RouteRange, builder, isAddress = false)
                addPrefixes(options.inet6RouteRange, builder, isAddress = false)
            }

            val included = options.includePackage
            while (included.hasNext()) builder.addAllowedApplication(included.next())
            val excluded = options.excludePackage
            while (excluded.hasNext()) builder.addDisallowedApplication(excluded.next())
        }

        val descriptor = builder.establish()
            ?: error("Android tidak dapat membuat TUN: izin VPN belum diberikan atau sudah dicabut.")
        (vpnService as? SingBoxVpnService)?.setTunnelDescriptor(descriptor)
        return descriptor.fd
    }

    private fun addPrefixes(iterator: io.nekohasekai.libbox.RoutePrefixIterator, builder: VpnService.Builder, isAddress: Boolean) {
        while (iterator.hasNext()) {
            val prefix = iterator.next()
            if (isAddress) builder.addAddress(prefix.address(), prefix.prefix())
            else builder.addRoute(prefix.address(), prefix.prefix())
        }
    }

    private fun addExcludedPrefixes(iterator: io.nekohasekai.libbox.RoutePrefixIterator, builder: VpnService.Builder) {
        while (iterator.hasNext()) {
            val prefix = iterator.next()
            val ipPrefix = IpPrefix(java.net.InetAddress.getByName(prefix.address()), prefix.prefix())
            builder.excludeRoute(ipPrefix)
        }
    }

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
            setAndroidPackageNames(StringArray(packages.iterator()))
        }
    }

    override fun startDefaultInterfaceMonitor(listener: InterfaceUpdateListener) {
        activeListener = listener
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return
        if (networkCallback != null) return
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) = notifyDefaultNetwork(network)
            override fun onLost(network: Network) = notifyDefaultNetwork(connectivity.activeNetwork)
            override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) = notifyDefaultNetwork(network)
        }
        networkCallback = callback
        connectivity.registerDefaultNetworkCallback(callback)
        notifyDefaultNetwork(connectivity.activeNetwork)
    }

    private fun notifyDefaultNetwork(network: Network?) {
        val listener = activeListener ?: return
        val properties = network?.let { connectivity.getLinkProperties(it) }
        val name = properties?.interfaceName.orEmpty()
        val iface = if (name.isBlank()) null else runCatching { JavaNetworkInterface.getByName(name) }.getOrNull()
        val capabilities = network?.let { connectivity.getNetworkCapabilities(it) }
        val expensive = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) == false
        listener.updateDefaultInterface(name, iface?.index ?: 0, expensive, false)
        listener.updateNetworkPath("android:$name")
    }

    override fun closeDefaultInterfaceMonitor(listener: InterfaceUpdateListener) {
        activeListener = null
        networkCallback?.let { runCatching { connectivity.unregisterNetworkCallback(it) } }
        networkCallback = null
    }

    override fun getInterfaces(): NetworkInterfaceIterator {
        val allInterfaces = runCatching { Collections.list(JavaNetworkInterface.getNetworkInterfaces()) }.getOrDefault(emptyList())
        val result = mutableListOf<LibboxNetworkInterface>()
        for (network in connectivity.allNetworks) {
            val properties = connectivity.getLinkProperties(network) ?: continue
            val capabilities = connectivity.getNetworkCapabilities(network) ?: continue
            val javaInterface = allInterfaces.firstOrNull { it.name == properties.interfaceName } ?: continue
            val item = LibboxNetworkInterface().apply {
                name = javaInterface.name
                index = javaInterface.index
                mtu = runCatching { javaInterface.mtu }.getOrDefault(1500)
                addresses = StringArray(javaInterface.interfaceAddresses.map { address ->
                    val host = if (address.address is Inet6Address) {
                        Inet6Address.getByAddress(address.address.address).hostAddress.substringBefore('%')
                    } else address.address.hostAddress
                    "$host/${address.networkPrefixLength}"
                }.iterator())
                dnsServer = StringArray(properties.dnsServers.mapNotNull { it.hostAddress }.iterator())
                gateway = StringArray(properties.routes
                    .filter { it.destination.prefixLength == 0 }
                    .mapNotNull { it.gateway?.hostAddress }
                    .filter { it != "0.0.0.0" && it != "::" }
                    .iterator())
                type = when {
                    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> Libbox.InterfaceTypeWIFI
                    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> Libbox.InterfaceTypeCellular
                    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> Libbox.InterfaceTypeEthernet
                    else -> Libbox.InterfaceTypeOther
                }
                var interfaceFlags = 0
                if (javaInterface.isUp) interfaceFlags = interfaceFlags or OsConstants.IFF_UP or OsConstants.IFF_RUNNING
                if (javaInterface.isLoopback) interfaceFlags = interfaceFlags or OsConstants.IFF_LOOPBACK
                if (javaInterface.isPointToPoint) interfaceFlags = interfaceFlags or OsConstants.IFF_POINTOPOINT
                if (javaInterface.supportsMulticast()) interfaceFlags = interfaceFlags or OsConstants.IFF_MULTICAST
                flags = interfaceFlags
                metered = !capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
            }
            result += item
        }
        return InterfaceArray(result.iterator())
    }

    override fun underNetworkExtension(): Boolean = false
    override fun includeAllNetworks(): Boolean = false
    override fun readWIFIState(): WIFIState? = null
    override fun clearDNSCache() = Unit
    override fun sendNotification(notification: Notification) = Unit
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

internal class StringArray(private val iterator: Iterator<String>) : StringIterator {
    override fun len(): Int = 0
    override fun hasNext(): Boolean = iterator.hasNext()
    override fun next(): String = iterator.next()
}

private class InterfaceArray(private val iterator: Iterator<LibboxNetworkInterface>) : NetworkInterfaceIterator {
    override fun hasNext(): Boolean = iterator.hasNext()
    override fun next(): LibboxNetworkInterface = iterator.next()
}
