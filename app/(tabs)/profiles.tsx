import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import React, { useState } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Card, C, DARK, Page, PageTitle, Pill, SectionTitle } from "@/components/vpn-ui";
import { useThemeContext } from "@/lib/theme-provider";
import { useVpn, VpnProfile } from "@/lib/vpn-state";

export default function ProfilesScreen() {
  const { profiles, selectedProfileId, selectProfile, importConfig, removeProfile, renameProfile, updateProfileConfig } = useVpn();
  const { colorScheme } = useThemeContext();
  const dark = colorScheme === "dark";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageOk, setMessageOk] = useState(true);
  const [editing, setEditing] = useState<VpnProfile | null>(null);
  const [editName, setEditName] = useState("");
  const [editConfig, setEditConfig] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

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

  const openEdit = (profile: VpnProfile) => {
    setEditing(profile);
    setEditName(profile.name);
    setEditConfig(profile.rawConfig ?? "");
    setMessage("");
  };

  const saveEdit = () => {
    if (!editing) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setMessage("Nama profil tidak boleh kosong.");
      setMessageOk(false);
      return;
    }
    setSavingEdit(true);
    const configResult = updateProfileConfig(editing.id, editConfig);
    if (!configResult.ok) {
      setMessage(configResult.message);
      setMessageOk(false);
      setSavingEdit(false);
      return;
    }
    renameProfile(editing.id, trimmedName);
    setMessage("Profil berhasil diperbarui.");
    setMessageOk(true);
    setEditing(null);
    setSavingEdit(false);
  };

  const exportProfile = async (profile: VpnProfile) => {
    setMessage("");
    if (!profile.rawConfig) {
      setMessage("Isi JSON profil tidak tersedia. Impor ulang file konfigurasi terlebih dahulu.");
      setMessageOk(false);
      return;
    }
    try {
      if (Platform.OS === "android" && FileSystem.StorageAccessFramework) {
        const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted) return;
        const safeName = (profile.name.trim() || "profil").replace(/[\\/:*?"<>|]/g, "_");
        const uri = await FileSystem.StorageAccessFramework.createFileAsync(permission.directoryUri, `${safeName}.json`, "application/json");
        await FileSystem.writeAsStringAsync(uri, profile.rawConfig, { encoding: FileSystem.EncodingType.UTF8 });
        setMessage(`Profil berhasil diekspor sebagai ${safeName}.json`);
        setMessageOk(true);
        return;
      }
      const safeName = (profile.name.trim() || "profil").replace(/[^a-zA-Z0-9._-]/g, "_");
      const uri = `${FileSystem.cacheDirectory}${safeName}.json`;
      await FileSystem.writeAsStringAsync(uri, profile.rawConfig, { encoding: FileSystem.EncodingType.UTF8 });
      setMessage(`JSON disiapkan di ${uri}`);
      setMessageOk(true);
    } catch {
      setMessage("Export gagal. Coba pilih folder lain atau periksa izin penyimpanan.");
      setMessageOk(false);
    }
  };

  const imported = profiles.filter((profile) => profile.origin === "imported");

  return (
    <Page>
      <PageTitle eyebrow="Koneksi" title="Profil VPN" subtitle="Impor, simpan, edit, dan ekspor konfigurasi JSON secara lokal." />

      <Pressable onPress={chooseConfig} disabled={busy} style={({ pressed }) => [styles.importButton, pressed && styles.pressed, busy && { opacity: 0.7 }]}>
        <View style={styles.importIcon}><Ionicons name="document-text-outline" size={22} color={C.lime} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.importTitle, dark && { color: DARK.ink }]}>{busy ? "Membaca file…" : "Impor konfigurasi"}</Text>
          <Text style={[styles.importSubtitle, dark && { color: DARK.muted }]}>JSON sing-box · file tetap lokal</Text>
        </View>
        {busy ? <ActivityIndicator color={C.lime} /> : <Ionicons name="arrow-up-outline" size={19} color={C.lime} />}
      </Pressable>

      {message ? (
        <View style={[styles.messageBox, !messageOk && styles.messageError]}>
          <Ionicons name={messageOk ? "checkmark-circle" : "alert-circle"} size={17} color={messageOk ? C.limeDark : C.red} />
          <Text style={[styles.messageText, !messageOk && { color: "#994B43" }]}>{message}</Text>
          <Pressable onPress={() => setMessage("")}><Ionicons name="close" size={16} color={C.muted} /></Pressable>
        </View>
      ) : null}

      {imported.length ? (
        <>
          <SectionTitle title="Konfigurasi lokal" action={<Text style={styles.count}>{imported.length} IMPOR</Text>} />
          <View style={{ gap: 9 }}>
            {imported.map((profile) => (
              <ProfileCard key={profile.id} profile={profile} selected={profile.id === selectedProfileId}
                onSelect={() => selectProfile(profile.id)}
                onEdit={() => openEdit(profile)}
                onExport={() => void exportProfile(profile)}
                onRemove={() => removeProfile(profile.id)} />
            ))}
          </View>
          <Text style={[styles.storageNote, dark && { color: DARK.muted }]}>Nama, endpoint, dan JSON konfigurasi disimpan lokal di perangkat.</Text>
        </>
      ) : null}

      {!imported.length && !message ? <Text style={[styles.storageNote, dark && { color: DARK.muted }]}>Belum ada profil. Impor file JSON sing-box dengan inbound TUN dan auto_route=true untuk mulai.</Text> : null}
      <View style={styles.bottomSpace} />

      <Modal visible={Boolean(editing)} animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={[styles.modalRoot, dark && { backgroundColor: DARK.bg }]}>
          <Text style={[styles.modalTitle, dark && { color: DARK.ink }]}>Edit profil</Text>
          <Text style={[styles.modalLabel, dark && { color: DARK.ink }]}>Nama profil</Text>
          <TextInput value={editName} onChangeText={setEditName} autoCapitalize="none" placeholder="Nama profil" style={[styles.nameInput, dark && { backgroundColor: DARK.card, borderColor: DARK.line, color: DARK.ink }]} />
          <Text style={[styles.modalLabel, dark && { color: DARK.ink }]}>Konfigurasi JSON</Text>
          <TextInput value={editConfig} onChangeText={setEditConfig} multiline autoCapitalize="none" autoCorrect={false}
            textAlignVertical="top" placeholder='{"outbounds": [...]}' style={[styles.jsonInput, dark && { backgroundColor: DARK.card, borderColor: DARK.line, color: DARK.ink }]} />
          <Text style={[styles.modalHint, dark && { color: DARK.muted }]}>JSON akan divalidasi sebelum disimpan. Jika valid, perubahan berlaku untuk profil ini.</Text>
          <View style={styles.modalActions}>
            <Pressable style={styles.cancelButton} onPress={() => setEditing(null)}><Text style={styles.cancelText}>Batal</Text></Pressable>
            <Pressable disabled={savingEdit} style={[styles.saveButton, savingEdit && { opacity: 0.6 }]} onPress={saveEdit}><Text style={styles.saveText}>{savingEdit ? "Menyimpan…" : "Simpan"}</Text></Pressable>
          </View>
        </View>
      </Modal>
    </Page>
  );
}

