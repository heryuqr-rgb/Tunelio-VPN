import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { Card, C, DemoNotice, Divider, IconTile, Page, PageTitle, Pill } from "@/components/vpn-ui";
import { useVpn } from "@/lib/vpn-state";

export default function SettingsScreen() {
  const { preferences, setPreference, recordEvent, nativeAvailable, status, trafficAvailable } = useVpn();
  const serviceConnected = nativeAvailable && status === "connected";
  return (
    <Page>
      <PageTitle eyebrow="Preferensi" title="Atur caramu." subtitle="Pilihan dasar koneksi dan transparansi tentang build ini." />

      <Card style={styles.coreCard}>
        <View style={styles.coreRow}>
          <View style={styles.coreIcon}><Ionicons name="git-network-outline" size={22} color={C.lime} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.coreLabel}>MESIN VPN</Text>
            <Text style={styles.coreTitle}>sing-box / libbox</Text>
            <Text style={styles.coreSub}>{serviceConnected ? trafficAvailable ? "Tunnel hidup · counter byte diterima" : "Tunnel TUN aktif · menunggu trafik" : nativeAvailable ? "Modul native tersedia di build ini" : "Build Android native belum tersedia"}</Text>
          </View>
          <Pill label={serviceConnected ? "TUN AKTIF" : nativeAvailable ? "NATIVE SIAP" : "PREVIEW"} background={serviceConnected ? "#29463A" : "#314237"} color={serviceConnected ? C.mint : "#D8C08A"} />
        </View>
        <Divider />
        <Text style={styles.coreDesc}>{nativeAvailable ? "Build ini memuat modul Kotlin, libbox, dan VPNService Android. Impor konfigurasi TUN lalu setujui dialog VPN; status aktif berarti service membentuk tunnel. Uji rute dan konektivitas di perangkat sebelum mengandalkan proteksi." : "Web Preview atau Expo Go tidak memuat VPNService Android. Untuk tunnel, gunakan custom Android development build/APK yang menyertakan modul lokal; UI pratinjau tidak mengalihkan trafik perangkat."}</Text>
      </Card>

      <Text style={styles.groupTitle}>PERILAKU KONEKSI</Text>
      <Card style={styles.preferenceCard}>
        <PreferenceRow
          icon="flash-outline"
          title="Sambung otomatis"
          detail="Tersimpan lokal; belum memulai VPNService otomatis."
          value={preferences.autoConnect}
          onChange={(value) => setPreference("autoConnect", value)}
        />
        <Divider />
        <PreferenceRow
          icon="refresh-outline"
          title="Sambung ulang saat jaringan berubah"
          detail="Tersimpan lokal; kebijakan reconnect otomatis belum diterapkan."
          value={preferences.reconnectOnNetworkChange}
          onChange={(value) => setPreference("reconnectOnNetworkChange", value)}
        />
      </Card>

      <Text style={styles.groupTitle}>PRIVASI & APLIKASI</Text>
      <Card style={styles.infoCard}>
        <InfoRow icon="phone-portrait-outline" title="Target desain" detail="Layar Android portrait, sentuhan satu tangan, tata letak adaptif untuk Infinix Hot 60 Pro." />
        <Divider />
        <InfoRow icon="document-lock-outline" title="File konfigurasi" detail="Dibaca di perangkat. JSON/kredensial hanya dikirim ke modul lokal untuk membuka tunnel, tidak ke server aplikasi; impor ulang setelah sesi ditutup." />
        <Divider />
        <InfoRow icon="pulse-outline" title="Data koneksi" detail={nativeAvailable ? "Byte berasal dari status CommandClient libbox pada tunnel native; statistik tidak dibuat oleh UI." : "Web Preview tidak membaca trafik perangkat dan tidak memiliki tunnel VPN."} last />
      </Card>

      <Pressable onPress={() => recordEvent("Tentang Tunelio", nativeAvailable ? "Build Android dengan modul sing-box/libbox lokal." : "Web Preview · native VPNService tidak dimuat.", "neutral")} style={({ pressed }) => [styles.aboutRow, pressed && { opacity: 0.75 }]}>
        <Text style={styles.aboutText}>Tunelio VPN</Text><Text style={styles.version}>{nativeAvailable ? "ANDROID 0.2" : "PREVIEW 0.2"}</Text><Ionicons name="chevron-forward" size={15} color={C.muted} />
      </Pressable>
      {!nativeAvailable ? <DemoNotice compact title="Web/Expo Go" message="Pratinjau tidak dapat menggunakan VPNService Android; gunakan custom build untuk koneksi nyata." /> : null}
    </Page>
  );
}

function PreferenceRow({ icon, title, detail, value, onChange }: { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; detail: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.preferenceRow}>
      <IconTile name={icon} color={C.limeDark} background={C.paleMint} size={38} />
      <View style={styles.preferenceCopy}><Text style={styles.preferenceTitle}>{title}</Text><Text style={styles.preferenceDetail}>{detail}</Text></View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: "#D9E0D9", true: "#B9D990" }}
        thumbColor={value ? C.limeDark : "#FFFFFF"}
        ios_backgroundColor="#D9E0D9"
        accessibilityLabel={title}
      />
    </View>
  );
}

function InfoRow({ icon, title, detail, last }: { icon: React.ComponentProps<typeof Ionicons>["name"]; title: string; detail: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && { paddingBottom: 12 }]}>
      <Ionicons name={icon} size={16} color={C.limeDark} />
      <View style={{ flex: 1 }}><Text style={styles.infoTitle}>{title}</Text><Text style={styles.infoDetail}>{detail}</Text></View>
    </View>
  );
}

const styles = StyleSheet.create({
  coreCard: { backgroundColor: C.forest, borderColor: C.forest, gap: 13, padding: 15 },
  coreRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  coreIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: "#294036", alignItems: "center", justifyContent: "center" },
  coreLabel: { color: "#9FB0A5", fontSize: 8, fontWeight: "900", letterSpacing: 1.1 },
  coreTitle: { color: "#F4F6EF", fontSize: 16, fontWeight: "800", marginTop: 2 },
  coreSub: { color: "#B9C4BC", fontSize: 10, marginTop: 2 },
  coreDesc: { color: "#AFBDB3", fontSize: 10, lineHeight: 16 },
  groupTitle: { color: C.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.3, marginBottom: -10 },
  preferenceCard: { paddingVertical: 2, paddingHorizontal: 14 },
  preferenceRow: { minHeight: 77, flexDirection: "row", alignItems: "center", gap: 10 },
  preferenceCopy: { flex: 1, gap: 4 },
  preferenceTitle: { color: C.ink, fontSize: 11, fontWeight: "800" },
  preferenceDetail: { color: C.muted, fontSize: 9, lineHeight: 14 },
  infoCard: { gap: 12, paddingVertical: 14 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingTop: 1 },
  infoTitle: { color: C.ink, fontSize: 10, fontWeight: "800" },
  infoDetail: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 3 },
  aboutRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 },
  aboutText: { color: C.ink, fontSize: 10, fontWeight: "800", flex: 1 },
  version: { color: C.muted, fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },
});
