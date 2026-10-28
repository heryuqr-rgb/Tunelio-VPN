import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card, C, DemoNotice, IconTile, Page, PageTitle, SectionTitle } from "@/components/vpn-ui";
import { useVpn } from "@/lib/vpn-state";

export default function ActivityScreen() {
  const { status, events, simulateFailure, resetDemo, clearEvents, nativeAvailable, trafficAvailable, selectedProfile } = useVpn();
  const issue = status === "failed";
  const configReady = selectedProfile.origin === "imported" && selectedProfile.configLoaded === true;
  const tunnelReady = nativeAvailable && status === "connected";
  const statusText = status === "awaiting_permission" ? "Menunggu izin Android"
    : status === "connecting" ? (nativeAvailable ? "Menyiapkan sing-box" : "Demo sedang berjalan")
    : status === "connected" ? (nativeAvailable ? "VPN TUN aktif" : "Simulasi aktif · tanpa tunnel")
    : status === "failed" ? (nativeAvailable ? "Core/VPNService gagal" : "Gagal (simulasi)")
    : "Terputus";
  const statusDesc = nativeAvailable
    ? status === "connected" ? "Android VPNService membuka TUN. Counter byte berasal dari status CommandClient libbox." : status === "failed" ? "Baca log native di bawah, periksa inbound TUN/auto_route, izin Android, dan konektivitas endpoint." : "Tidak ada tunnel aktif saat ini. Pilih konfigurasi JSON sing-box dengan inbound TUN untuk memulai."
    : "Layar ini adalah Web Preview; VPNService Android tidak berjalan sehingga tidak ada trafik perangkat yang melewati VPN.";

  return (
    <Page>
      <PageTitle eyebrow="Kesehatan koneksi" title="Semua jelas." subtitle="Status service, konfigurasi, dan log yang tersedia di perangkat." />

      <Card style={styles.statusCard}>
        <View style={styles.statusTop}>
          <IconTile name={issue ? "alert-circle-outline" : "pulse-outline"} color={issue ? C.red : C.limeDark} background={issue ? C.paleRed : C.paleMint} size={44} />
          <View style={{ flex: 1 }}>
            <Text style={styles.statusKicker}>STATUS SAAT INI</Text>
            <Text style={styles.statusTitle}>{statusText}</Text>
          </View>
          <View style={[styles.statusOrb, issue && { backgroundColor: C.red }, status === "connected" && nativeAvailable && { backgroundColor: C.mint }]} />
        </View>
        <View style={styles.divider} />
        <Text style={styles.statusDesc}>{statusDesc}</Text>
      </Card>

      {!nativeAvailable ? <DemoNotice title="Web Preview" message="Status UI dapat dicoba, tetapi paket ini tidak membuat VPNService atau mengalihkan trafik perangkat." /> : null}

      <Card style={styles.checkCard}>
        <SectionTitle title="Pemeriksaan lokal" />
        <CheckRow icon="checkmark-circle" title="UI dan navigasi" detail="Antarmuka Expo/React Native tersedia" good />
        <CheckRow icon={configReady ? "checkmark-circle" : "alert-circle"} title="Konfigurasi sing-box" detail={configReady ? "JSON terpilih di memori sesi · TUN + auto_route ditemukan" : "Impor JSON sing-box dengan inbound TUN dan auto_route=true"} good={configReady} />
        <CheckRow icon={nativeAvailable ? "checkmark-circle" : "alert-circle"} title="Modul native Android" detail={nativeAvailable ? "Expo menemukan modul Kotlin dan binding libbox pada build ini" : "Tidak tersedia di Web Preview/Expo Go"} good={nativeAvailable} />
        <CheckRow icon={tunnelReady && trafficAvailable ? "checkmark-circle" : "alert-circle"} title="Tunnel dan statistik trafik" detail={tunnelReady ? trafficAvailable ? "Core mengirim counter byte; nilai aktual tampil di Beranda." : "TUN aktif; menunggu status trafik pertama dari libbox" : "Belum ada tunnel TUN aktif pada service"} good={tunnelReady && trafficAvailable} last />
      </Card>

      <View style={styles.logHeader}>
        <SectionTitle title="Log terbaru" action={<Text style={styles.logCount}>{events.length} ITEM</Text>} />
        {events.length > 0 ? <Pressable onPress={clearEvents} hitSlop={8}><Text style={styles.clearText}>Bersihkan</Text></Pressable> : null}
      </View>
      <Card style={styles.logCard}>
        {events.length ? events.map((event, index) => (
          <View key={event.id} style={[styles.logItem, index > 0 && styles.logDivider]}>
            <View style={[styles.logMark, { backgroundColor: toneColor(event.tone) }]} />
            <View style={styles.logCopy}>
              <View style={styles.logTitleRow}><Text style={styles.logTitle}>{event.title}</Text><Text style={styles.logTime}>{event.time}</Text></View>
              <Text style={styles.logDetail}>{event.detail}</Text>
            </View>
          </View>
        )) : <Text style={styles.emptyLog}>Belum ada aktivitas. Perubahan service akan muncul di sini.</Text>}
      </Card>

      {!nativeAvailable ? (
        <View style={styles.actionBlock}>
          <Text style={styles.actionHint}>Kontrol simulasi pratinjau:</Text>
          <View style={styles.actionRow}>
            <Pressable onPress={simulateFailure} style={({ pressed }) => [styles.testButton, pressed && { opacity: 0.8 }]}>
              <Ionicons name="warning-outline" size={15} color="#8D554E" /><Text style={styles.testButtonText}>Uji status gagal</Text>
            </Pressable>
            {issue ? <Pressable onPress={resetDemo} style={({ pressed }) => [styles.resetButton, pressed && { opacity: 0.8 }]}><Text style={styles.resetText}>Reset</Text></Pressable> : null}
          </View>
        </View>
      ) : <Text style={styles.actionHint}>Status di build Android hanya berubah dari event VPNService/libbox yang sebenarnya.</Text>}
    </Page>
  );
}

