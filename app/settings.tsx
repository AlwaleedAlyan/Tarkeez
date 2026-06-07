import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Tappable } from "@/components/Tappable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { CropPhotoModal, type CropResult } from "@/components/CropPhotoModal";
import { ACCENT_LIST, type AccentName, type ThemeMode } from "@/constants/themes";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useColors } from "@/hooks/useColors";
import { uploadAvatar } from "@/lib/api";

type EditField = null | "name" | "email" | "password";

const MODE_OPTIONS: { value: ThemeMode; label: string; icon: React.ComponentProps<typeof Feather>["name"] }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "Auto", icon: "smartphone" },
];

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, updateProfile } = useAuth();
  const {
    prefs,
    setMode,
    setAccent,
    setNotifications,
    setSoundsEnabled,
    effectiveMode,
  } = useTheme();

  const [editing, setEditing] = useState<EditField>(null);
  const [busy, setBusy] = useState(false);
  const [pendingPhotoUri, setPendingPhotoUri] = useState<string | null>(null);
  const [pendingPhotoMime, setPendingPhotoMime] = useState<string | undefined>(
    undefined,
  );

  const topPad = Platform.OS === "web" ? 16 : insets.top;
  const bottomPad = Platform.OS === "web" ? 24 : insets.bottom + 16;

  const photoUri = user?.photoUri;

  const haptic = () => {
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
  };

  const showError = (message: string) => {
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      window.alert(message);
    } else {
      Alert.alert("Couldn't save", message);
    }
  };

  const onPickPhoto = async () => {
    haptic();
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          showError("Photo access is needed to set a profile picture.");
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setPendingPhotoUri(asset.uri);
      setPendingPhotoMime(asset.mimeType ?? undefined);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Could not update photo.");
    }
  };

  const onCropSave = async (crop: CropResult) => {
    if (!pendingPhotoUri) return;
    try {
      setBusy(true);
      const storedPath = await uploadAvatar(pendingPhotoUri, pendingPhotoMime);
      await updateProfile({
        photoUri: storedPath,
        photoTransform: crop,
      });
      setPendingPhotoUri(null);
      setPendingPhotoMime(undefined);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Could not save photo.");
    } finally {
      setBusy(false);
    }
  };

  const onRemovePhoto = () => {
    const doRemove = async () => {
      try {
        setBusy(true);
        await updateProfile({ photoUri: null });
      } catch (e) {
        showError(e instanceof Error ? e.message : "Could not remove photo.");
      } finally {
        setBusy(false);
      }
    };
    if (!photoUri) return;
    if (Platform.OS === "web") {
      doRemove();
    } else {
      Alert.alert("Remove photo?", "Your initial will be shown instead.", [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: doRemove },
      ]);
    }
  };

  const onModePick = (m: ThemeMode) => {
    haptic();
    setMode(m);
  };

  const onAccentPick = (a: AccentName) => {
    haptic();
    setAccent(a);
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: topPad, borderBottomColor: colors.border },
        ]}
      >
        <Tappable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backBtn,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          accessibilityLabel="Back"
        >
          <Feather name="chevron-left" size={22} color={colors.foreground} />
        </Tappable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Settings
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: bottomPad,
          gap: 24,
        }}
        keyboardDismissMode="on-drag"
      >
        {/* Account */}
        <Section title="Account" colors={colors}>
          <View
            style={[
              styles.photoRow,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Tappable onPress={onPickPhoto} disabled={busy}>
              <Avatar
                uri={user?.photoUri}
                transform={user?.photoTransform}
                name={user?.name}
                size={64}
              />
            </Tappable>
            <View style={{ flex: 1 }}>
              <Text
                style={[styles.photoTitle, { color: colors.foreground }]}
              >
                Profile picture
              </Text>
              <Text
                style={[styles.photoSub, { color: colors.mutedForeground }]}
              >
                Tap your picture to change it.
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <SmallBtn
                  label={photoUri ? "Change" : "Choose"}
                  icon="image"
                  onPress={onPickPhoto}
                  colors={colors}
                />
                {photoUri ? (
                  <SmallBtn
                    label="Remove"
                    icon="trash-2"
                    onPress={onRemovePhoto}
                    colors={colors}
                    danger
                  />
                ) : null}
              </View>
            </View>
          </View>

          <RowGroup colors={colors}>
            <Row
              colors={colors}
              icon="user"
              label="Display name"
              value={user?.name ?? ""}
              onPress={() => setEditing("name")}
            />
            <Row
              colors={colors}
              icon="mail"
              label="Email"
              value={user?.email ?? ""}
              onPress={() => setEditing("email")}
            />
            <Row
              colors={colors}
              icon="lock"
              label="Password"
              value="••••••••"
              onPress={() => setEditing("password")}
              isLast
            />
          </RowGroup>
        </Section>

        {/* Appearance */}
        <Section title="Appearance" colors={colors}>
          <View
            style={[
              styles.appearanceCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.subLabel, { color: colors.mutedForeground }]}>
              Theme
            </Text>
            <View style={[styles.segment, { backgroundColor: colors.muted }]}>
              {MODE_OPTIONS.map((opt) => {
                const active = prefs.mode === opt.value;
                return (
                  <Tappable
                    key={opt.value}
                    sound="soft"
                    onPress={() => onModePick(opt.value)}
                    style={({ pressed }) => [
                      styles.segmentBtn,
                      {
                        backgroundColor: active ? colors.card : "transparent",
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Feather
                      name={opt.icon}
                      size={14}
                      color={active ? colors.primary : colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.segmentLabel,
                        {
                          color: active ? colors.foreground : colors.mutedForeground,
                          fontFamily: active
                            ? "Inter_600SemiBold"
                            : "Inter_500Medium",
                        },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </Tappable>
                );
              })}
            </View>
            {prefs.mode === "system" ? (
              <Text
                style={[styles.modeHint, { color: colors.mutedForeground }]}
              >
                Following your phone — currently {effectiveMode}.
              </Text>
            ) : null}

            <Text
              style={[
                styles.subLabel,
                { color: colors.mutedForeground, marginTop: 18 },
              ]}
            >
              Primary color
            </Text>
            <View style={styles.swatchGrid}>
              {ACCENT_LIST.map((a) => {
                const active = prefs.accent === a.name;
                return (
                  <Tappable
                    key={a.name}
                    sound="soft"
                    onPress={() => onAccentPick(a.name)}
                    style={({ pressed }) => [
                      styles.swatchCol,
                      { opacity: pressed ? 0.7 : 1 },
                    ]}
                    accessibilityLabel={a.label}
                  >
                    <View
                      style={[
                        styles.swatchBox,
                        {
                          backgroundColor: a.swatch,
                          borderColor: active ? colors.foreground : "transparent",
                        },
                      ]}
                    >
                      {active ? (
                        <View
                          style={[
                            styles.swatchCheck,
                            { backgroundColor: colors.card },
                          ]}
                        >
                          <Feather
                            name="check"
                            size={14}
                            color={colors.foreground}
                          />
                        </View>
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.swatchLabel,
                        {
                          color: active ? colors.foreground : colors.mutedForeground,
                          fontFamily: active
                            ? "Inter_600SemiBold"
                            : "Inter_500Medium",
                        },
                      ]}
                    >
                      {a.label}
                    </Text>
                  </Tappable>
                );
              })}
            </View>
          </View>
        </Section>

        {/* Notifications */}
        <Section title="Notifications" colors={colors}>
          <View
            style={[
              styles.notifRow,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View
              style={[styles.rowIcon, { backgroundColor: colors.secondary }]}
            >
              <Feather name="bell" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>
                Daily reminders
              </Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                A gentle nudge to keep your streak.
              </Text>
            </View>
            <Switch
              value={prefs.notifications}
              onValueChange={(v) => {
                haptic();
                setNotifications(v);
              }}
              trackColor={{ false: colors.muted, true: colors.primary }}
              thumbColor="#ffffff"
              ios_backgroundColor={colors.muted}
            />
          </View>
          <View
            style={[
              styles.notifRow,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                marginTop: 12,
              },
            ]}
          >
            <View
              style={[styles.rowIcon, { backgroundColor: colors.secondary }]}
            >
              <Feather name="volume-2" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.foreground }]}>
                Button sounds
              </Text>
              <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>
                A soft click when you tap.
              </Text>
            </View>
            <Switch
              value={prefs.soundsEnabled}
              onValueChange={(v) => {
                haptic();
                setSoundsEnabled(v);
              }}
              trackColor={{ false: colors.muted, true: colors.primary }}
              thumbColor="#ffffff"
              ios_backgroundColor={colors.muted}
            />
          </View>
        </Section>
      </ScrollView>

      {editing ? (
        <EditModal
          field={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (patch) => {
            await updateProfile(patch);
          }}
          colors={colors}
        />
      ) : null}

      {pendingPhotoUri ? (
        <CropPhotoModal
          uri={pendingPhotoUri}
          onCancel={() => setPendingPhotoUri(null)}
          onSave={onCropSave}
        />
      ) : null}
    </View>
  );
}

function Section({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={{ gap: 10 }}>
      <Text
        style={[
          styles.sectionTitle,
          { color: colors.mutedForeground },
        ]}
      >
        {title.toUpperCase()}
      </Text>
      <View style={{ gap: 12 }}>{children}</View>
    </View>
  );
}

function RowGroup({
  children,
  colors,
}: {
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View
      style={[
        styles.rowGroup,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      {children}
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  onPress,
  colors,
  isLast,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value: string;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  isLast?: boolean;
}) {
  return (
    <Tappable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomColor: colors.border,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: colors.secondary }]}>
        <Feather name={icon} size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>
          {label}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.rowValue, { color: colors.mutedForeground }]}
        >
          {value}
        </Text>
      </View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </Tappable>
  );
}

