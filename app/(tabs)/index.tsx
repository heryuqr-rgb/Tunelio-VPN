import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { BrandHeader, C, DemoNotice, Page } from "@/components/vpn-ui";
import { formatBytes, formatDuration, useVpn } from "@/lib/vpn-state";

export default function HomeScreen() {
  const router = useRouter();
  const { colorScheme } = useThemeContext();
  const dark = colorScheme === "dark";
  const {
    status, selectedProfile, elapsedSeconds, connectOrDisconnect,
    uplinkBytes, downlinkBytes, trafficAvailable, nativeAvailable,
  } = useVpn();
  const isConnected = status === "connected";
  const isPending = status === "connecting" || status === "awaiting_permission";
  const isFailed = status === "failed";
  const statusTint = isFailed ? C.red : isConnected ? C.lime : isPending ? C.warning : "#A4B1AA";
  const down = nativeAvailable && trafficAvailable ? formatBytes(downlinkBytes) : "—";
  const up = nativeAvailable && trafficAvailable ? formatBytes(uplinkBytes) : "—";
  const statusTitle = status === "awaiting_permission" ? "Menunggu izin VPN" : status === "connecting"
    ? (nativeAvailable ? "Menyiapkan tunnel…" : "Simulasi berjalan…")
    : status === "connected" ? (nativeAvailable ? "Tunnel sing-box aktif" : "Simulasi Web aktif")
    : status === "failed" ? "Koneksi gagal" : "Belum terhubung";
  const statusSub = status === "awaiting_permission" ? "Setujui permintaan koneksi pada dialog sistem Android."
    : status === "connecting" ? (nativeAvailable ? "VPNService sedang menyiapkan interface TUN." : "Transisi UI saja; tidak ada koneksi jaringan.")
    : status === "connected" ? (nativeAvailable ? "VPNService Android telah membuka interface TUN." : "Web Preview tidak membuat tunnel perangkat.")
    : status === "failed" ? "Baca alasan kegagalan di Diagnostik, lalu periksa profil dan izin."
    : nativeAvailable ? "Impor konfigurasi sing-box dengan inbound TUN untuk memulai." : "Satu ketukan untuk melihat alur pratinjau aplikasi.";

  return (
    <Page contentStyle={styles.page}>
      <BrandHeader rightLabel={nativeAvailable ? "ANDROID CORE" : "PREVIEW"} />

      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.liveTag}>
            <View style={[styles.liveDot, { backgroundColor: statusTint }]} />
            <Text style={styles.liveLabel}>{status === "connected" ? (nativeAvailable ? "TUNNEL AKTIF" : "SIMULASI WEB") : isPending ? (status === "awaiting_permission" ? "IZIN ANDROID" : nativeAvailable ? "CORE MENYIAPKAN" : "PREVIEW DEMO") : isFailed ? "PERLU PERHATIAN" : nativeAvailable ? "SIAP · IMPOR CONFIG" : "UI PREVIEW"}</Text>
          </View>
        </View>

        <View style={styles.orbitWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isConnected ? "Putuskan VPN" : isPending ? "Batalkan permintaan VPN" : "Mulai VPN"}
            onPress={connectOrDisconnect}
            style={({ pressed }) => [styles.powerButton, isConnected && styles.powerButtonActive, isFailed && styles.powerButtonFailed, pressed && styles.pressed]}
          >
            {isPending ? <ActivityIndicator size="large" color={C.forest} /> : <Ionicons name={isConnected ? "shield-checkmark" : "power"} size={36} color={isConnected ? C.forest : isFailed ? "#FFD0C9" : C.lime} />}
          </Pressable>
        </View>

        <Text style={styles.statusTitle}>{statusTitle}</Text>
        <Text style={styles.statusSub}>{statusSub}</Text>
      </View>

      {!nativeAvailable ? (
        <DemoNotice compact title="Belum ada tunnel perangkat" message="Web Preview dan Expo Go tidak menjalankan VpnService Android atau mengalihkan trafik." />
      ) : null}

      <Pressable onPress={() => router.push("/profiles")} style={({ pressed }) => [styles.serverCard, dark && { backgroundColor: DARK.card, borderColor: DARK.line }, pressed && styles.pressed]}>
        <View style={styles.serverLeft}>
          <View style={styles.serverBadge}><Text style={styles.serverCode}>{selectedProfile.code}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.serverCaption, dark && { color: DARK.muted }]}>PROFIL PILIHAN</Text>
            <Text style={[styles.serverName, dark && { color: DARK.ink }]} numberOfLines={1}>{selectedProfile.name}</Text>
            <Text style={[styles.serverDetails, dark && { color: DARK.muted }]} numberOfLines={1}>{selectedProfile.endpoint}</Text>
          </View>
        </View>
        <View style={styles.changeLink}><Text style={[styles.changeText, dark && { color: DARK.limeDark }]}>Ubah</Text><Ionicons name="chevron-forward" size={15} color={C.limeDark} /></View>
      </Pressable>

      <View style={styles.statsCard}>
        <View style={styles.statsHeading}>
          <Text style={styles.statsTitle}>Ringkasan sesi</Text>
          <View style={styles.demoMini}><View style={[styles.demoMiniDot, nativeAvailable && isConnected && { backgroundColor: C.mint }]} /><Text style={styles.demoMiniText}>{nativeAvailable ? (isConnected ? "LIBBOX" : "NATIVE") : "PREVIEW"}</Text></View>
        </View>
        <View style={styles.statsRow}>
          <Stat label="DURASI" value={formatDuration(elapsedSeconds)} icon="time-outline" />
          <View style={styles.statDivider} />
          <Stat label="UNDUH" value={down} icon="arrow-down-outline" tint={C.mint} />
          <View style={styles.statDivider} />
          <Stat label="UNGGAH" value={up} icon="arrow-up-outline" tint="#D1DC85" />
        </View>
      </View>

      {nativeAvailable && !trafficAvailable && isConnected ? (
        <Text style={[styles.trafficHint, dark && { color: DARK.muted }]}>Counter trafik akan muncul setelah libbox mengirim status pertama.</Text>
      ) : null}
    </Page>
  );
}

