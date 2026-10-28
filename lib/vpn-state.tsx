import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";

import {
  connectSingBox,
  disconnectSingBox,
  getSingBoxSnapshot,
  isAndroidSingBoxAvailable,
  onSingBoxLog,
  onSingBoxStatus,
  onSingBoxTraffic,
  type NativeVpnSnapshot,
} from "@/lib/singbox-native";

type ConnectionStatus = "disconnected" | "awaiting_permission" | "connecting" | "connected" | "failed";
type LogTone = "neutral" | "success" | "warning" | "danger";

export type VpnProfile = {
  id: string;
  name: string;
  code: string;
  endpoint: string;
  protocol: string;
  latency: string;
  origin: "demo" | "imported";
  configLoaded?: boolean;
  rawConfig?: string;
};

export type VpnEvent = {
  id: string;
  time: string;
  title: string;
  detail: string;
  tone: LogTone;
};

type Preferences = {
  autoConnect: boolean;
  reconnectOnNetworkChange: boolean;
  diagnosticLogs: boolean;
};

type VpnContextValue = {
  status: ConnectionStatus;
  profiles: VpnProfile[];
  selectedProfileId: string;
  selectedProfile: VpnProfile;
  events: VpnEvent[];
  preferences: Preferences;
  elapsedSeconds: number;
  uplinkBytes: number;
  downlinkBytes: number;
  trafficAvailable: boolean;
  nativeAvailable: boolean;
  connectOrDisconnect: () => void;
  selectProfile: (id: string) => void;
  importConfig: (fileName: string, rawConfig: string) => { ok: boolean; message: string };
  removeProfile: (id: string) => void;
  setPreference: (key: keyof Preferences, value: boolean) => void;
  simulateFailure: () => void;
  resetDemo: () => void;
  clearEvents: () => void;
  recordEvent: (title: string, detail: string, tone?: LogTone) => void;
};

const BASE_PROFILES: VpnProfile[] = [
  { id: "sg-04", name: "Singapura", code: "SG", endpoint: "SG-04 · Asia Pasifik", protocol: "VLESS", latency: "28 ms", origin: "demo" },
  { id: "jp-02", name: "Tokyo", code: "JP", endpoint: "JP-02 · Asia Timur", protocol: "VMess", latency: "46 ms", origin: "demo" },
  { id: "nl-01", name: "Amsterdam", code: "NL", endpoint: "NL-01 · Eropa Barat", protocol: "Trojan", latency: "168 ms", origin: "demo" },
  { id: "de-03", name: "Frankfurt", code: "DE", endpoint: "DE-03 · Eropa Tengah", protocol: "Shadowsocks", latency: "174 ms", origin: "demo" },
];

const STORAGE_KEY = "tunelio.preferences.v1";
const PROFILES_KEY = "tunelio.profiles.v1";
const EVENTS_KEY = "tunelio.events.v1";
const DEFAULT_PREFERENCES: Preferences = { autoConnect: false, reconnectOnNetworkChange: true, diagnosticLogs: false };
const VpnContext = createContext<VpnContextValue | null>(null);

function clockNow() {
  return new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function asErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Operasi VPN gagal. Periksa izin Android dan konfigurasi sing-box.";
}

function titleForNativeStatus(status: NativeVpnSnapshot["status"]) {
  switch (status) {
    case "awaiting_permission": return "Menunggu izin VPN Android";
    case "connecting": return "Core sing-box memulai";
    case "connected": return "Tunnel sing-box aktif";
    case "failed": return "Core sing-box gagal";
    default: return "Tunnel sing-box dihentikan";
  }
}

function toneForNativeStatus(status: NativeVpnSnapshot["status"]): LogTone {
  if (status === "connected") return "success";
  if (status === "failed") return "danger";
  if (status === "awaiting_permission" || status === "connecting") return "warning";
  return "neutral";
}

