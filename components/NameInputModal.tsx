import React, { useEffect, useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Tappable } from "@/components/Tappable";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";

type Props = {
  visible: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  onSubmit: (name: string) => void | Promise<void>;
  onCancel: () => void;
};

export function NameInputModal({
  visible,
  title,
  placeholder,
  initialValue = "",
  onSubmit,
  onCancel,
}: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setValue(initialValue);
      setBusy(false);
    }
  }, [visible, initialValue]);

  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0 && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <Tappable style={styles.backdrop} onPress={onCancel}>
        <Tappable
          onPress={() => {}}
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              paddingBottom: insets.bottom + 16,
            },
          ]}
        >
          <KeyboardAwareScrollViewCompat
            contentContainerStyle={styles.content}
            bottomOffset={20}
          >
            <Text style={[styles.title, { color: colors.foreground }]}>
              {title}
            </Text>
            <Input
              autoFocus
              value={value}
              onChangeText={setValue}
              placeholder={placeholder}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              maxLength={60}
            />
            <View style={styles.actions}>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={onCancel}
                disabled={busy}
                style={{ flex: 1 }}
              />
              <Button
                label="Save"
                onPress={handleSubmit}
                disabled={!canSubmit}
                loading={busy}
                style={{ flex: 1 }}
              />
            </View>
          </KeyboardAwareScrollViewCompat>
        </Tappable>
      </Tappable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    letterSpacing: -0.4,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
});
