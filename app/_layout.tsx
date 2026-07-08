import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { LibraryProvider } from "@/contexts/LibraryContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import "@/db/handlers/sessions";
import "@/db/handlers/collections";
import "@/db/handlers/notes";
import "@/db/handlers/materials";
import { ensureSessionsSchema } from "@/db/ensureSessionsSchema";
import { useDbMigrations } from "@/db/migrate";
import { start as startSync, stop as stopSync } from "@/db/sync";
import { logRejection } from "@/lib/logRejection";
import { migrateStymerToTarkeez } from "@/lib/migrateLegacyStorage";

// Override Hermes's default unhandled-rejection tracker so transient network
// failures (Supabase auto-refresh while offline, etc.) show up as labeled
// warnings instead of red ERROR lines. Explicit `.catch` sites in our code
// route through logRejection directly; this is the safety net for promises
// inside third-party code (mostly @supabase/supabase-js).
const hermes = (globalThis as { HermesInternal?: {
  enablePromiseRejectionTracker?: (opts: {
    allRejections: boolean;
    onUnhandled: (id: number, err: unknown) => void;
    onHandled: (id: number) => void;
  }) => void;
} }).HermesInternal;
hermes?.enablePromiseRejectionTracker?.({
  allRejections: true,
  onUnhandled: (id, err) => logRejection(`unhandled#${id}`, err),
  onHandled: () => {},
});

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="study/[id]"
        options={{
          presentation: "card",
          animation: "slide_from_right",
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="collection/[id]"
        options={{
          presentation: "card",
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="note/[id]"
        options={{
          presentation: "card",
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="settings"
        options={{
          presentation: "card",
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="browser/view"
        options={{
          presentation: "card",
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="calendar"
        options={{
          presentation: "card",
          animation: "slide_from_right",
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [migrationDone, setMigrationDone] = useState(false);
  const [schemaReady, setSchemaReady] = useState(false);
  const { success: dbReady, error: dbError } = useDbMigrations();

  useEffect(() => {
    migrateStymerToTarkeez()
      .catch((e) => logRejection("legacy-migrate", e))
      .finally(() => setMigrationDone(true));
  }, []);

  useEffect(() => {
    if (dbError) console.error("[db] migration failed", dbError);
  }, [dbError]);

  const dbBootDone = dbReady || dbError != null;

  // Repair a stale/failed study_sessions migration before any provider (and
  // its live queries) mount. No-op when the schema is already current.
  useEffect(() => {
    if (!dbBootDone) return;
    if (dbError) console.error("[db] migration error at boot:", dbError);
    ensureSessionsSchema();
    setSchemaReady(true);
  }, [dbBootDone]);

  useEffect(() => {
    if (!dbReady) return;
    startSync();
    return () => stopSync();
  }, [dbReady]);

  useEffect(() => {
    if ((fontsLoaded || fontError) && migrationDone && dbBootDone && schemaReady) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, migrationDone, dbBootDone, schemaReady]);

  if (
    (!fontsLoaded && !fontError) ||
    !migrationDone ||
    !dbBootDone ||
    !schemaReady
  ) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <ThemeProvider>
                <AuthProvider>
                  <LibraryProvider>
                    <RootLayoutNav />
                  </LibraryProvider>
                </AuthProvider>
              </ThemeProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
