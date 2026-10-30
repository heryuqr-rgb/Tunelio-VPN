# Tunelio VPN

Aplikasi Expo/React Native untuk Android portrait, dirancang untuk layar seperti Infinix Hot 60 Pro. Antarmuka berbahasa Indonesia; koneksi nyata memakai sing-box/libbox melalui Android `VpnService` dan TUN.

## Status integrasi

Source memuat Android Expo module, binding resmi libbox sing-box, izin VPN Android, foreground service, TUN, event status/log, dan penghitung byte dari `CommandClient`. Lifecycle reload memakai ulang `CommandServer`, menserialkan operasi core, menghentikan `CommandClient` lama sebelum reload, dan mengisolasi file config tiap permintaan. `SingBoxPlatform` kini memilih interface jaringan non-VPN, mengingat jaringan fisik terakhir yang valid, memetakan ConnectivityManager ke interface Android, memakai fallback interface up non-loopback, mengecualikan nama tunnel umum, serta membersihkan default index stale; `VpnService.protect` tetap digunakan. APK debug hanya dipaketkan untuk ABI `arm64-v8a`; AAR upstream masih menyertakan ARMv7 dan ARM64. UI tidak mengklaim Web Preview atau Expo Go sebagai VPN sungguhan.

Pemeriksaan `pnpm check` dan `pnpm lint` lulus; Gradle JDK 17 `:app:assembleDebug` melaporkan `BUILD SUCCESSFUL in 45s`. APK debug di `android/app/build/outputs/apk/debug/app-debug.apk` (179969407 byte / 172 MiB; ABI `arm64-v8a`; timestamp `2026-10-28 06:22:11 UTC`; SHA-256 `960a2ec4f8f6c0ad805d0b80edbce912855ce18a985a44f1554d294488536e35`) lolos pemeriksaan ZIP dan memuat `assets/index.android.bundle` serta `lib/arm64-v8a/libbox.so`. Crash `getSnapshot` sebelumnya berasal dari Kotlin sync versus JS `.then`; adapter JS tetap menormalkan hasil menjadi Promise. Error `initialize cache-file: timeout` terkait lock bbolt; perbaikan memakai ulang server, menserialkan lifecycle dan tidak memperbesar timeout. Log perangkat terbaru menunjukkan `no available network interface` saat DNS bootstrap, bukan bukti error UUID/TLS; adapter Android kini memilih jaringan fisik dan menghindari default VPN/TUN stale. `VpnService.protect` tetap aktif. Uji ulang pada ponsel belum dilakukan. Path cache relatif memakai direktori app-private `noBackupFilesDir/sing-box-work`, tanpa izin storage umum. Host Expo memakai `useDevSupport = false`, sehingga bundle lokal dipakai tanpa Metro `localhost:8081`. **Ini bukan APK rilis dan belum diuji pada perangkat; jangan mengandalkannya untuk melindungi trafik sebelum pengujian fisik.**

## Menggunakan aplikasi Android

1. Gunakan custom Android development build/APK yang menyertakan local module di `modules/singbox-android`; Web Preview dan Expo Go tidak memuat `VpnService`.
2. Siapkan konfigurasi JSON sing-box milikmu yang berisi array `outbounds` dan setidaknya satu inbound `type: "tun"` dengan `auto_route: true`.
3. Di layar Profil pilih **Impor konfigurasi**. Berkas dibaca lokal. Isi JSON/kredensial tidak disimpan di daftar profil atau dikirim ke server; saat koneksi diminta JSON diteruskan hanya ke module native pada perangkat.
4. Tekan tombol daya lalu tinjau/setujui dialog izin VPN Android. Status tersambung berarti service berhasil membentuk TUN; status/log/byte selanjutnya berasal dari libbox.
5. Putuskan melalui tombol daya atau notifikasi VPN Android. Jika izin ditolak atau core tidak berhasil membentuk tunnel, diagnostik menampilkan alasan.

### Uji pada Infinix Hot 60 Pro (belum dilakukan)

