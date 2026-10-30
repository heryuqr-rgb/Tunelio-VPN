# TODO Tunelio VPN

Status: `[x]` antarmuka, bridge native, TypeScript/lint, fix snapshot, lifecycle cache-file, interface-discovery Android, dan APK debug arm64-only berhasil dibangun; `[~]` ZIP APK memuat bundle JS serta libbox dan utuh, tetapi launch/tunnel belum diuji pada perangkat; `[~]` verifikasi end-to-end masih harus dilakukan di Infinix Hot 60 Pro; `[ ]` build rilis/distribusi belum dilakukan.

## Tugas saat ini: Kegagalan lookup DNS pada interface Android
- [x] Telusuri pesan Diagnostics perangkat `lookup investor.fb.com: ... dial UDP connection: no available network interface` pada alur sing-box DNS, daftar interface platform, ConnectivityManager, dan VPN TUN; bukti menunjukkan kegagalan pemilihan interface terjadi saat bootstrap DNS, bukan masalah UUID/TLS.
- [x] Perbaiki penemuan interface fisik Wi-Fi/seluler pada adapter Android tanpa memakai interface VPN/TUN sebagai jalur luar dan tanpa mengunci nama interface carrier; pertahankan `VpnService.protect`, profil, DNS, TUN, statistik trafik, dan diagnostik. Perbaikan mengingat jaringan fisik terakhir, memeriksa kandidat tervalidasi, fallback ke interface Android aktif, dan membersihkan default index lama.
- [x] Build ulang APK debug setelah perubahan. `pnpm check` dan `pnpm lint` lulus; Gradle JDK 17 melaporkan `BUILD SUCCESSFUL in 45s`. APK lolos ZIP, berisi bundle JS dan `libbox.so`, ukuran 179969407 byte / 172 MiB; timestamp `2026-10-28 06:22:11 UTC`; SHA-256 `960a2ec4f8f6c0ad805d0b80edbce912855ce18a985a44f1554d294488536e35`. APK diberikan sebagai tautan unduhan langsung pada percakapan.
- [~] Pasang dan uji ulang di Infinix Hot 60 Pro; jangan mengklaim koneksi berhasil sampai perangkat fisik mengonfirmasi. Jika masih gagal, kirim Diagnostics terbaru dengan kredensial/UUID ditutupi.

## Tugas saat ini: Cache-file timeout dan APK terbaru
- [x] Telusuri error runtime persis `start or reload service: initialize cache-file: timeout` pada implementasi native sing-box/libbox. Periksa inisialisasi cache-file, lokasi penyimpanan dan permission Android, lifecycle `VpnService`, serta pemanggilan `CommandClient`. Source upstream menunjukkan bbolt lock timeout satu detik hingga 10 percobaan; filemanager memakai `workingPath` privat sebagai base. Source Tunelio sebelumnya dapat membuat `CommandServer` kedua pada working/cache path yang sama setelah worker startup selesai. Tidak tersedia logcat perangkat untuk membuktikan pemegang lock aktual pada ponsel.
- [x] Perbaiki akar masalah tanpa menghapus core VPN, konfigurasi TUN, statistik trafik, profil, atau diagnostik. Start/reload memakai ulang `CommandServer`, lifecycle core diserialkan lintas service, `CommandClient` lama dihentikan sebelum reload, direktori/cache privat divalidasi dan dicatat; timeout tidak diperbesar. Config sesi memiliki file unik dan cleanup kegagalan; stop berulang tidak membatalkan finalisasi. Adapter snapshot tetap mengubah return sinkron Kotlin menjadi Promise JS dan provider aman dari `undefined is not a function`.
- [x] Jalankan typecheck, lint, dan build debug APK setelah perbaikan. APK final melaporkan `BUILD SUCCESSFUL in 45s`; ZIP valid, berisi `assets/index.android.bundle` serta `lib/arm64-v8a/libbox.so`, ukuran 179969407 byte, timestamp `2026-10-28 06:22:11 UTC`, SHA-256 `960a2ec4f8f6c0ad805d0b80edbce912855ce18a985a44f1554d294488536e35`. APK diserahkan sebagai tautan unduhan langsung dalam percakapan.
- [~] Jangan menyatakan VPN berfungsi sebelum diuji pada Android fisik; sertakan langkah uji fisik setelah APK tersedia. APK belum diuji pada Infinix Hot 60 Pro karena sandbox tidak menyediakan perangkat/emulator.

