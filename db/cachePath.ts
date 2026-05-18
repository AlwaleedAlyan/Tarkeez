import * as FileSystem from "expo-file-system/legacy";

export function cachePath(
  userId: string,
  materialId: string,
): string | null {
  if (!FileSystem.cacheDirectory) return null;
  return `${FileSystem.cacheDirectory}Tarkeez/${userId}/${materialId}.pdf`;
}
