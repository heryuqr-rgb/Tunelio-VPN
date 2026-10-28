import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import React, { useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { Card, C, Page, PageTitle, Pill, SectionTitle } from "@/components/vpn-ui";
import { useVpn, VpnProfile } from "@/lib/vpn-state";

export default function ProfilesScreen() {
  const { profiles, selectedProfileId, selectProfile, importConfig, removeProfile } = useVpn();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageOk, setMessageOk] = useState(true);

  const chooseConfig = async () => {
    setMessage("");
    let pickedUri: string | undefined;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/json", ".json"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setBusy(true);
      const asset = result.assets[0];
      pickedUri = asset.uri;
      const raw = Platform.OS === "web"
        ? await (await fetch(asset.uri)).text()
        : await FileSystem.readAsStringAsync(asset.uri);
      const outcome = importConfig(asset.name, raw);
      setMessage(outcome.message);
      setMessageOk(outcome.ok);
    } catch {
      setMessage("File belum dapat dibaca. Pilih konfigurasi JSON sing-box yang valid.");
      setMessageOk(false);
    } finally {
      if (pickedUri && Platform.OS !== "web") {
        await FileSystem.deleteAsync(pickedUri, { idempotent: true }).catch(() => undefined);
      }
      setBusy(false);
    }
  };

  const imported = profiles.filter((profile) => profile.origin === "imported");

  return (
    <Page>
      <PageTitle eyebrow="Koneksi" title="Profil VPN" subtitle="Impor konfigurasi JSON sing-box. File dan kredensial tetap lokal." />

      <Pressable onPress={chooseConfig} disabled={busy} style={({ pressed }) => [styles.importButton, pressed && styles.pressed, busy && { opacity: 0.7 }]}>
        <View style={styles.importIcon}><Ionicons name="document-text-outline" size={22} color={C.lime} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.importTitle}>{busy ? "Membaca file…" : "Impor konfigurasi"}</Text>
          <Text style={styles.importSubtitle}>JSON sing-box · file tetap lokal</Text>
        </View>
        {busy ? <ActivityIndicator color={C.lime} /> : <Ionicons name="arrow-up-outline" size={19} color={C.lime} />}
      </Pressable>

      {message ? (
        <View style={[styles.messageBox, !messageOk && styles.messageError]}>
          <Ionicons name={messageOk ? "checkmark-circle" : "alert-circle"} size={17} color={messageOk ? C.limeDark : C.red} />
          <Text style={[styles.messageText, !messageOk && { color: "#994B43" }]}>{message}</Text>
        </View>
      ) : null}

      {imported.length ? (
        <>
          <SectionTitle title="Konfigurasi lokal" action={<Text style={styles.count}>{imported.length} IMPOR</Text>} />
          <View style={{ gap: 9 }}>
            {imported.map((profile) => (
              <ProfileCard key={profile.id} profile={profile} selected={profile.id === selectedProfileId} onSelect={() => selectProfile(profile.id)} onRemove={() => removeProfile(profile.id)} />
            ))}
          </View>
          <Text style={styles.storageNote}>Nama dan endpoint profil disimpan lokal. Isi JSON/kredensial hanya berada di memori selama sesi aplikasi dan perlu diimpor kembali setelah aplikasi ditutup.</Text>
        </>
      ) : null}

      {!imported.length && !message ? <Text style={styles.storageNote}>Belum ada profil. Impor file JSON sing-box dengan inbound TUN dan auto_route=true untuk mulai.</Text> : null}
      <View style={styles.bottomSpace} />
    </Page>
  );
}

function ProfileCard({ profile, selected, onSelect, onRemove }: { profile: VpnProfile; selected: boolean; onSelect: () => void; onRemove?: () => void }) {
  return (
    <Card style={[styles.profileCard, selected && styles.profileSelected]}>
      <Pressable onPress={onSelect} style={({ pressed }) => [styles.profileMain, pressed && styles.pressed]}>
        <View style={[styles.locationCode, selected && styles.locationCodeSelected]}><Text style={[styles.locationCodeText, selected && { color: C.forest }]}>{profile.code}</Text></View>
        <View style={styles.profileInfo}>
          <View style={styles.profileNameRow}>
            <Text style={styles.profileName} numberOfLines={1}>{profile.name}</Text>
            {profile.origin === "imported" ? <Pill label="IMPOR" background="#EDF2E8" color="#687A57" style={styles.miniPill} /> : null}
          </View>
          <Text style={styles.profileEndpoint} numberOfLines={1}>{profile.endpoint}</Text>
          <View style={styles.profileMeta}><Text style={styles.protocol}>{profile.protocol}</Text><View style={styles.metaDot} /><Text style={styles.latency}>{profile.latency}</Text></View>
          {profile.origin === "imported" && profile.configLoaded === false ? <Text style={styles.reimportHint}>Impor ulang JSON untuk memuat detail</Text> : null}
        </View>
        {selected ? <View style={styles.selectedCheck}><Ionicons name="checkmark" size={14} color={C.forest} /></View> : <View style={styles.emptyRadio} />}
      </Pressable>
      {onRemove ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Hapus ${profile.name}`} onPress={onRemove} style={styles.removeButton}>
          <Ionicons name="trash-outline" size={14} color={C.red} /><Text style={styles.removeText}>Hapus profil</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  importButton: { minHeight: 76, backgroundColor: C.forest, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 12 },
  importIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#294035", alignItems: "center", justifyContent: "center" },
  importTitle: { color: "#F5F7F2", fontSize: 14, fontWeight: "800" },
  importSubtitle: { color: "#A6B7AC", fontSize: 10, marginTop: 4 },
  messageBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: C.paleMint, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#CFE7DB" },
  messageError: { backgroundColor: C.paleRed, borderColor: "#EED5D1" },
  messageText: { flex: 1, color: "#48664E", fontSize: 11, lineHeight: 16 },
  count: { color: C.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  profileCard: { padding: 11, borderRadius: 18 },
  profileSelected: { borderColor: "#99BC67", borderWidth: 1.5, backgroundColor: "#FEFFF9" },
  profileMain: { flexDirection: "row", alignItems: "center", gap: 11, minHeight: 53 },
  locationCode: { height: 42, width: 42, borderRadius: 14, backgroundColor: C.bg, alignItems: "center", justifyContent: "center" },
  locationCodeSelected: { backgroundColor: C.lime },
  locationCodeText: { color: C.ink, fontSize: 11, fontWeight: "900", letterSpacing: 0.6 },
  profileInfo: { flex: 1, gap: 3 },
  profileNameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  profileName: { color: C.ink, fontSize: 13, fontWeight: "800", flexShrink: 1 },
  miniPill: { paddingHorizontal: 6, paddingVertical: 3 },
  profileEndpoint: { color: C.muted, fontSize: 10 },
  profileMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 1 },
  protocol: { color: C.limeDark, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: "#B7C0BA" },
  latency: { color: C.muted, fontSize: 9, fontWeight: "600" },
  selectedCheck: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: C.lime },
  emptyRadio: { width: 20, height: 20, borderRadius: 11, borderWidth: 1.5, borderColor: "#CCD5CD" },
  removeButton: { alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: 5, paddingTop: 8, paddingHorizontal: 4 },
  removeText: { color: C.red, fontSize: 10, fontWeight: "700" },
  reimportHint: { color: "#A37A3E", fontSize: 9, marginTop: 2 },
  storageNote: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: -7 },
  bottomSpace: { height: 4 },
  pressed: { opacity: 0.78 },
});
