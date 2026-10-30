# Rencana integrasi sing-box Android — Tunelio

## Ruang lingkup dan keadaan build

Produk tetap menargetkan Android portrait/Infinix Hot 60 Pro; Expo/React Native dipertahankan sebagai UI empat tab. Android memakai local Expo Kotlin module untuk menghubungkan tombol JS dengan izin sistem, `VpnService`, TUN, status/log, dan traffic counters. Web Preview/Expo Go tidak memiliki VpnService; UI pada platform tersebut hanya preview dan tidak mengklaim ada tunnel.

Core `sing-box` dipin ke v1.14.3, commit `7054cac5124465ffdb145870d7c01885566711b1`. Generated `libbox.aar` dibangun dari upstream menggunakan Java 17, Go, Android SDK/NDK; AAR ber-ABI `armeabi-v7a` dan `arm64-v8a` disimpan sebagai fragmen maksimum 20 MiB, lalu config plugin menyusunnya di Expo Prebuild dan memverifikasi SHA-256 sebelum Gradle. `scripts/build-libbox-android.sh` mereproduksi AAR/fragmen pinned. Expo autolinking membaca `modules/`, config plugin menambah permission dan dependency AAR pada hasil prebuild. `app.config.ts` membatasi APK ke `arm64-v8a`; plugin standalone menetapkan `debuggableVariants = []` dan `useDevSupport = false`, sehingga debug bundle di-embed tanpa Metro. Adapter snapshot JS menormalkan `getSnapshot` Kotlin yang sinkron menjadi Promise. Lifecycle service menggunakan ulang `CommandServer`, menserialkan start/stop, dan melindungi cache bbolt dari server ganda. `SingBoxPlatform` memprioritaskan interface fisik terakhir yang valid, mengabaikan VPN/TUN, dan memakai ConnectivityManager serta fallback Java interface. Pemeriksaan TypeScript/lint dan `:app:assembleDebug` berhasil; build JDK 17 terakhir `BUILD SUCCESSFUL in 45s`. APK `android/app/build/outputs/apk/debug/app-debug.apk` berukuran 179969407 byte (172 MiB), timestamp `2026-10-28 06:22:11 UTC`, SHA-256 `960a2ec4f8f6c0ad805d0b80edbce912855ce18a985a44f1554d294488536e35`; ZIP valid dan memuat `assets/index.android.bundle` serta `lib/arm64-v8a/libbox.so`. Ini APK debug, bukan rilis. Sandbox tidak menyediakan emulator/ADB; launch, DNS, koneksi dan routing tetap perlu diuji pada Infinix fisik sebelum klaim VPN berfungsi.

## Perilaku yang diimplementasikan

Bridge JS memanggil `connect(configJson)`, `disconnect()`, `getSnapshot()` dan mendengarkan event status, traffic, dan log. Kotlin mendeklarasikan `getSnapshot` sebagai `Function` sinkron; adapter JS menormalkan hasil itu menjadi Promise sehingga provider aman menggunakan `.then`. `VpnService` memakai ulang `CommandServer` pada reload, menserialkan lifecycle core lintas service, dan memutus `CommandClient` lama sebelum reload agar dua instance tidak bersaing untuk lock bbolt. File config tiap permintaan unik dan dihapus saat sukses, gagal, stop, atau activity izin gagal dibuka. Setup memeriksa working/temp/cache directory app-private; cache path relatif mengikuti `workingPath` upstream (`noBackupFilesDir/sing-box-work`), dan timeout upstream tidak diperbesar. Import JSON mensyaratkan `outbounds` dan inbound `type: tun` dengan `auto_route: true`; konfigurasi mentah berada di memori JS selama sesi, diteruskan ke direktori privat app hanya saat dimulai, dan tidak dikirim ke server aplikasi. Status connected diset setelah TUN terbuka; byte berasal dari `StatusMessage` CommandClient, bukan counter animasi UI. Log native disanitasi sebelum dikirim ke UI. Fitur profil, TUN, trafik, dan diagnostik tetap tersedia.

