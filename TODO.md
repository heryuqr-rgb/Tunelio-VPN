# TODO Tunelio VPN

Status: `[x]` UI pratinjau yang telah dibuat; `[~]` pekerjaan native/source yang parsial; `[ ]` bukti yang masih diperlukan sebelum VPN dianggap berfungsi.

## A. Native sing-box dan kontrol koneksi Android
- [~] Buat aplikasi VPN dengan core sing-box dan tampilan kekinian untuk Infinix Hot 60 Pro. UI Expo tersedia; binding `libbox.aar`, Android service, build APK dan pengujian perangkat diperlukan agar koneksi nyata.
- [ ] Integrasikan core sing-box/libbox yang dipin ke rilis resmi serta cocokkan versi API dengan generated Android binding/AAR.
- [ ] Jadikan tombol Android satu ketukan meminta izin `VpnService.prepare`, memulai/menghentikan service, dan hanya menampilkan status tersambung setelah libbox sukses.
- [ ] Tampilkan status native terputus, menunggu izin, menghubungkan, tersambung, gagal, dan memutus; tangani revocation, service lifecycle dan kegagalan core.

## B. VPNService dan trafik perangkat
- [ ] Tambahkan Android `VpnService`, deklarasi manifest yang diperlukan, notification channel/foreground service, dan permintaan izin OS yang eksplisit.
- [ ] Implementasikan pembukaan TUN dengan `VpnService.Builder`, serahkan descriptor ke callback `libbox.PlatformInterface.openTun`, lindungi socket transport dengan `VpnService.protect`, dan tutup descriptor/core secara benar saat stop/revoke.
- [ ] Rute IPv4/IPv6 dan DNS dari konfigurasi sing-box harus dialirkan melalui TUN; setelah start sukses, koneksi harus mengalir melalui engine serta tidak masuk loop VPN. Fitur kill-switch tidak boleh diklaim kecuali benar-benar dikonfigurasi dan diuji.
- [ ] Implementasikan perubahan jaringan melalui monitor Android/libbox; terapkan preferensi auto-connect/reconnect hanya setelah service dan kebijakan OS ditangani dengan benar.

## C. Profil dan konfigurasi
- [~] Sediakan impor JSON lokal yang mengenali array `outbounds` dan pengelolaan profil. Parser UI awal hanya mengenali endpoint, bukan validator konfigurasi penuh; konfigurasi mentah belum dikonsumsi libbox.
- [ ] Kirim seluruh konfigurasi impor secara privat ke native service, validasi dengan libbox yang dipin, simpan berkas di storage privat aplikasi bila dibutuhkan service, dan tampilkan error schema/start secara terkontrol. Jangan kirim config/kredensial ke server/telemetri.
- [x] Sediakan daftar profil contoh dan pilihan profil; endpoint contoh tidak boleh digunakan untuk membuat tunnel.

## D. Statistik dan diagnostik nyata
- [~] Durasi, upload/download dan log saat ini adalah simulasi pada UI pratinjau.
- [ ] Sambungkan UI Android ke status/log dari CommandServer/libbox dan hitung upload/download total/delta dari statistik core; UI tidak menampilkan data demo sebagai trafik nyata.
- [ ] Tangani event crash/error, penghentian karena Android, kegagalan DNS, perubahan jaringan, dan pemulihan sesi dengan pesan yang tidak membocorkan secrets.

## E. Build, kompatibilitas, dan distribusi
- [ ] Siapkan Expo local native module/config plugin yang muncul konsisten setelah prebuild; sediakan prosedur pinned build AAR Android dan ABI `arm64-v8a` serta `armeabi-v7a`.
- [ ] Build APK/AAB melalui Dashboard WebDev, instal di perangkat Android, izinkan VPN dan uji koneksi/tunnel serta byte trafik di Infinix Hot 60 Pro fisik.
- [ ] Patuhi lisensi GPLv3-or-later sing-box/libbox sebelum mendistribusikan aplikasi beserta binary atau APK.