export function VpnProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [profiles, setProfiles] = useState<VpnProfile[]>(BASE_PROFILES);
  const [selectedProfileId, setSelectedProfileId] = useState(BASE_PROFILES[0].id);
  const [events, setEvents] = useState<VpnEvent[]>([
    { id: "startup", time: clockNow(), title: "Tunelio siap", detail: isAndroidSingBoxAvailable ? "Modul sing-box Android tersedia; impor konfigurasi TUN milikmu." : "Pratinjau UI · core VPN native belum tersedia di build ini.", tone: isAndroidSingBoxAvailable ? "neutral" : "warning" },
    { id: "profile", time: clockNow(), title: "Profil contoh dimuat", detail: "Endpoint contoh hanya untuk tampilan dan tidak dapat membuat tunnel.", tone: "neutral" },
  ]);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [uplinkBytes, setUplinkBytes] = useState(0);
  const [downlinkBytes, setDownlinkBytes] = useState(0);
  const [trafficAvailable, setTrafficAvailable] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastNativeEventRef = useRef("");

  const recordEvent = useCallback((title: string, detail: string, tone: LogTone = "neutral") => {
    const next: VpnEvent = { id: `${Date.now()}-${Math.random()}`, time: clockNow(), title, detail, tone };
    setEvents((current) => [next, ...current].slice(0, 30));
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [storedPreferences, storedProfiles, storedEvents] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(PROFILES_KEY),
          AsyncStorage.getItem(EVENTS_KEY),
        ]);
        if (!active) return;
        if (storedPreferences) setPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(storedPreferences) });
        if (storedProfiles) {
          const custom = JSON.parse(storedProfiles) as VpnProfile[];
          const normalized = custom.map((profile) => {
            const rawConfig = typeof profile.rawConfig === "string" ? profile.rawConfig : undefined;
            return { ...profile, rawConfig, configLoaded: Boolean(rawConfig) };
          });
          setProfiles([...BASE_PROFILES, ...normalized]);
        }
        if (storedEvents) setEvents(JSON.parse(storedEvents));
      } catch {
        if (active) recordEvent("Penyimpanan lokal", "Preferensi awal digunakan.", "warning");
      } finally {
        if (active) setHydrated(true);
      }
    })();
    return () => { active = false; };
  }, [recordEvent]);

  useEffect(() => {
    if (!hydrated) return;
    const custom = profiles.filter((profile) => profile.origin === "imported");
    void AsyncStorage.multiSet([
      [STORAGE_KEY, JSON.stringify(preferences)],
      [PROFILES_KEY, JSON.stringify(custom)],
      [EVENTS_KEY, JSON.stringify(events)],
    ]).catch(() => undefined);
  }, [hydrated, preferences, profiles, events]);

  useEffect(() => {
    if (status !== "connected") return;
    const timer = setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (!isAndroidSingBoxAvailable) return;
    let active = true;
    const applySnapshot = (snapshot: NativeVpnSnapshot, record: boolean) => {
      if (!active) return;
      setStatus(snapshot.status);
      setUplinkBytes(snapshot.uplinkBytes);
      setDownlinkBytes(snapshot.downlinkBytes);
      setTrafficAvailable(snapshot.trafficAvailable);
      if (snapshot.status === "connected" && snapshot.startedAt > 0) {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - snapshot.startedAt) / 1000)));
      } else if (snapshot.status !== "connected") {
        setElapsedSeconds(0);
      }
      const eventKey = `${snapshot.status}|${snapshot.message}`;
      if (record && snapshot.message && eventKey !== lastNativeEventRef.current) {
        lastNativeEventRef.current = eventKey;
        recordEvent(titleForNativeStatus(snapshot.status), snapshot.message, toneForNativeStatus(snapshot.status));
      }
    };

    const statusSubscription = onSingBoxStatus((snapshot) => applySnapshot(snapshot, true));
    const trafficSubscription = onSingBoxTraffic((traffic) => {
      if (!active) return;
      setUplinkBytes(traffic.uplinkBytes);
      setDownlinkBytes(traffic.downlinkBytes);
      setTrafficAvailable(traffic.trafficAvailable);
    });
    const logSubscription = preferences.diagnosticLogs ? onSingBoxLog((entry) => {
      if (!active || !entry.message.trim()) return;
      const tone: LogTone = entry.level >= 4 ? "danger" : entry.level === 3 ? "warning" : "neutral";
      recordEvent("sing-box · log", entry.message, tone);
    }) : null;

    void getSingBoxSnapshot()
      .then((snapshot) => applySnapshot(snapshot, snapshot.status !== "disconnected" || Boolean(snapshot.message)))
      .catch((error: unknown) => recordEvent("Status native tidak tersedia", asErrorMessage(error), "warning"));

    return () => {
      active = false;
      statusSubscription?.remove();
      trafficSubscription?.remove();
      logSubscription?.remove();
    };
  }, [recordEvent, preferences.diagnosticLogs]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0] ?? BASE_PROFILES[0];

  const connectOrDisconnect = useCallback(() => {
    if (isAndroidSingBoxAvailable) {
      if (status === "connected" || status === "connecting" || status === "awaiting_permission") {
        void disconnectSingBox().catch((error: unknown) => {
          setStatus("failed");
          recordEvent("VPN gagal dihentikan", asErrorMessage(error), "danger");
        });
        return;
      }
      if (selectedProfile.origin !== "imported" || !selectedProfile.rawConfig) {
        setStatus("failed");
        recordEvent("Konfigurasi diperlukan", "Impor konfigurasi sing-box milikmu dengan inbound TUN dan auto_route sebelum menghubungkan.", "warning");
        return;
      }
      setStatus("awaiting_permission");
      setElapsedSeconds(0);
      setUplinkBytes(0);
      setDownlinkBytes(0);
      setTrafficAvailable(false);
      recordEvent("Meminta izin VPN Android", "Tinjau dialog sistem Android sebelum trafik dialihkan melalui TUN.", "warning");
      void connectSingBox(selectedProfile.rawConfig)
        .then((result) => setStatus(result.status))
        .catch((error: unknown) => {
          setStatus("failed");
          recordEvent("Koneksi native gagal", asErrorMessage(error), "danger");
        });
      return;
    }

    if (Platform.OS !== "web") {
      setStatus("failed");
      recordEvent("Build native belum tersedia", "VPN sungguhan memerlukan APK Android yang memasukkan modul sing-box; Expo Go tidak dapat memuat VpnService.", "danger");
      return;
    }

    if (status === "connecting") {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      setStatus("disconnected");
      recordEvent("Proses dibatalkan", "Transisi koneksi pratinjau dihentikan.", "neutral");
      return;
    }
    if (status === "connected") {
      setStatus("disconnected");
      setElapsedSeconds(0);
      recordEvent("Sesi simulasi berakhir", "Web Preview tidak memiliki tunnel VPN perangkat.", "neutral");
      return;
    }
    setStatus("connecting");
    setElapsedSeconds(0);
    recordEvent("Menghubungkan (simulasi Web)", `${selectedProfile.code} · ${selectedProfile.name}`, "warning");
    timerRef.current = setTimeout(() => {
      setStatus("connected");
      timerRef.current = null;
      recordEvent("Simulasi Web tersambung", "Tidak ada lalu lintas perangkat yang melewati VPN.", "success");
    }, 900);
  }, [recordEvent, selectedProfile, status]);

  const selectProfile = useCallback((id: string) => {
    const profile = profiles.find((item) => item.id === id);
    if (!profile) return;
    if (status === "connecting" || status === "connected" || status === "awaiting_permission") {
      if (isAndroidSingBoxAvailable) void disconnectSingBox().catch(() => undefined);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      setStatus("disconnected");
      setElapsedSeconds(0);
      setUplinkBytes(0);
      setDownlinkBytes(0);
    }
    setSelectedProfileId(id);
    recordEvent("Profil dipilih", `${profile.code} · ${profile.name}`, "neutral");
  }, [profiles, recordEvent, status]);

  const importConfig = useCallback((fileName: string, rawConfig: string) => {
    try {
      const parsed: unknown = JSON.parse(rawConfig);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray((parsed as { outbounds?: unknown }).outbounds)) {
        return { ok: false, message: "Format belum dikenali. Impor file JSON sing-box dengan array outbounds." };
      }
      const root = parsed as { outbounds: unknown[]; inbounds?: unknown };
      const eligible = root.outbounds.find((value): value is Record<string, unknown> => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return false;
        const outbound = value as Record<string, unknown>;
        const type = String(outbound.type ?? "").toLowerCase();
        return !["direct", "block", "dns", "reject", "pass", "selector", "urltest", "url-test", "dns-out"].includes(type)
          && (typeof outbound.server === "string" || typeof outbound.server_port === "number");
      });
      if (!eligible) return { ok: false, message: "File JSON terbaca, tetapi tidak ada outbound server yang bisa ditampilkan." };
      const inbounds = Array.isArray(root.inbounds) ? root.inbounds : [];
      const hasRoutedTun = inbounds.some((value) => value && typeof value === "object" && !Array.isArray(value)
        && (value as Record<string, unknown>).type === "tun"
        && (value as Record<string, unknown>).auto_route === true);
      if (!hasRoutedTun) return { ok: false, message: "Tambahkan inbound type=tun dengan auto_route=true agar trafik perangkat dapat masuk ke VPN." };

      const baseName = fileName.replace(/\.[^.]+$/, "").trim();
      const profile: VpnProfile = {
        id: `import-${Date.now()}`,
        name: typeof eligible.tag === "string" && eligible.tag.trim() ? eligible.tag : (baseName || "Profil impor"),
        code: "IMP",
        endpoint: typeof eligible.server === "string" && eligible.server.trim() ? eligible.server : "Endpoint tersimpan di JSON",
        protocol: typeof eligible.type === "string" ? eligible.type.toUpperCase() : "custom",
        latency: "—",
        origin: "imported",
        configLoaded: true,
        rawConfig,
      };
      setProfiles((current) => [...current, profile]);
      setSelectedProfileId(profile.id);
      recordEvent("Konfigurasi TUN dibaca", `${profile.name} · kredensial hanya dikirim ke modul VPN lokal saat tersambung`, "success");
      return { ok: true, message: `${profile.name} siap. Konfigurasi disimpan di memori sesi dan tidak dikirim ke server.` };
    } catch {
      return { ok: false, message: "JSON tidak valid. Periksa file konfigurasi lalu coba lagi." };
    }
  }, [recordEvent]);

  const removeProfile = useCallback((id: string) => {
    const profile = profiles.find((item) => item.id === id);
    if (!profile || profile.origin !== "imported") return;
    const wasSelected = selectedProfileId === id;
    setProfiles((current) => current.filter((item) => item.id !== id));
    if (wasSelected) {
      if (isAndroidSingBoxAvailable && (status === "connected" || status === "connecting" || status === "awaiting_permission")) {
        void disconnectSingBox().catch(() => undefined);
      }
      setSelectedProfileId(BASE_PROFILES[0].id);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      setStatus("disconnected");
      setElapsedSeconds(0);
      setUplinkBytes(0);
      setDownlinkBytes(0);
    }
    recordEvent("Profil impor dihapus", wasSelected ? `${profile.name} · sesi dihentikan` : profile.name, "neutral");
  }, [profiles, recordEvent, selectedProfileId, status]);

  const setPreference = useCallback((key: keyof Preferences, value: boolean) => {
    setPreferences((current) => ({ ...current, [key]: value }));
    const detail = isAndroidSingBoxAvailable
      ? "Disimpan lokal; layanan Android belum menerapkan kebijakan ini secara otomatis."
      : "Disimpan lokal; belum mengendalikan koneksi pratinjau.";
    recordEvent("Preferensi diperbarui", `${key === "autoConnect" ? "Sambung otomatis" : key === "reconnectOnNetworkChange" ? "Koneksi ulang saat jaringan berubah" : "Log diagnostik"} · ${detail}`, "neutral");
  }, [recordEvent]);

  const simulateFailure = useCallback(() => {
    if (isAndroidSingBoxAvailable) {
      recordEvent("Mode uji simulasi dinonaktifkan", "Status Android hanya berubah dari event VPNService/sing-box nyata.", "warning");
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setStatus("failed");
    setElapsedSeconds(0);
    recordEvent("Uji gagal (simulasi Web)", "Mode pratinjau tidak menginisiasi VPNService Android.", "danger");
  }, [recordEvent]);

  const resetDemo = useCallback(() => {
    if (isAndroidSingBoxAvailable) {
      void disconnectSingBox().catch((error: unknown) => recordEvent("VPN gagal dihentikan", asErrorMessage(error), "danger"));
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setStatus("disconnected");
    setElapsedSeconds(0);
    recordEvent("Status direset", "Mode demo kembali ke keadaan terputus.", "neutral");
  }, [recordEvent]);

  const clearEvents = useCallback(() => setEvents([]), []);

  const value = useMemo<VpnContextValue>(() => ({
    status, profiles, selectedProfileId, selectedProfile, events, preferences, elapsedSeconds,
    uplinkBytes, downlinkBytes, trafficAvailable, nativeAvailable: isAndroidSingBoxAvailable,
    connectOrDisconnect, selectProfile, importConfig, removeProfile, setPreference,
    simulateFailure, resetDemo, clearEvents, recordEvent,
  }), [status, profiles, selectedProfileId, selectedProfile, events, preferences, elapsedSeconds,
    uplinkBytes, downlinkBytes, trafficAvailable, connectOrDisconnect, selectProfile,
    importConfig, removeProfile, setPreference, simulateFailure, resetDemo, clearEvents, recordEvent]);

  return <VpnContext.Provider value={value}>{children}</VpnContext.Provider>;
}

export function useVpn() {
  const value = useContext(VpnContext);
  if (!value) throw new Error("useVpn must be used inside VpnProvider");
  return value;
}

export function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}
