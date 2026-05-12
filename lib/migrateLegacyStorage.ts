import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

const SENTINEL_KEY = "@Tarkeez/_migrated_v1";
const OLD_PREFIX = "@Stymer/";
const NEW_PREFIX = "@Tarkeez/";
const OLD_PREFS_KEY = "@stymer/prefs";
const NEW_PREFS_KEY = "@Tarkeez/prefs";

export async function migrateStymerToTarkeez(): Promise<void> {
  try {
    const done = await AsyncStorage.getItem(SENTINEL_KEY);
    if (done === "true") return;

    const allKeys = await AsyncStorage.getAllKeys();
    const toMigrate = allKeys.filter(
      (k) => k.startsWith(OLD_PREFIX) || k === OLD_PREFS_KEY,
    );

    if (toMigrate.length > 0) {
      const pairs = await AsyncStorage.multiGet(toMigrate);
      const writes: [string, string][] = [];
      for (const [oldKey, value] of pairs) {
        if (value == null) continue;
        const newKey =
          oldKey === OLD_PREFS_KEY
            ? NEW_PREFS_KEY
            : `${NEW_PREFIX}${oldKey.slice(OLD_PREFIX.length)}`;
        writes.push([newKey, value]);
      }
      if (writes.length > 0) await AsyncStorage.multiSet(writes);
      await AsyncStorage.multiRemove(toMigrate);
    }

    if (FileSystem.cacheDirectory) {
      const oldDir = `${FileSystem.cacheDirectory}Stymer`;
      const newDir = `${FileSystem.cacheDirectory}Tarkeez`;
      try {
        const info = await FileSystem.getInfoAsync(oldDir);
        if (info.exists) {
          await FileSystem.moveAsync({ from: oldDir, to: newDir });
        }
      } catch {
        /* cache is regenerable — ignore */
      }
    }

    await AsyncStorage.setItem(SENTINEL_KEY, "true");
  } catch {
    /* best-effort; never block app boot */
  }
}
