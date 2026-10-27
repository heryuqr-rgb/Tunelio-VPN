import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export type NativeVpnStatus = "disconnected" | "awaiting_permission" | "connecting" | "connected" | "failed";

export type NativeVpnSnapshot = {
  status: NativeVpnStatus;
  message: string;
  startedAt: number;
  uplinkBytes: number;
  downlinkBytes: number;
  trafficAvailable: boolean;
};

type NativeEvents = {
  onVpnStatus: (snapshot: NativeVpnSnapshot) => void;
  onVpnTraffic: (traffic: Pick<NativeVpnSnapshot, "uplinkBytes" | "downlinkBytes" | "trafficAvailable">) => void;
  onVpnLog: (entry: { message: string; level: number }) => void;
};

type NativeEventModule = {
  addListener: <EventName extends keyof NativeEvents>(
    eventName: EventName,
    listener: NativeEvents[EventName],
  ) => { remove(): void };
};

type SingBoxNativeModule = {
  connect(configJson: string): Promise<{ status: NativeVpnStatus }>;
  disconnect(): Promise<void>;
  getSnapshot(): Promise<NativeVpnSnapshot>;
};

const nativeModule = Platform.OS === "android"
  ? requireOptionalNativeModule<SingBoxNativeModule>("TunelioSingBox")
  : null;
const eventModule = nativeModule as (SingBoxNativeModule & NativeEventModule) | null;

export const isAndroidSingBoxAvailable = Platform.OS === "android" && nativeModule !== null;

export function connectSingBox(configJson: string) {
  if (!nativeModule) throw new Error("Modul VPN Android belum tersedia. Gunakan build native APK, bukan Expo Go atau pratinjau Web.");
  return nativeModule.connect(configJson);
}

export function disconnectSingBox() {
  if (!nativeModule) throw new Error("Modul VPN Android belum tersedia pada build ini.");
  return nativeModule.disconnect();
}

export function getSingBoxSnapshot() {
  if (!nativeModule) return Promise.resolve<NativeVpnSnapshot>({
    status: "disconnected",
    message: "",
    startedAt: 0,
    uplinkBytes: 0,
    downlinkBytes: 0,
    trafficAvailable: false,
  });
  return nativeModule.getSnapshot();
}

export function onSingBoxStatus(listener: (status: NativeVpnSnapshot) => void) {
  return eventModule?.addListener("onVpnStatus", listener) ?? null;
}

export function onSingBoxTraffic(listener: (traffic: Pick<NativeVpnSnapshot, "uplinkBytes" | "downlinkBytes" | "trafficAvailable">) => void) {
  return eventModule?.addListener("onVpnTraffic", listener) ?? null;
}

export function onSingBoxLog(listener: (entry: { message: string; level: number }) => void) {
  return eventModule?.addListener("onVpnLog", listener) ?? null;
}
