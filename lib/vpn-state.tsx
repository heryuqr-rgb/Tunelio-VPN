import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "failed";
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
};

type VpnContextValue = {
  status: ConnectionStatus;
  profiles: VpnProfile[];
  selectedProfileId: string;
  selectedProfile: VpnProfile;
  events: VpnEvent[];
  preferences: Preferences;
  elapsedSeconds: number;
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
const DEFAULT_PREFERENCES: Preferences = { autoConnect: false, reconnectOnNetworkChange: true };
const VpnContext = createContext<VpnContextValue | null>(null);

function clockNow() {
  return new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function VpnProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [profiles, setProfiles] = useState<VpnProfile[]>(BASE_PROFILES);
  const [selectedProfileId, setSelectedProfileId] = useState(BASE_PROFILES[0].id);
  const [events, setEvents] = useState<VpnEvent[]>([
    { id: "startup", time: clockNow(), title: "Tunelio siap", detail: "Mode pratinjau · tunnel sing-box belum terpasang", tone: "warning" },
    { id: "profile", time: clockNow(), title: "Profil contoh dimuat", detail: "SG-04 · endpoint demo", tone: "neutral" },
  ]);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          const normalized = custom.map((profile) => ({ ...profile, rawConfig: undefined, configLoaded: false }));
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
    const custom = profiles.filter((profile) => profile.origin === "imported").map(({ rawConfig: _secret, configLoaded: _loaded, ...profile }) => ({ ...profile, configLoaded: false }));
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

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0] ?? BASE_PROFILES[0];

  const connectOrDisconnect = useCallback(() => {
    if (status === "connecting") {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      setStatus("disconnected");
      recordEvent("Proses dibatalkan", "Simulasi koneksi dihentikan oleh pengguna.", "neutral");
      return;
    }
    if (status === "connected") {
      setStatus("disconnected");
      setElapsedSeconds(0);
      recordEvent("Sesi simulasi berakhir", "Tidak ada tunnel VPN aktif pada build pratinjau ini.", "neutral");
      return;
    }
    setStatus("connecting");
    setElapsedSeconds(0);
    recordEvent("Menghubungkan (simulasi)", `${selectedProfile.code} · ${selectedProfile.name}`, "warning");
    timerRef.current = setTimeout(() => {
      setStatus("connected");
      timerRef.current = null;
      recordEvent("Simulasi tersambung", "Status demo aktif; lalu lintas perangkat belum melewati sing-box.", "success");
    }, 900);
  }, [recordEvent, selectedProfile, status]);

  const selectProfile = useCallback((id: string) => {
    const profile = profiles.find((item) => item.id === id);
    if (!profile) return;
    if (status === "connecting" || status === "connected") {
      setStatus("disconnected");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      setElapsedSeconds(0);
    }
    setSelectedProfileId(id);
    recordEvent("Profil dipilih", `${profile.code} · ${profile.name}`, "neutral");
  }, [profiles, recordEvent, status]);

  const importConfig = useCallback((fileName: string, rawConfig: string) => {
    try {
      const parsed: unknown = JSON.parse(rawConfig);
      if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { outbounds?: unknown }).outbounds)) {
        return { ok: false, message: "Format belum dikenali. Impor file JSON dengan array outbounds sing-box." };
      }
      const root = parsed as { outbounds: unknown[] };
      const eligible = root.outbounds.find((value): value is Record<string, unknown> => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return false;
        const outbound = value as Record<string, unknown>;
        const type = String(outbound.type ?? "").toLowerCase();
        return !["direct", "block", "dns", "reject", "pass", "selector", "urltest", "url-test", "dns-out"].includes(type)
          && (typeof outbound.server === "string" || typeof outbound.server_port === "number");
      });
      if (!eligible) return { ok: false, message: "File JSON terbaca, tetapi tidak ada outbound server yang bisa ditampilkan." };
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
      recordEvent("Konfigurasi dibaca", `${profile.name} · data tetap lokal di sesi ini`, "success");
      return { ok: true, message: `${profile.name} berhasil dibaca. Kredensial tidak dikirim ke server.` };
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
      setSelectedProfileId(BASE_PROFILES[0].id);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      setStatus("disconnected");
      setElapsedSeconds(0);
    }
    recordEvent("Profil impor dihapus", wasSelected ? `${profile.name} · sesi demo dihentikan` : profile.name, "neutral");
  }, [profiles, recordEvent, selectedProfileId]);

  const setPreference = useCallback((key: keyof Preferences, value: boolean) => {
    setPreferences((current) => ({ ...current, [key]: value }));
    recordEvent("Preferensi diperbarui", key === "autoConnect" ? "Sambung otomatis" : "Koneksi ulang saat jaringan berubah", "neutral");
  }, [recordEvent]);

  const simulateFailure = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setStatus("failed");
    setElapsedSeconds(0);
    recordEvent("Uji gagal (simulasi)", "Belum ada core native yang menginisiasi VPNService Android.", "danger");
  }, [recordEvent]);

  const resetDemo = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setStatus("disconnected");
    setElapsedSeconds(0);
    recordEvent("Status direset", "Mode demo kembali ke keadaan terputus.", "neutral");
  }, [recordEvent]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  const value = useMemo<VpnContextValue>(() => ({
    status, profiles, selectedProfileId, selectedProfile, events, preferences, elapsedSeconds,
    connectOrDisconnect, selectProfile, importConfig, removeProfile, setPreference,
    simulateFailure, resetDemo, clearEvents, recordEvent,
  }), [status, profiles, selectedProfileId, selectedProfile, events, preferences, elapsedSeconds,
    connectOrDisconnect, selectProfile, importConfig, removeProfile, setPreference,
    simulateFailure, resetDemo, clearEvents, recordEvent]);

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