function ProfileCard({ profile, selected, onSelect, onEdit, onExport, onRemove }: {
  profile: VpnProfile; selected: boolean; onSelect: () => void; onEdit: () => void; onExport: () => void; onRemove?: () => void;
}) {
  const { colorScheme } = useThemeContext();
  const dark = colorScheme === "dark";
  return (
    <Card style={[styles.profileCard, dark && { backgroundColor: DARK.card, borderColor: DARK.line }, selected && (dark ? { borderColor: DARK.limeDark, backgroundColor: "#1B2A20" } : styles.profileSelected)]}>
      <Pressable onPress={onSelect} style={({ pressed }) => [styles.profileMain, pressed && styles.pressed]}>
        <View style={[styles.locationCode, dark && { backgroundColor: DARK.bg }, selected && styles.locationCodeSelected]}><Text style={[styles.locationCodeText, dark && { color: DARK.ink }, selected && { color: C.forest }]}>{profile.code}</Text></View>
        <View style={styles.profileInfo}>
          <View style={styles.profileNameRow}>
            <Text style={[styles.profileName, { color: DARK.ink }]} numberOfLines={1}>{profile.name}</Text>
            {profile.origin === "imported" ? <Pill label="IMPOR" background="#EDF2E8" color="#687A57" style={styles.miniPill} /> : null}
          </View>
          <Text style={[styles.profileEndpoint, { color: DARK.muted }]} numberOfLines={1}>{profile.endpoint}</Text>
          <View style={styles.profileMeta}><Text style={[styles.protocol, { color: DARK.limeDark }]}>{profile.protocol}</Text><View style={styles.metaDot} /><Text style={[styles.latency, { color: DARK.muted }]}>{profile.latency}</Text></View>
          {profile.origin === "imported" && profile.configLoaded === false ? <Text style={styles.reimportHint}>Impor ulang JSON untuk memuat detail</Text> : null}
        </View>
        {selected ? <View style={styles.selectedCheck}><Ionicons name="checkmark" size={14} color={C.forest} /></View> : <View style={styles.emptyRadio} />}
      </Pressable>
      <View style={styles.actionRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${profile.name}`} onPress={onEdit} style={styles.actionButton}>
          <Ionicons name="create-outline" size={15} color={C.limeDark} /><Text style={[styles.actionText, dark && { color: DARK.limeDark }]}>Edit profil</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Export ${profile.name}`} onPress={onExport} style={styles.actionButton}>
          <Ionicons name="download-outline" size={15} color={C.limeDark} /><Text style={[styles.actionText, dark && { color: DARK.limeDark }]}>Export JSON</Text>
        </Pressable>
        {onRemove ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Hapus ${profile.name}`} onPress={onRemove} style={styles.actionButton}>
            <Ionicons name="trash-outline" size={14} color={C.red} /><Text style={[styles.actionText, { color: C.red }]}>Hapus</Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  importButton: { minHeight: 76, backgroundColor: C.forest, borderRadius: 20, paddingHorizontal: 15, paddingVertical: 13, flexDirection: "row", alignItems: "center", gap: 12 },
  importIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#294035", alignItems: "center", justifyContent: "center" },
  importTitle: { color: "#F5F7F2", fontSize: 14, fontWeight: "800" },
  importSubtitle: { color: "#A6B7AC", fontSize: 10, marginTop: 4 },
  messageBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.paleMint, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#CFE7DB" },
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
  actionRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end", gap: 8, borderTopWidth: 1, borderTopColor: C.line, marginTop: 9, paddingTop: 8 },
  actionButton: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 6, borderRadius: 9, backgroundColor: C.bg },
  actionText: { color: C.limeDark, fontSize: 10, fontWeight: "800" },
  removeButton: { alignSelf: "flex-end", flexDirection: "row", alignItems: "center", gap: 5, paddingTop: 8, paddingHorizontal: 4 },
  removeText: { color: C.red, fontSize: 10, fontWeight: "700" },
  reimportHint: { color: "#A37A3E", fontSize: 9, marginTop: 2 },
  storageNote: { color: C.muted, fontSize: 10, lineHeight: 15, marginTop: -7 },
  bottomSpace: { height: 4 },
  pressed: { opacity: 0.78 },
  modalRoot: { flex: 1, backgroundColor: "#F4F6F1", padding: 20, paddingTop: 48, gap: 12 },
  modalTitle: { color: C.ink, fontSize: 24, fontWeight: "900", marginBottom: 6 },
  modalLabel: { color: C.ink, fontSize: 12, fontWeight: "800" },
  nameInput: { borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: "#FFFFFF", paddingHorizontal: 12, paddingVertical: 11, color: C.ink },
  jsonInput: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: "#FFFFFF", padding: 12, color: C.ink, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", fontSize: 11 },
  modalHint: { color: C.muted, fontSize: 10, lineHeight: 15 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, paddingBottom: 8 },
  cancelButton: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 12, backgroundColor: C.line },
  cancelText: { color: C.ink, fontWeight: "800", fontSize: 12 },
  saveButton: { paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12, backgroundColor: C.forest },
  saveText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
});