Pesan `start or reload service: initialize cache-file: timeout` pada sing-box v1.14.3 berasal dari pembukaan database bbolt yang gagal memperoleh file lock: `cachefile.start` memakai `bbolt.Options{Timeout: time.Second}` dan mengulang open sepuluh kali. Default cache `cache.db` berakar di `workingPath` (`noBackupFilesDir/sing-box-work`), sebab `filemanager.WithDefault` menerima path itu sebagai base; path relatif khusus mengikuti aturan yang sama. Direktori tersebut app-private dan tidak memerlukan izin storage umum. Source Tunelio memiliki jalur start ulang setelah thread startup selesai yang membuat `CommandServer` baru tanpa menutup/memakai ulang instance sebelumnya; kedua server menggunakan working/cache path yang sama. Perbaikan memakai `StartOrReloadService` pada server yang sama, menserialkan lifecycle libbox, dan memutus CommandClient lama sebelum reload. Karena workspace tidak berisi logcat perangkat, pemegang lock pada kejadian di ponsel belum dapat dipastikan; validasi direktori privat/path dan log diagnostik dibuat spesifik tanpa menambah timeout atau membuang opsi cache/config. Rujukan upstream: [cachefile/cache.go pada commit 7054cac5124465ffdb145870d7c01885566711b1](https://github.com/SagerNet/sing-box/blob/7054cac5124465ffdb145870d7c01885566711b1/experimental/cachefile/cache.go), [filemanager/default.go versi v0.9.7-0.20260929150544-0ad23b637bd4](https://github.com/SagerNet/sing/blob/0ad23b637bd4/service/filemanager/default.go), dan `daemon/started_service.go` pada commit yang sama; local pinned checkout: `~/.cache/tunelio/sing-box-v1.14.3`.

Kotlin `PlatformInterface.openTun` menyusun alamat IPv4/IPv6, DNS, routes, include/exclude package dari `TunOptions`, menyerahkan descriptor yang sama ke core, dan memanggil `VpnService.protect` untuk socket transport. Android foreground service menangani stop, revoke, notification, dan penutupan core/TUN. Monitor ConnectivityManager meneruskan perubahan interface; toggle auto-connect/reconnect masih berupa preferensi tersimpan dan belum menjalankan kebijakan otomatis.

Screenshot Diagnostics perangkat menunjukkan lookup `investor.fb.com` gagal dengan `dial UDP connection: no available network interface`; TLS/SNI dan WebSocket path yang diberikan berhasil diuji dari sandbox tanpa kredensial, tetapi autentikasi VLESS belum diuji. Upstream menghasilkan pesan itu jika `NetworkManager` tidak memiliki kandidat interface yang cocok dengan default index. Adapter kini mengingat jaringan fisik terakhir yang valid, memeriksa kandidat `ConnectivityManager.allNetworks` yang tervalidasi, mengecualikan `TRANSPORT_VPN`, memakai fallback interface Android aktif jika pemetaan nama gagal, serta menghapus default index stale memakai sentinel `-1`. Diagnostik mencatat interface fisik yang terpilih; `VpnService.protect` tetap dipakai dan nama interface carrier tidak di-hardcode. Build final berhasil, namun uji ulang di ponsel masih diperlukan.

Konfigurasi valid dan TUN terbentuk belum membuktikan server endpoint, routing internet, DNS atau anti-leak berfungsi. Semua itu perlu uji di perangkat nyata; sampai saat itu jangan menyatakan VPN siap melindungi seluruh trafik atau memiliki kill switch.

## Lisensi

Upstream sing-box/libbox menyatakan GPL-3.0-or-later dan notice `LICENSE` upstream menambahkan ketentuan nama/afiliasi. Repo mengikutkan teks GPL penuh, notice upstream, source revision dan skrip build. Peninjauan distribusi/source corresponding/afiliasi masih diperlukan sebelum APK/AAB dibagikan.

## Struktur proyek

- `app/(tabs)/` — beranda, profil, aktivitas/diagnostik, setelan, dan navigasi tab.
- `lib/vpn-state.tsx` — state/bridge lintas layar, import config, log dan byte counter; preview Web terpisah dari status native.
- `lib/singbox-native.ts` — adapter Expo Module pada Android.
- `modules/singbox-android/` — Expo local module, activity consent, `VpnService`, `PlatformInterface`, broadcast/event bridge, dan libbox AAR.
- `plugins/with-singbox.ts` — izin Android dan dependency AAR idempoten pada prebuild.
- `scripts/build-libbox-android.sh` — reproduksi generated libbox Android binding dari source resmi yang dipin.
- `docs/`, `licenses/`, `README.md`, `THIRD_PARTY_NOTICES.md`, `TODO.md` — sumber API, build, lisensi, penggunaan dan status validasi.
- `assets/images/`, `components/`, `hooks/` — identitas UI, komponen visual dan logika bersama yang sudah ada.

## Identitas dan desain UI yang dipertahankan

- **Desain**: antarmuka Tunelio yang telah disetujui, berestetika utilitarian minimal dan editorial gelap-hangat.
- **Prinsip inti**: status koneksi berlandaskan event engine nyata; izin OS eksplisit; konfigurasi privat di perangkat; kondisi belum siap diterangkan dengan jujur.
- **Warna**: hijau lime sebagai penanda aktif di atas latar hijau arang, dengan mint untuk detail koneksi; aktif hanya setelah libbox berhasil membentuk TUN.
- **Tata letak**: empat tab portrait ringkas dengan kontrol koneksi utama mudah dijangkau satu tangan.
- **Motif**: lambang shield/pulse Tunelio, indikator state berlabel, dan kartu endpoint profil.
- **Interaksi**: connect meminta izin OS bila perlu dan menampilkan error; disconnect menghentikan core/service, bukan hanya mengganti label.
- **Animasi**: transisi mengikuti state nyata; counter trafik tidak dipalsukan.
- **Tipografi**: hierarki display dan label UI Tunelio dipertahankan untuk keterbacaan.
- **Esensi**: VPN sing-box yang transparan status dan mengutamakan privasi; tenang, tepercaya, jelas.
- **Suara merek**: CTA langsung seperti “Hubungkan tunnel” dan penjelasan “Android akan meminta izin VPN sebelum trafik diarahkan.”
- **Logo/warna**: shield dengan kilat/relay; lime `#B9E66A` sebagai warna khas Tunelio.
