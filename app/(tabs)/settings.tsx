import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { Card, C, DemoNotice, Divider, IconTile, Page, PageTitle, Pill } from "@/components/vpn-ui";
import { useVpn } from "@/lib/vpn-state";

export default function SettingsScreen() {
  const { preferences, setPreference, recordEvent } = useVpn();
  return (
    <Page>
      <PageTitle eyebrow="Preferensi" title="Atur caramu." subtitle="Pilihan dasar koneksi dan transparansi tentang build ini." />

      <Card style={styles.coreCard}>
        <View style={styles.coreRow}>
          <View style={styles.coreIcon}><Ionicons name="git-network-outline" size={22} color={C.lime} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.coreLabel}>MESIN VPN</Text>
            <Text style={styles.coreTitle}>sing-box</Text>
            <Text style={styles.coreSub}>Integrasi native belum tersedia</Text>
          </View>
          <Pill label="BELUM AKTIF" background="#314237" color="#D8C08A" />
        </View>
        <Divider />
        <Text style={styles.coreDesc}>Antarmuka ini sudah menyiapkan alur profil dan status. Untuk tunnel Android sungguhan, proyek masih memerlukan libbox, VPNService, izin sistem, serta pengujian build native pada perangkat.</Text>
      </Card>

      <Text style={styles.groupTitle}>PERILAKU KONEKSI</Text>
      <Card style={styles.preferenceCard}>
        <PreferenceRow
          icon="flash-outline"
          title="Sambung otomatis"
          detail="Mulai saat aplikasi dibuka (siap untuk integrasi native)"
          value={preferences.autoConnect}
          onChange={(value) => setPreference("autoConnect", value)}
        />
        <Divider />
        <PreferenceRow
          icon="refresh-outline"
          title="Sambung ulang saat jaringan berubah"
          detail="Preferensi disimpan lokal; belum mengendalikan tunnel."
          value={preferences.reconnectOnNetworkChange}
          onChange={(value) => setPreference("reconnectOnNetworkChange", value)}
        />
      </Card>

      <Text style={styles.groupTitle}>PRIVASI & APLIKASI</Text>
      <Card style={styles.infoCard}>
        <InfoRow icon="phone-portrait-outline" title="Target desain" detail="Layar Android portrait, sentuhan satu tangan, tata letak adaptif." />
        <Divider />
        <InfoRow icon="document-lock-outline" title="File konfigurasi" detail="Dibaca di perangkat. Isi JSON tidak dikirim ke server; perlu impor ulang setelah aplikasi ditutup." />
        <Divider />
        <InfoRow icon="information-circle-outline" title="Data koneksi" detail="Lokasi, ping, durasi, dan trafik contoh hanya data tampilan pratinjau." last />
      </Card>

      <Pressable onPress={() => recordEvent("Tentang Tunelio", "Versi pratinjau UI · belum terhubung ke tunnel native.", "neutral")} style={({ pressed }) => [styles.aboutRow, pressed && { opacity: 0.75 }]}>
        <Text style={styles.aboutText}>Tunelio VPN</Text><Text style={styles.version}>PREVIEW 0.1</Text><Ionicons name="chevron-forward" size={15} color={C.muted} />
      </Pressable>
      <DemoNotice compact />
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
