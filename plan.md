# Rencana integrasi sing-box Android — Tunelio

## Ruang lingkup dan batas teknis

Perubahan ini menargetkan Android/Infinix Hot 60 Pro karena permintaan menyebut `VpnService`; iOS dan Web tetap memakai jalur pratinjau sampai dibuat engine native tersendiri. UI Expo/React Native dipertahankan dan memakai Expo Modules API untuk memanggil kode Kotlin. Kontrol koneksi saat ini diganti untuk Android agar meminta persetujuan VPN sistem, mengirim konfigurasi pengguna ke modul native, menampilkan state nyata, dan mengambil penghitung trafik dari sing-box. Engine native berjalan di Android `VpnService`; service membangun TUN melalui `VpnService.Builder`, lalu memberikan file descriptor TUN ke libbox lewat `PlatformInterface.openTun`.

Integrasi memakai API `experimental/libbox` resmi yang dipin ke satu rilis upstream, bukan mengunduh kode native tanpa pin saat runtime. Proyek harus memperoleh generated `libbox.aar` yang sama versinya dengan source API dan menautkannya pada build Android. Skrip build lokal perlu menjelaskan prasyarat Go, Java 17, Android SDK/NDK dan varian ABI `arm64-v8a`/`armeabi-v7a`; AAR merupakan artefak build, bukan berkas JS. Lingkungan saat ini memiliki Java tetapi tidak memiliki Android SDK/NDK dan Android project hasil prebuild. Menurut workflow proyek Expo Mobile, APK/AAB final dibangun lewat Dashboard, bukan dari Sandbox. Karena itu source dapat disiapkan di sini, namun koneksi VPN sungguhan harus dinyatakan belum terverifikasi sampai AAR tersedia, APK build, permission disetujui, dan tes perangkat berhasil.

Komunikasi JS-native dibatasi pada `preparePermission`, `start(configJson)`, `stop()`, `getStatus()`, statistik (`uplink`, `downlink`) dan event status/log. Konfigurasi lengkap disimpan hanya di direktori privat aplikasi, divalidasi oleh libbox, tidak dikirim ke API/server, dan dibuang saat dihentikan/diganti bila tidak perlu disimpan. UI tidak boleh menampilkan Connected sebelum core melaporkan start berhasil; bila modul/AAR tidak ada, kontrol harus menampilkan pesan native belum dibuild. Profil contoh tidak dapat membuka koneksi. Alur menyambung memiliki izin `VpnService.prepare`, pemberitahuan foreground, perlindungan socket dari loop routing dan penanganan `onRevoke`/`onDestroy`. Statistik berasal dari trafik core, bukan animasi counter demo. Perubahan jaringan dikelola oleh monitor Android/libbox, sementara pilihan reconnect mengikuti pref UI setelah implementasi event tersedia.

Lisensi upstream sing-box adalah GPLv3-or-later. Distribusi aplikasi yang menggabungkan/menautkan libbox perlu mematuhi GPL termasuk menyediakan source corresponding/notice dan persyaratan distribusi terkait; implementasi tidak boleh menyatakan proyek proprietary-compatible tanpa analisis lisensi terpisah.

## Struktur yang direncanakan

- `app/(tabs)/` — UI dan kontrol status; Android memakai adapter native, Web tetap memperlihatkan simulasi berlabel.
- `lib/vpn-state.tsx` — state UI, pemilihan profil, validasi input dasar, persistence profil tanpa rahasia mentah, dan adapter platform.
- `modules/singbox-android/` — Expo local module; Kotlin `Module` serta `VpnService`, notifikasi, izin, TUN descriptor, event, status dan byte stats.
- `plugins/` — config plugin yang menambah service `VpnService`, permissions, metadata foreground service Android, serta dependensi AAR ke hasil Expo Prebuild secara idempotent.
- `scripts/` — petunjuk/skrip untuk membangun generated `libbox.aar` dari versi upstream yang dipin dan untuk validasi file input.
- `app.config.ts` — mendaftarkan config plugin tanpa mengganti identifier Android/iOS yang telah ada.
- `README.md` dan `TODO.md` — mendokumentasikan prasyarat build, lisensi, penggunaan hanya dengan konfigurasi milik pengguna, dan batas hasil yang benar-benar sudah terverifikasi.

## Identitas dan desain UI yang dipertahankan

- **Desain**: antarmuka Tunelio yang sudah disetujui, berestetika utilitarian minimal dan editorial gelap-hangat.
- **Prinsip inti**: status koneksi berlandaskan event engine nyata; izin OS eksplisit; konfigurasi dan kredensial tetap privat di perangkat; kondisi belum siap selalu diterangkan dengan jujur.
- **Warna**: hijau lime sebagai penanda aman/aktif di atas latar hijau arang, dengan mint untuk detail koneksi; warna status aktif hanya muncul setelah libbox sukses.
- **Tata letak**: empat tab portrait yang ringkas dan kontrol koneksi utama mudah dijangkau satu tangan.
- **Motif**: lambang shield/pulse Tunelio, indikator state berlabel, dan kartu endpoint profil.
- **Interaksi**: connect selalu menampilkan izin sistem bila diperlukan dan error yang dapat dipulihkan; disconnect menghentikan core dan service, bukan hanya mengubah label.
- **Animasi**: transisi halus hanya pada state nyata yang dilaporkan native; counter trafik tidak dipalsukan.
- **Tipografi**: hierarki display dan label yang ada di sistem UI Tunelio dipertahankan untuk keterbacaan layar perangkat.
- **Esensi**: VPN sing-box yang transparan status dan mengutamakan privasi; sifatnya tenang, tepercaya, jelas.
- **Suara merek**: CTA langsung seperti “Hubungkan tunnel” dan penjelasan “Android akan meminta izin VPN sebelum trafik diarahkan.”
- **Logo dan warna merek**: shield dengan kilat/relay; lime `#B9E66A` sebagai warna khas Tunelio.
