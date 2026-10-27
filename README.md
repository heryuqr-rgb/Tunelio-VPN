# Tunelio VPN

Aplikasi mobile Expo/React Native dengan UI VPN modern yang ditujukan untuk layar Android portrait, termasuk Infinix Hot 60 Pro.

## Status produk

Proyek ini saat ini adalah prototipe UI interaktif. Tombol koneksi, status, timer, statistik lalu lintas, dan log berjalan sebagai simulasi. **Belum ada tunnel VPN aktif dan lalu lintas perangkat tidak diarahkan melalui sing-box.** Core sing-box/libbox, Android `VpnService`, izin sistem VPN, notifikasi foreground, dan pengujian native masih perlu diintegrasikan sebelum aplikasi dapat dipakai sebagai VPN sungguhan.

## Layar

- **Utama**: kontrol koneksi satu ketukan, profil aktif, durasi, statistik demo, dan penanda pratinjau.
- **Profil**: pemilihan lokasi contoh serta impor berkas JSON melalui pemilih dokumen. Parser mengenali top-level `outbounds` dan menampilkan outbound server yang dapat dikenali; belum memvalidasi keseluruhan spesifikasi sing-box. Nama dan endpoint profil tersimpan secara lokal. Isi konfigurasi berada di memori sesi saja, dan salinan sementara Document Picker dihapus setelah dibaca; konfigurasi perlu diimpor ulang setelah aplikasi ditutup.
- **Diagnostik**: pemeriksaan kesiapan UI, status prototipe, log lokal, dan kontrol untuk menguji tampilan status gagal.
- **Setelan**: preferensi sambung otomatis dan koneksi ulang. Nilainya tersimpan lokal, tetapi belum mengendalikan core/tunnel.

## Jalankan

```bash
pnpm dev
```

Perintah tersebut menjalankan Metro/Web Preview pada port `8081` dan API starter pada port `3000`. Pemeriksaan kode:

```bash
pnpm check
pnpm lint
```

## Struktur utama

- `app/(tabs)/` — layar Utama, Profil, Diagnostik, Setelan, dan navigasi tab.
- `lib/vpn-state.tsx` — state bersama, alur koneksi demo, profil, preferensi, dan log.
- `components/vpn-ui.tsx` — komponen tampilan bersama dan sistem warna.
- `assets/images/` — launcher, adaptive icon, splash, dan favicon Tunelio.

## Tahap berikut untuk VPN nyata

Tambahkan modul native Android yang membungkus libbox/sing-box dan `VpnService`; minta izin pengguna sebelum membuat tunnel; hubungkan impor konfigurasi ke parser/core resmi; implementasikan lifecycle foreground, deteksi perubahan jaringan, penghitung byte dari core, serta diagnostik error native. Setelah itu, build dan uji di perangkat Android fisik—termasuk Infinix Hot 60 Pro—sebelum mengiklankan proteksi trafik.
