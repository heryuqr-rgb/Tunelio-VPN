

Verifikasi ownership file descriptor: `VPNService.openTun()` milik klien Android resmi menyimpan `builder.establish()` sebagai `service.fileDescriptor`, lalu mengembalikan `pfd.fd` (bukan `detachFd()`): <https://raw.githubusercontent.com/SagerNet/sing-box-for-android/dev/app/src/main/java/io/nekohasekai/sfa/bg/VPNService.kt>. Tunelio mengikuti pola tersebut: descriptor disimpan oleh service sampai proses tunnel dihentikan, lalu ditutup pada cleanup/revocation.