1. Unduh APK debug final ke perangkat, instal, dan izinkan pemasangan dari sumber unduhan bila Android meminta. Jangan memakai profil lokasi contoh; impor konfigurasi sing-box milikmu yang valid dan sudah berisi outbound server serta inbound `type: "tun"` dengan `auto_route: true`.
2. Matikan sementara VPN lain, buka Tunelio, tekan tombol daya, lalu setujui dialog VPN Android. Pastikan aplikasi hanya menunjukkan tersambung setelah TUN terbentuk, Diagnostics mencatat `Interface jaringan fisik Android: ...`, dan tidak muncul `no available network interface` atau error `cache-file`/service.
3. Verifikasi alamat IP publik dan DNS sebelum/sesudah koneksi menggunakan endpoint yang kamu percaya; pastikan angka upload/download bertambah saat trafik berlangsung. Jangan kirim kredensial konfigurasi ke orang lain.
4. Uji perpindahan Wi-Fi ke data seluler, kunci/buka layar, putus-sambung ulang, penghentian dari tombol/notifikasi, dan pencabutan izin. Setelah putus, pastikan koneksi perangkat kembali ke jalur normal. Catat log diagnostik bila terjadi kegagalan.
5. Jika error interface/DNS tetap muncul, kirim tampilan Diagnostics terbaru yang memuat pesan pemilihan interface dan error awal; tutupi UUID, kredensial, serta data akun dari tangkapan layar.

Profil lokasi contoh (Singapura, Tokyo, Amsterdam, Frankfurt) hanyalah contoh tampilan dan **tidak memiliki kredensial**; tidak dapat digunakan untuk menghubungkan VPN.

## Implementasi native

- `modules/singbox-android/` — Expo native module Kotlin, permission activity, Android VPNService, `PlatformInterface`, event bridge dan foreground notification.
- `modules/singbox-android/android/libs/libbox.aar.part-*` — fragmen 20 MiB binding Android upstream; checksum tercatat di `libbox.version`. Expo Prebuild menggabungkan dan memverifikasi SHA-256 sebelum Gradle berjalan; AAR utuh hasilnya diabaikan Git.
- `plugins/with-singbox.ts` — menambahkan izin Android, merekonstruksi dan memeriksa AAR, serta menautkan dependensi pada hasil Expo Prebuild.
- `plugins/with-standalone-debug-bundle.ts` — menyertakan bundle JS pada debug variant dan menonaktifkan developer-support/Metro di host Expo untuk APK standalone; tidak mengubah logika VPN.
- `lib/singbox-native.ts` — adapter JS/native; hanya memuat module pada Android.
- `lib/vpn-state.tsx` — status, log, konfigurasi dan traffic counter lintas layar; simulasi UI hanya tersedia di Web Preview.
- `scripts/build-libbox-android.sh` — mereproduksi binding AAR dari source upstream yang dipin dan menghasilkan ulang fragmen/checksum.
- `docs/sing-box-upstream-notes.md` serta `licenses/` — catatan API, sumber, dan lisensi upstream.

### Membangun ulang libbox AAR

Skrip menyiapkan binding upstream saja—bukan APK. Diperlukan Go (1.25.5 atau lebih baru), OpenJDK 17, Android SDK berlisensi, dan NDK `28.0.13004108`.

```bash
./scripts/build-libbox-android.sh
```

AAR default berisi ABI `android/arm,android/arm64` (ARMv7 dan ARM64). AAR dipecah menjadi fragmen berukuran maksimal 20 MiB agar setiap objek berada di bawah batas penyimpanan Git proyek; Expo Prebuild menyusun fragmen sesuai urutan dan menolak hash yang tidak cocok. Override ABI hanya bila diperlukan melalui `LIBBOX_ANDROID_PLATFORM`.

### Menjalankan pemeriksaan UI

```bash
pnpm dev
pnpm check
pnpm lint
```

Metro/Web Preview berjalan pada port `8081`; API starter pada port `3000`. Web Preview tidak dapat membentuk VPN atau mengukur traffic jaringan perangkat. APK debug yang tersedia bukan build distribusi; APK/AAB rilis harus dibuat sebagai custom native build melalui alur Mobile/Dashboard yang sesuai.

## Batasan yang masih terbuka

- Sambung otomatis dan reconnect saat jaringan berubah hanya disimpan sebagai preferensi; belum menerapkan aturan auto-start/recovery service.
- Belum ada dukungan iOS, always-on VPN, kill switch, per-app routing UI, maupun pengelolaan endpoint/kredensial server.
- `VpnService` tidak dapat membuktikan endpoint server atau routing internet berfungsi hanya dari UI. Lakukan uji trafik/DNS dan perilaku pencabutan izin pada device target.
- Distribusi libbox tunduk pada GPL-3.0-or-later serta notice upstream tentang nama/afiliasi; baca `THIRD_PARTY_NOTICES.md`, `licenses/GPL-3.0.txt`, dan `licenses/sing-box-upstream-LICENSE.txt` sebelum distribusi.
