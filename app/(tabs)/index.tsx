import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { BrandHeader, C, Page } from "@/components/vpn-ui";
import { formatBytes, useVpn } from "@/lib/vpn-state";

const STATUS_TEXT = {
  disconnected: "Belum terhubung",
  connecting: "Menghubungkan…",
  connected: "Terhubung",
  failed: "Koneksi gagal",
} as const;

export default function HomeScreen() {
  const router = useRouter();
  const { status, selectedProfile, connectOrDisconnect, uplinkBytes, downlinkBytes, trafficAvailable } = useVpn();
  const isConnected = status === "connected";
  const isPending = status === "connecting";
  const isFailed = status === "failed";
  const statusTint = isFailed ? C.red : isConnected ? C.lime : isPending ? C.warning : "#A4B1AA";

  return (
    <Page contentStyle={styles.page}>
      <BrandHeader />

      <View style={styles.intro}>
        <Text style={styles.kicker}>RUANG PRIVASI KAMU</Text>
        <Text style={styles.title}>Internetmu,{"\n"}di balik kendalimu.</Text>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.liveTag}>
            <View style={[styles.liveDot, { backgroundColor: statusTint }]} />
            <Text style={styles.liveLabel}>{isConnected ? "TERHUBUNG" : isPending ? "MENGHUBUNGKAN" : isFailed ? "PERLU PERHATIAN" : "SIAP DIGUNAKAN"}</Text>
          </View>
          <Ionicons name="ellipsis-horizontal" size={20} color="#9BAFA5" />
        </View>

        <View style={styles.orbitWrap}>
          <View style={[styles.orbitOuter, isConnected && styles.orbitActive]} />
          <View style={[styles.orbitMiddle, isConnected && styles.orbitMiddleActive]} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isConnected ? "Putuskan koneksi" : isPending ? "Batalkan koneksi" : "Mulai koneksi"}
            onPress={connectOrDisconnect}
            style={({ pressed }) => [styles.powerButton, isConnected && styles.powerButtonActive, isFailed && styles.powerButtonFailed, pressed && styles.pressed]}
          >
            {isPending ? <ActivityIndicator size="large" color={C.forest} /> : <Ionicons name={isConnected ? "shield-checkmark" : "power"} size={36} color={isConnected ? C.forest : isFailed ? "#FFD0C9" : C.lime} />}
          </Pressable>
          <View style={[styles.orbitAccent, isConnected && { backgroundColor: C.lime }]} />
        </View>

        <Text style={styles.statusTitle}>{STATUS_TEXT[status]}</Text>
        <Text style={styles.statusSub}>{isConnected ? "Status sesi aplikasi." : isPending ? "Menunggu layanan VPN." : isFailed ? "VPN belum siap. Buka diagnostik untuk detail." : "Impor konfigurasi sing-box untuk memulai."}</Text>
      </View>

      <Pressable onPress={() => router.push("/profiles")} style={({ pressed }) => [styles.serverCard, pressed && styles.pressed]}>
        <View style={styles.serverLeft}>
          <View style={styles.serverBadge}><Text style={styles.serverCode}>{selectedProfile.code}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.serverCaption}>PROFIL AKTIF</Text>
            <Text style={styles.serverName} numberOfLines={1}>{selectedProfile.name}</Text>
            <Text style={styles.serverDetails} numberOfLines={1}>{selectedProfile.endpoint}</Text>
          </View>
        </View>
        <View style={styles.changeLink}><Text style={styles.changeText}>Impor</Text><Ionicons name="chevron-forward" size={15} color={C.limeDark} /></View>
      </Pressable>


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
  intro: { gap: 6, paddingTop: 2, paddingBottom: 1 },
  kicker: { color: C.limeDark, fontSize: 9, fontWeight: "800", letterSpacing: 1.8 },
  title: { color: C.ink, fontSize: 29, lineHeight: 33, fontWeight: "800", letterSpacing: -1.1 },
  hero: { borderRadius: 28, backgroundColor: C.forest, paddingHorizontal: 18, paddingTop: 17, paddingBottom: 18, alignItems: "center", overflow: "hidden" },
  heroTop: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  liveTag: { flexDirection: "row", gap: 7, alignItems: "center", borderRadius: 20, backgroundColor: "#21362D", paddingHorizontal: 10, paddingVertical: 7 },
  liveDot: { width: 6, height: 6, borderRadius: 4 },
  liveLabel: { color: "#D6E1D9", fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  orbitWrap: { width: 176, height: 176, alignItems: "center", justifyContent: "center", marginTop: 9, marginBottom: 5 },
  orbitOuter: { position: "absolute", width: 170, height: 170, borderRadius: 100, borderColor: "#2A4237", borderWidth: 1 },
  orbitActive: { borderColor: "#81A94C" },
  orbitMiddle: { position: "absolute", width: 142, height: 142, borderRadius: 100, borderColor: "#375044", borderWidth: 1, borderStyle: "dashed" },
  orbitMiddleActive: { borderColor: "#78964F" },
  powerButton: { width: 112, height: 112, borderRadius: 60, backgroundColor: "#20352C", borderWidth: 1, borderColor: "#45634C", alignItems: "center", justifyContent: "center" },
  powerButtonActive: { backgroundColor: C.lime, borderColor: C.lime },
  powerButtonFailed: { backgroundColor: "#4A2F2C", borderColor: "#704541" },
  orbitAccent: { width: 9, height: 9, borderRadius: 6, position: "absolute", top: 20, right: 24, backgroundColor: C.mint, borderWidth: 2, borderColor: C.forest },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  statusTitle: { color: "#F2F6F1", fontSize: 18, fontWeight: "800", letterSpacing: -0.3, marginTop: 1 },
  statusSub: { color: "#A5B7AC", fontSize: 11, marginTop: 5, textAlign: "center", lineHeight: 16, maxWidth: 250 },
  demoStrip: { flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: C.paleYellow, borderColor: "#F0E4C9", borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  demoStripText: { color: "#765F36", fontSize: 10, fontWeight: "700", flex: 1 },
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
  demoMiniDot: { width: 5, height: 5, borderRadius: 4, backgroundColor: C.lime },
  demoMiniText: { color: C.lime, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  statsRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stat: { flex: 1, gap: 6 },
  statLabelRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  statLabel: { color: "#A8B7AC", fontSize: 8, letterSpacing: 0.8, fontWeight: "800" },
  statValue: { color: "#F5F7F1", fontSize: 15, fontWeight: "800", letterSpacing: -0.3 },
  statDivider: { width: 1, height: 33, backgroundColor: "#35473D", marginHorizontal: 10 },
});
