import { Feather } from "@expo/vector-icons";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function SignupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signup } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      await signup(name, email, password);
      router.replace("/(tabs)");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not create account.";
      Alert.alert("Sign up failed", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const Container = Platform.OS === "web" ? ScrollView : KeyboardAwareScrollView;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Container
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: topPad + 32,
          paddingBottom: bottomPad + 24,
          paddingHorizontal: 24,
          justifyContent: "space-between",
        }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <View style={styles.header}>
          <View style={[styles.logoBox, { backgroundColor: colors.primary }]}>
            <Feather name="book-open" size={26} color={colors.primaryForeground} />
          </View>
          <Text style={[styles.brand, { color: colors.foreground }]}>Tarkeez</Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            Build a focus habit, page by page.
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Create your account
          </Text>
          <Input
            label="Name"
            placeholder="Your name"
            autoCapitalize="words"
            value={name}
            onChangeText={setName}
          />
          <Input
            label="Email"
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
          />
          <Input
            label="Password"
            placeholder="At least 4 characters"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Button
            label="Create account"
            onPress={onSubmit}
            loading={submitting}
            disabled={submitting}
            style={{ marginTop: 8 }}
          />
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            Already have an account?{" "}
          </Text>
          <Link href="/(auth)/login" replace>
            <Text style={[styles.footerLink, { color: colors.primary }]}>
              Sign in
            </Text>
          </Link>
        </View>
      </Container>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { alignItems: "center", gap: 12, marginBottom: 24 },
  logoBox: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { fontFamily: "Inter_700Bold", fontSize: 28, letterSpacing: -0.5 },
  tagline: { fontFamily: "Inter_400Regular", fontSize: 15 },
  form: { gap: 14 },
  title: { fontFamily: "Inter_700Bold", fontSize: 22, marginBottom: 4 },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 24,
  },
  footerText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  footerLink: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
});