## A. Produk Android dan koneksi sing-box
- [x] Buat aplikasi mobile menggunakan Expo/React Native dengan tampilan kekinian untuk Infinix Hot 60 Pro; sediakan layar koneksi, profil, diagnosa, dan setelan yang ramah portrait/satu tangan.
- [x] Pin core sing-box ke rilis upstream `v1.14.3`/commit `7054cac5124465ffdb145870d7c01885566711b1`; hasilkan binding Android `libbox.aar` dengan package Java `io.nekohasekai` serta ABI ARMv7 dan ARM64.
- [~] Tombol koneksi pada build native meminta izin melalui `VpnService.prepare`, memulai/menghentikan Android service, dan hanya menerima status connected setelah core membuka TUN; Kotlin `compileDebugKotlin` dan `assembleDebug` berhasil, tetapi lifecycle/VPN runtime belum dibuktikan pada perangkat.
- [~] Tampilkan status native terputus, menunggu izin, menghubungkan, tersambung, gagal, dan memutus; tangani penolakan/revocation izin serta error core; source memperbaiki serialisasi lifecycle, tetapi runtime masih perlu diverifikasi pada perangkat.
- [x] Perbaiki crash startup `VpnProvider`: Kotlin mendefinisikan `getSnapshot` sebagai `Function` sinkron, sedangkan JS adapter sebelumnya memperlakukannya sebagai Promise dan provider memanggil `.then`; adapter sekarang `async` sehingga hasil snapshot aman dikonsumsi sebagai Promise. Pemeriksaan TypeScript/lint dan build APK berhasil tanpa menghapus fitur VPN atau trafik. Buka APK pada perangkat fisik tetap perlu dikonfirmasi.

## B. Android VPNService, tunnel, dan trafik
- [x] Tambahkan Android `VpnService`, `BIND_VPN_SERVICE`, izin foreground service, notification channel/notifikasi foreground, dan alur permintaan izin OS yang eksplisit.
- [~] Implementasikan pembukaan TUN dengan `VpnService.Builder`, serahkan descriptor ke callback `libbox.PlatformInterface.openTun`, lindungi socket transport dengan `VpnService.protect`, dan tutup descriptor/core saat stop/revoke; source berhasil dikompilasi, tetapi lifecycle/VPN runtime perangkat belum diuji.
- [~] Terapkan alamat/rute IPv4/IPv6 dan DNS dari konfigurasi sing-box melalui TUN, tangani API Android modern/legacy, dan cegah socket core masuk loop tunnel; routing dan resolusi DNS masih perlu diuji pada perangkat. Jangan klaim kill-switch kecuali benar-benar dikonfigurasi dan diuji.
- [~] Pantau perubahan jaringan lewat Android ConnectivityManager/libbox; adapter kini memfilter VPN/TUN, mengingat interface fisik terakhir, dan menyediakan fallback. Preferensi auto-connect/reconnect tersimpan lokal tetapi belum diterapkan; perubahan jaringan serta route/DNS tetap perlu diuji pada perangkat.

## C. Profil dan konfigurasi
- [x] Impor JSON lokal; parser UI mengenali `outbounds`, endpoint, dan inbound `type: tun` dengan `auto_route: true`; konfigurasi profil mentah hanya ada di memori sesi.
- [x] Kirim konfigurasi impor ke modul native secara lokal, validasi struktur TUN awal, simpan berkas sementara unik di direktori privat, jalankan melalui libbox yang dipin, hapus file setelah sukses/gagal/stop atau gagal membuka activity izin, dan tampilkan error start. Jangan kirim config/kredensial ke server/telemetri.
- [x] Sediakan daftar profil contoh dan pilihan profil; endpoint contoh tidak mempunyai kredensial dan tidak boleh digunakan untuk membuat tunnel.

## D. Statistik dan diagnostik
- [x] Pada Android, ambil `UplinkTotal`/`DownlinkTotal`/`TrafficAvailable` dari `CommandClient` libbox; Web Preview tidak menampilkan trafik demo sebagai data nyata.
- [~] Teruskan status, log tersanitasi, serta interface Android yang dipilih dan pesan error native ke Diagnostik; verifikasi error DNS, perubahan jaringan, service yang dihentikan OS, dan pemulihan setelah kondisi runtime pada perangkat.

## E. Build, kompatibilitas, dan distribusi
- [x] Siapkan Expo local native module/config plugin yang ditemukan melalui autolinking setelah prebuild; sediakan skrip pinned untuk build AAR ARMv7/ARM64 dari source resmi.
- [~] APK debug dibangun di `android/app/build/outputs/apk/debug/app-debug.apk` (179969407 byte; varian debug, ABI `arm64-v8a` saja; `BUILD SUCCESSFUL in 45s`; timestamp `2026-10-28 06:22:11 UTC`; SHA-256 `960a2ec4f8f6c0ad805d0b80edbce912855ce18a985a44f1554d294488536e35`); ZIP valid dan memuat bundle JavaScript serta `lib/arm64-v8a/libbox.so`. Build APK/AAB rilis melalui Dashboard WebDev dan instal/uji pada Infinix Hot 60 Pro fisik masih diperlukan.
- [~] Buat APK debug mandiri yang mengemas `assets/index.android.bundle` dan menggunakan bundle tertanam saat mulai, tanpa mencari Metro di `localhost:8081` atau memerlukan Metro/ADB setelah aplikasi terpasang. Plugin menyetel `debuggableVariants = []` dan `useDevSupport = false`, APK final memuat bundle serta hanya ABI `arm64-v8a`; launch offline pada perangkat masih perlu diuji.
- [~] Sertakan GPL-3.0-or-later lengkap, notice upstream, source revision dan prosedur build; tinjau kewajiban hukum/source corresponding serta nama/afiliasi sebelum distribusi publik.
