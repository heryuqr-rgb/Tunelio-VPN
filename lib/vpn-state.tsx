import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { EventEmitter, requireOptionalNativeModule } from "expo-modules-core";

type NativeVpnApi = { connect: (configJson: string) => Promise<{ status: string }>; disconnect: () => Promise<void>; getSnapshot: () => { status?: string; message?: string } };
const nativeVpn = Platform.OS === "android" ? requireOptionalNativeModule<NativeVpnApi>("TunelioSingBox") : null;
const nativeVpnEvents = nativeVpn ? new EventEmitter(nativeVpn as never) : null;

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
  uplinkBytes: number;
  downlinkBytes: number;
  trafficAvailable: boolean;
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

function prepareTunnelConfig(rawConfig: string): string {
  const config = JSON.parse(rawConfig) as Record<string, any>;
  if (!Array.isArray(config.outbounds) || config.outbounds.length === 0) {
    throw new Error("Konfigurasi harus memiliki outbound sing-box.");
  }
  const inbounds = Array.isArray(config.inbounds) ? config.inbounds : [];
  const tunInbound = inbounds.find((item: any) => item?.type === "tun");
  if (tunInbound) {
    tunInbound.auto_route = true;
    if (tunInbound.strict_route === undefined) tunInbound.strict_route = true;
  } else {
    inbounds.push({
      type: "tun",
      tag: "tun-in",
      interface_name: "tun0",
      address: ["172.19.0.1/30", "fdfe:dcba:9876::1/126"],
      mtu: 9000,
      auto_route: true,
      strict_route: true,
      stack: "system"
    });
  }
  config.inbounds = inbounds;
  config.route = {
    ...(config.route && typeof config.route === "object" ? config.route : {}),
    auto_detect_interface: true
  };
  return JSON.stringify(config);
}

