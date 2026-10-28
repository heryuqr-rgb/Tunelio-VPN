import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { ScrollView, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeContext } from "@/lib/theme-provider";

export const DARK = { bg: "#0B110E", card: "#151E19", ink: "#EDF4EE", muted: "#A0AEA5", line: "#2A3930", forest: "#101B16", paleMint: "#1D3429", paleYellow: "#382F1D", paleRed: "#3A2522", limeDark: "#B9E66A" };

export const C = {
  bg: "#F4F6F1",
  card: "#FFFFFF",
  ink: "#13201D",
  muted: "#82908A",
  line: "#E5EAE3",
  forest: "#13241F",
  forest2: "#1B3028",
  lime: "#B9E66A",
  limeDark: "#476521",
  mint: "#76D7BD",
  warning: "#E6B45D",
  red: "#D97A70",
  paleMint: "#E7F5EF",
  paleYellow: "#FBF3DE",
  paleRed: "#F8EAE7",
};

export function Page({ children, contentStyle, scroll = true }: { children: React.ReactNode; contentStyle?: StyleProp<ViewStyle>; scroll?: boolean }) {
  const { colorScheme } = useThemeContext();
  const dark = colorScheme === "dark";
  return (
    <SafeAreaView style={[styles.safe, dark && { backgroundColor: DARK.bg }]} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, contentStyle]}>
          {children}
        </ScrollView>
      ) : <View style={[styles.content, { flex: 1 }, contentStyle]}>{children}</View>}
    </SafeAreaView>
  );
}

export function BrandHeader({ rightLabel = "PRATINJAU" }: { rightLabel?: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <View style={styles.brandIcon}>
          <Ionicons name="shield-checkmark" size={18} color={C.lime} />
        </View>
        <View>
          <Text style={styles.brandName}>tunelio</Text>
          <Text style={styles.brandCaption}>PRIVACY, SIMPLIFIED</Text>
        </View>
      </View>
      <View style={styles.previewBadge}>
        <View style={styles.previewDot} />
        <Text style={styles.previewText}>{rightLabel}</Text>
      </View>
    </View>
  );
}

export function PageTitle({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) {
  const { colorScheme } = useThemeContext();
  const dark = colorScheme === "dark";
  return (
    <View style={styles.pageTitle}>
      <Text style={[styles.eyebrow, dark && { color: DARK.limeDark }]}>{eyebrow.toUpperCase()}</Text>
      <Text style={[styles.title, dark && { color: DARK.ink }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, dark && { color: DARK.muted }]}>{subtitle}</Text> : null}
    </View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  const { colorScheme } = useThemeContext();
  const dark = colorScheme === "dark";
  return <View style={styles.sectionRow}><Text style={[styles.sectionTitle, dark && { color: DARK.ink }]}>{title}</Text>{action}</View>;
}

export function DemoNotice({ compact = false, title = "Mode pratinjau", message }: { compact?: boolean; title?: string; message?: string }) {
  return (
    <View style={[styles.notice, compact && styles.noticeCompact]}>
      <Ionicons name="information-circle" size={18} color={C.limeDark} />
      <View style={{ flex: 1 }}>
        <Text style={styles.noticeTitle}>{title}</Text>
        <Text style={styles.noticeText}>
          {message ?? (compact ? "Tunnel native sing-box belum aktif." : "Status dan statistik adalah simulasi. Build ini belum mengalihkan lalu lintas perangkat ke VPN.")}
        </Text>
      </View>
    </View>
  );
}

export function Pill({ label, background = C.paleMint, color = C.limeDark, style }: { label: string; background?: string; color?: string; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.pill, { backgroundColor: background }, style]}><Text style={[styles.pillText, { color }]}>{label}</Text></View>;
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colorScheme } = useThemeContext();
  const dark = colorScheme === "dark";
  return <View style={[styles.card, dark && { backgroundColor: DARK.card, borderColor: DARK.line }, style]}>{children}</View>;
}

export function SmallLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.smallLabel, style]}>{children}</Text>;
}

export function IconTile({ name, color = C.ink, background = C.bg, size = 40 }: { name: React.ComponentProps<typeof Ionicons>["name"]; color?: string; background?: string; size?: number }) {
  const { colorScheme } = useThemeContext();
  const dark = colorScheme === "dark";
  return <View style={{ width: size, height: size, borderRadius: 14, backgroundColor: dark && background === C.paleMint ? DARK.paleMint : dark && background === C.bg ? DARK.bg : background, justifyContent: "center", alignItems: "center" }}><Ionicons name={name} size={19} color={dark && color === C.limeDark ? DARK.limeDark : color} /></View>;
}

export function Divider() {
  const { colorScheme } = useThemeContext();
  const dark = colorScheme === "dark";
  return <View style={[styles.divider, dark && { backgroundColor: DARK.line }]} />;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 28, gap: 20 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 5 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandIcon: { width: 38, height: 38, borderRadius: 14, backgroundColor: C.forest, alignItems: "center", justifyContent: "center" },
  brandName: { fontSize: 19, letterSpacing: -0.8, fontWeight: "800", color: C.ink, lineHeight: 20 },
  brandCaption: { fontSize: 8, letterSpacing: 1.4, color: C.muted, fontWeight: "700", marginTop: 3 },
  previewBadge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 20, backgroundColor: C.paleYellow, paddingHorizontal: 10, paddingVertical: 7 },
  previewDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.warning },
  previewText: { color: "#85652F", fontSize: 9, letterSpacing: 0.8, fontWeight: "800" },
  pageTitle: { gap: 5, marginTop: 4 },
  eyebrow: { color: C.limeDark, fontSize: 10, fontWeight: "800", letterSpacing: 1.6 },
  title: { color: C.ink, fontSize: 30, lineHeight: 36, letterSpacing: -1, fontWeight: "800" },
  subtitle: { color: C.muted, fontSize: 13, lineHeight: 19, marginTop: 1 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: -10 },
  sectionTitle: { color: C.ink, fontSize: 15, fontWeight: "800", letterSpacing: -0.2 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 16, backgroundColor: C.paleYellow, padding: 13, borderWidth: 1, borderColor: "#F2E7CA" },
  noticeCompact: { paddingVertical: 10 },
  noticeTitle: { color: "#6F572D", fontSize: 12, fontWeight: "800", marginBottom: 2 },
  noticeText: { color: "#846F49", fontSize: 11, lineHeight: 16 },
  pill: { alignSelf: "flex-start", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  pillText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.2 },
  card: { backgroundColor: C.card, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: C.line },
  smallLabel: { color: C.muted, fontSize: 10, letterSpacing: 1.1, fontWeight: "800" },
  divider: { height: 1, backgroundColor: C.line },
});