function Stat({ label, value, icon, tint = C.lime }: { label: string; value: string; icon: React.ComponentProps<typeof Ionicons>["name"]; tint?: string }) {
  return (
    <View style={styles.stat}>
      <View style={styles.statLabelRow}><Ionicons name={icon} size={13} color={tint} /><Text style={styles.statLabel}>{label}</Text></View>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 16, paddingBottom: 22 },
  hero: { borderRadius: 28, backgroundColor: C.forest, paddingHorizontal: 18, paddingTop: 17, paddingBottom: 18, alignItems: "center", overflow: "hidden" },
  heroTop: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  liveTag: { flexDirection: "row", gap: 7, alignItems: "center", borderRadius: 20, backgroundColor: "#21362D", paddingHorizontal: 10, paddingVertical: 7 },
  liveDot: { width: 6, height: 6, borderRadius: 4 },
  liveLabel: { color: "#D6E1D9", fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  orbitWrap: { width: 132, height: 132, alignItems: "center", justifyContent: "center", marginTop: 5, marginBottom: 2 },
  powerButton: { width: 96, height: 96, borderRadius: 60, backgroundColor: "#20352C", borderWidth: 1, borderColor: "#45634C", alignItems: "center", justifyContent: "center" },
  powerButtonActive: { backgroundColor: C.lime, borderColor: C.lime },
  powerButtonFailed: { backgroundColor: "#4A2F2C", borderColor: "#704541" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  statusTitle: { color: "#F2F6F1", fontSize: 18, fontWeight: "800", letterSpacing: -0.3, marginTop: 1 },
  statusSub: { color: "#A5B7AC", fontSize: 11, marginTop: 5, textAlign: "center", lineHeight: 16, maxWidth: 275 },
  serverCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 20, minHeight: 76, paddingHorizontal: 13, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  serverLeft: { flexDirection: "row", gap: 11, alignItems: "center", flex: 1 },
  serverBadge: { width: 44, height: 44, borderRadius: 15, backgroundColor: C.forest, alignItems: "center", justifyContent: "center" },
  serverCode: { color: C.lime, fontSize: 12, fontWeight: "900", letterSpacing: 0.5 },
  serverCaption: { color: C.muted, fontSize: 8, letterSpacing: 1.1, fontWeight: "800" },
  serverName: { color: C.ink, fontSize: 14, fontWeight: "800", marginTop: 2 },
  serverDetails: { color: C.muted, fontSize: 10, marginTop: 2 },
  changeLink: { flexDirection: "row", alignItems: "center", gap: 1, paddingLeft: 7 },
  changeText: { color: C.limeDark, fontSize: 11, fontWeight: "800" },
  statsCard: { backgroundColor: C.forest, borderRadius: 20, padding: 15 },
  statsHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  statsTitle: { color: "#F3F6EF", fontSize: 13, fontWeight: "800" },
  demoMini: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#253A2F", borderRadius: 20, paddingHorizontal: 7, paddingVertical: 4 },
  demoMiniDot: { width: 5, height: 5, borderRadius: 4, backgroundColor: C.warning },
  demoMiniText: { color: C.lime, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stat: { flex: 1, gap: 6 },
  statLabelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  statLabel: { color: "#A8B7AC", fontSize: 8, letterSpacing: 0.8, fontWeight: "800" },
  statValue: { color: "#F5F7F1", fontSize: 15, fontWeight: "800", letterSpacing: -0.3 },
  statDivider: { width: 1, height: 33, backgroundColor: "#35473D", marginHorizontal: 10 },
  trafficHint: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: -8 },
});