function normalizeImportedConfig(rawConfig: string): string {
  const trimmed = rawConfig.trim();
  if (!/^vless:\/\//i.test(trimmed)) return rawConfig;

  const uri = new URL(trimmed);
  const uuid = decodeURIComponent(uri.username);
  const server = uri.hostname;
  const serverPort = Number(uri.port || (uri.searchParams.get("security") === "tls" ? 443 : 80));
  if (!uuid || !server || !Number.isInteger(serverPort) || serverPort < 1 || serverPort > 65535) {
    throw new Error("Link VLESS tidak lengkap: periksa UUID, server, dan port.");
  }

  const security = (uri.searchParams.get("security") || "none").toLowerCase();
  const outbound: Record<string, any> = {
    type: "vless",
    tag: "proxy",
    server,
    server_port: serverPort,
    uuid,
    packet_encoding: "xudp",
  };
  const flow = uri.searchParams.get("flow");
  if (flow) outbound.flow = flow;

  if (security === "tls" || security === "reality") {
    const tls: Record<string, any> = {
      enabled: true,
      server_name: uri.searchParams.get("sni") || uri.searchParams.get("servername") || uri.searchParams.get("host") || server,
      insecure: ["1", "true"].includes((uri.searchParams.get("allowInsecure") || uri.searchParams.get("insecure") || "").toLowerCase()),
    };
    if (security === "reality") {
      const publicKey = uri.searchParams.get("pbk") || uri.searchParams.get("publicKey");
      const shortId = uri.searchParams.get("sid") || uri.searchParams.get("shortId");
      if (publicKey) tls.reality = { enabled: true, public_key: publicKey, ...(shortId ? { short_id: shortId } : {}) };
    }
    outbound.tls = tls;
  }

  const transport = (uri.searchParams.get("type") || "tcp").toLowerCase();
  if (transport === "ws") {
    const wsPath = uri.searchParams.get("path") || "/";
    const host = uri.searchParams.get("host");
    outbound.transport = { type: "ws", path: wsPath, ...(host ? { headers: { Host: host } } : {}) };
  } else if (transport === "grpc") {
    outbound.transport = { type: "grpc", service_name: uri.searchParams.get("serviceName") || uri.searchParams.get("service_name") || "" };
  } else if (transport !== "tcp") {
    throw new Error(`Transport VLESS "${transport}" belum didukung oleh impor tautan.`);
  }

  const fragment = uri.hash ? decodeURIComponent(uri.hash.slice(1)) : "";
  return JSON.stringify({
    log: { level: "info" },
    dns: { servers: [{ tag: "cloudflare", address: "1.1.1.1" }] },
    outbounds: [outbound, { type: "direct", tag: "direct" }],
    route: { final: "proxy", auto_detect_interface: true },
    _profile_name: fragment || server,
  });
}

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
  const [uplinkBytes, setUplinkBytes] = useState(0);
  const [downlinkBytes, setDownlinkBytes] = useState(0);
  const [trafficAvailable, setTrafficAvailable] = useState(false);
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

  useEffect(() => {
    if (!nativeVpnEvents) return;
    const statusSub = nativeVpnEvents.addListener("onVpnStatus", (event: { status?: string; message?: string }) => {
      const next = event?.status;
      if (next === "connected") setStatus("connected");
      else if (next === "connecting" || next === "awaiting_permission") setStatus("connecting");
      else if (next === "failed" || next === "error") setStatus("failed");
      else if (next === "disconnected" || next === "stopped") setStatus("disconnected");
      if (event?.message) recordEvent("Status VPN", event.message, next === "connected" ? "success" : next === "failed" ? "danger" : "neutral");
      if (next !== "connected") setElapsedSeconds(0);
    });
    const trafficSub = nativeVpnEvents.addListener("onVpnTraffic", (event: { uplinkBytes?: number; downlinkBytes?: number; trafficAvailable?: boolean }) => {
      setUplinkBytes(Number(event?.uplinkBytes ?? 0));
      setDownlinkBytes(Number(event?.downlinkBytes ?? 0));
      setTrafficAvailable(Boolean(event?.trafficAvailable));
    });
    const logSub = nativeVpnEvents.addListener("onVpnLog", (event: { message?: string; level?: string }) => {
      if (event?.message) recordEvent("Log VPN", event.message, /error|fatal/i.test(event.level ?? "") ? "danger" : "neutral");
    });
    return () => { statusSub.remove(); trafficSub.remove(); logSub.remove(); };
  }, [recordEvent]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? profiles[0] ?? EMPTY_PROFILE;

  const connectOrDisconnect = useCallback(() => {
    if (status === "connected" || status === "connecting") {
      if (!nativeVpn) {
        setStatus("disconnected");
        setElapsedSeconds(0);
        recordEvent("VPN terputus", "Modul VPN native tidak tersedia pada build ini.", "warning");
        return;
      }
      void nativeVpn.disconnect().then(() => {
        setStatus("disconnected");
        setElapsedSeconds(0);
        recordEvent("VPN diputus", "Permintaan putus dikirim ke layanan VPN Android.", "neutral");
      }).catch((error) => {
        setStatus("failed");
        recordEvent("Gagal memutus VPN", String(error), "danger");
      });
      return;
    }
    if (!selectedProfile.rawConfig) {
      setStatus("failed");
      setElapsedSeconds(0);
      recordEvent("Konfigurasi perlu diimpor ulang", "Profil tersimpan hanya menyimpan ringkasan. Impor ulang file JSON sebelum menyambungkan.", "warning");
      return;
    }
    if (!nativeVpn) {
      setStatus("failed");
      setElapsedSeconds(0);
      recordEvent("Modul VPN tidak tersedia", "Build Android ini tidak memuat modul TunelioSingBox. Periksa autolinking dan native build.", "danger");
      return;
    }
    setStatus("connecting");
    setElapsedSeconds(0);
    recordEvent("Memulai VPN", "Memvalidasi konfigurasi dan meminta izin VPN Android.", "neutral");
    let tunnelConfig: string;
    try {
      tunnelConfig = prepareTunnelConfig(selectedProfile.rawConfig);
    } catch (error) {
      setStatus("failed");
      recordEvent("Konfigurasi tidak valid", String(error instanceof Error ? error.message : error), "danger");
      return;
    }
    void nativeVpn.connect(tunnelConfig).then((result) => {
      recordEvent("Izin VPN diperlukan", "Setujui dialog koneksi VPN Android untuk melanjutkan.", "warning");
      if (result?.status !== "awaiting_permission") setStatus("connecting");
    }).catch((error) => {
      setStatus("failed");
      recordEvent("Koneksi gagal", String(error instanceof Error ? error.message : error), "danger");
    });
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
      const normalizedConfig = normalizeImportedConfig(rawConfig);
      const parsed: unknown = JSON.parse(normalizedConfig);
      if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { outbounds?: unknown }).outbounds)) {
        return { ok: false, message: "Format belum dikenali. Impor JSON sing-box atau satu tautan vless://." };
      }
      const root = parsed as { outbounds: unknown[]; _profile_name?: string };
      const eligible = root.outbounds.find((value): value is Record<string, unknown> => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return false;
        const outbound = value as Record<string, unknown>;
        const type = String(outbound.type ?? "").toLowerCase();
        return !["direct", "block", "dns", "reject", "pass", "selector", "urltest", "url-test", "dns-out"].includes(type)
          && (typeof outbound.server === "string" || typeof outbound.server_port === "number");
      });
      if (!eligible) return { ok: false, message: "File JSON terbaca, tetapi tidak ada outbound server yang bisa ditampilkan." };
      const baseName = (root._profile_name || fileName.replace(/\.[^.]+$/, "")).trim();
      const profile: VpnProfile = {
        id: `import-${Date.now()}`,
        name: typeof eligible.tag === "string" && eligible.tag.trim() ? eligible.tag : (baseName || "Profil impor"),
        code: "IMP",
        endpoint: typeof eligible.server === "string" && eligible.server.trim() ? eligible.server : "Endpoint tersimpan di JSON",
        protocol: typeof eligible.type === "string" ? eligible.type.toUpperCase() : "custom",
        latency: "—",
        origin: "imported",
        configLoaded: true,
        rawConfig: normalizedConfig,
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
    status, profiles, selectedProfileId, selectedProfile, events, preferences, elapsedSeconds, uplinkBytes, downlinkBytes, trafficAvailable,
    connectOrDisconnect, selectProfile, importConfig, removeProfile, setPreference,
    simulateFailure, resetDemo, clearEvents, recordEvent,
  }), [status, profiles, selectedProfileId, selectedProfile, events, preferences, elapsedSeconds, uplinkBytes, downlinkBytes, trafficAvailable,
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

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