function SmallBtn({
  label,
  icon,
  onPress,
  colors,
  danger,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  danger?: boolean;
}) {
  return (
    <Tappable
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallBtn,
        {
          backgroundColor: danger ? "transparent" : colors.secondary,
          borderColor: danger ? colors.border : "transparent",
          borderWidth: danger ? 1 : 0,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Feather
        name={icon}
        size={13}
        color={danger ? colors.destructive : colors.primary}
      />
      <Text
        style={{
          fontFamily: "Inter_600SemiBold",
          fontSize: 12,
          color: danger ? colors.destructive : colors.foreground,
        }}
      >
        {label}
      </Text>
    </Tappable>
  );
}

function EditModal({
  field,
  onClose,
  onSubmit,
  colors,
}: {
  field: EditField;
  onClose: () => void;
  onSubmit: (patch: {
    name?: string;
    email?: string;
    newPassword?: string;
    currentPassword?: string;
  }) => Promise<void>;
  colors: ReturnType<typeof useColors>;
}) {
  const { user } = useAuth();
  const [val1, setVal1] = useState(
    field === "name" ? user?.name ?? "" : field === "email" ? user?.email ?? "" : "",
  );
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const title =
    field === "name"
      ? "Display name"
      : field === "email"
        ? "Email"
        : "Change password";

  const handleSubmit = async () => {
    setError(null);
    try {
      setBusy(true);
      if (field === "name") {
        if (!val1.trim()) throw new Error("Name can't be empty.");
        await onSubmit({ name: val1 });
      } else if (field === "email") {
        if (!val1.trim().includes("@"))
          throw new Error("Please enter a valid email.");
        await onSubmit({ email: val1 });
      } else if (field === "password") {
        if (!currentPwd) throw new Error("Enter your current password.");
        if (newPwd.length < 4)
          throw new Error("New password must be at least 4 characters.");
        if (newPwd !== confirmPwd)
          throw new Error("New passwords don't match.");
        await onSubmit({ currentPassword: currentPwd, newPassword: newPwd });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={modalStyles.backdrop}
      >
        <Tappable style={modalStyles.scrim} onPress={onClose} />
        <View
          style={[
            modalStyles.sheet,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[modalStyles.title, { color: colors.foreground }]}>
            {title}
          </Text>

          {field === "password" ? (
            <View style={{ gap: 10 }}>
              <Field
                label="Current password"
                value={currentPwd}
                onChange={setCurrentPwd}
                secure
                colors={colors}
              />
              <Field
                label="New password"
                value={newPwd}
                onChange={setNewPwd}
                secure
                colors={colors}
              />
              <Field
                label="Confirm new password"
                value={confirmPwd}
                onChange={setConfirmPwd}
                secure
                colors={colors}
              />
            </View>
          ) : (
            <Field
              label={title}
              value={val1}
              onChange={setVal1}
              colors={colors}
              autoCapitalize={field === "email" ? "none" : "words"}
              keyboardType={field === "email" ? "email-address" : "default"}
            />
          )}

          {error ? (
            <Text style={[modalStyles.error, { color: colors.destructive }]}>
              {error}
            </Text>
          ) : null}

          <View style={modalStyles.actions}>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={onClose}
              style={{ flex: 1 }}
            />
            <Button
              label={busy ? "Saving…" : "Save"}
              onPress={handleSubmit}
              style={{ flex: 1 }}
              disabled={busy}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  secure,
  colors,
  autoCapitalize,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  secure?: boolean;
  colors: ReturnType<typeof useColors>;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "email-address";
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          fontFamily: "Inter_500Medium",
          fontSize: 12,
          color: colors.mutedForeground,
        }}
      >
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        autoCapitalize={autoCapitalize ?? (secure ? "none" : "sentences")}
        keyboardType={keyboardType ?? "default"}
        autoCorrect={false}
        placeholderTextColor={colors.mutedForeground}
        style={[
          modalStyles.input,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
            color: colors.foreground,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    textAlign: "center",
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.8,
  },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  photoBig: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  photoTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  photoSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  rowGroup: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  rowValue: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  rowSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  notifRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  appearanceCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  subLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  segment: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 12,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  segmentLabel: { fontSize: 13 },
  modeHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 8,
  },
  swatchGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  swatchCol: {
    width: "33.333%",
    alignItems: "center",
    paddingVertical: 8,
    gap: 6,
  },
  swatchBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchLabel: { fontSize: 12 },
});

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  scrim: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 18 },
  input: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  error: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
});
