import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C } from "@/components/vpn-ui";
import { VpnProvider } from "@/lib/vpn-state";

const TAB_ICONS = {
  index: "shield-checkmark-outline",
  profiles: "globe-outline",
  activity: "pulse-outline",
  settings: "options-outline",
} as const;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 8);
  return (
    <VpnProvider>
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: C.limeDark,
          tabBarInactiveTintColor: "#96A29B",
          tabBarLabelStyle: { fontSize: 10, fontWeight: "700", marginTop: 1 },
          tabBarIcon: ({ color, size }) => {
            const icon = TAB_ICONS[route.name as keyof typeof TAB_ICONS] ?? "ellipse-outline";
            return <Ionicons name={icon as React.ComponentProps<typeof Ionicons>["name"]} size={size + 1} color={color} />;
          },
          tabBarStyle: {
            height: 58 + bottomPadding,
            paddingTop: 8,
            paddingBottom: bottomPadding,
            backgroundColor: "#FFFFFF",
            borderTopColor: "#E7ECE5",
            borderTopWidth: 1,
            elevation: 0,
          },
        })}
      >
        <Tabs.Screen name="index" options={{ title: "Utama" }} />
        <Tabs.Screen name="profiles" options={{ title: "Profil" }} />
        <Tabs.Screen name="activity" options={{ title: "Diagnostik" }} />
        <Tabs.Screen name="settings" options={{ title: "Setelan" }} />
      </Tabs>
    </VpnProvider>
  );
}