function CheckRow({ icon, title, detail, good = false, last = false }: { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; detail: string; good?: boolean; last?: boolean }) {
  return (
    <View style={[styles.checkRow, !last && styles.checkBorder]}>
      <Ionicons name={icon} size={17} color={good ? "#6A9C61" : C.warning} />
      <View style={{ flex: 1 }}><Text style={styles.checkTitle}>{title}</Text><Text style={styles.checkDetail}>{detail}</Text></View>
    </View>
  );
}

function toneColor(tone: string) {
  if (tone === "success") return C.mint;
  if (tone === "warning") return C.warning;
  if (tone === "danger") return C.red;
  return "#A7B4AC";
}

const styles = StyleSheet.create({
  statusCard: { gap: 13, borderRadius: 20 },
  statusTop: { flexDirection: "row", alignItems: "center", gap: 11 },
  statusKicker: { color: C.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  statusTitle: { color: C.ink, fontSize: 15, fontWeight: "800", marginTop: 3 },
  statusOrb: { width: 8, height: 8, borderRadius: 5, backgroundColor: C.warning },
  divider: { height: 1, backgroundColor: C.line },
  statusDesc: { color: C.muted, fontSize: 11, lineHeight: 17 },
  checkCard: { gap: 14, paddingBottom: 7 },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingBottom: 11 },
  checkBorder: { borderBottomWidth: 1, borderBottomColor: C.line },
  checkTitle: { color: C.ink, fontSize: 11, fontWeight: "800" },
  checkDetail: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  logHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logCount: { color: C.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  clearText: { color: C.limeDark, fontSize: 10, fontWeight: "800" },
  logCard: { paddingHorizontal: 14, paddingVertical: 2, borderRadius: 18 },
  logItem: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12 },
  logDivider: { borderTopWidth: 1, borderTopColor: C.line },
  logMark: { width: 7, height: 7, borderRadius: 5, marginTop: 5 },
  logCopy: { flex: 1, gap: 3 },
  logTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logTitle: { color: C.ink, fontSize: 11, fontWeight: "800", flex: 1 },
  logTime: { color: C.muted, fontSize: 9 },
  logDetail: { color: C.muted, fontSize: 10, lineHeight: 15 },
  emptyLog: { color: C.muted, fontSize: 11, lineHeight: 17, paddingVertical: 15 },
  actionBlock: { gap: 9 },
  actionHint: { color: C.muted, fontSize: 10, lineHeight: 15 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  testButton: { backgroundColor: C.paleRed, borderColor: "#EED7D2", borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 12, paddingVertical: 10 },
  testButtonText: { color: "#8D554E", fontSize: 10, fontWeight: "800" },
  resetButton: { borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, paddingHorizontal: 15, paddingVertical: 10 },
  resetText: { color: C.ink, fontSize: 10, fontWeight: "800" },
});
