import { Text, Pressable, View, type ViewStyle } from "react-native";
import type { ReactNode } from "react";
import { styles } from "./theme";

export function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress(): void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{title}</Text>
    </Pressable>
  );
}
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Notice({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return (
    <View style={[styles.notice, warning && styles.warning]} accessibilityLiveRegion="polite">
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}
