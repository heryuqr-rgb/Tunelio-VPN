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

const EMPTY_PROFILE: VpnProfile = { id: "", name: "Belum ada profil", code: "—", endpoint: "Impor konfigurasi sing-box", protocol: "—", latency: "—", origin: "imported" };

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
  const [profiles, setProfiles] = useState<VpnProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [events, setEvents] = useState<VpnEvent[]>([]);
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
          setProfiles(normalized);
        }
        if (storedEvents) {
          const saved = JSON.parse(storedEvents) as VpnEvent[];
          setEvents(saved.filter((event) => !/demo|simulasi|pratinjau|profil contoh/i.test(`${event.title} ${event.detail}`)));
        }
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

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0] ?? EMPTY_PROFILE;

  const connectOrDisconnect = useCallback(() => {
    if (status === "connected" || status === "connecting") {
      setStatus("disconnected");
      setElapsedSeconds(0);
      recordEvent("Koneksi dihentikan", "Belum ada sesi VPN aktif.", "neutral");
      return;
    }
    setStatus("failed");
    setElapsedSeconds(0);
    recordEvent("VPN belum siap", "Integrasi UI dengan modul VPN native belum selesai. Tidak ada koneksi simulasi yang dibuat.", "warning");
  }, [recordEvent, status]);

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
      setSelectedProfileId("");
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
    recordEvent("VPN belum siap", "Modul VPN native belum terhubung ke antarmuka.", "warning");
  }, [recordEvent]);

  const resetDemo = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setStatus("disconnected");
    setElapsedSeconds(0);
    recordEvent("Status direset", "Status lokal kembali terputus.", "neutral");
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
