import * as FileSystem from "expo-file-system/legacy";

const KEEP_PREFIXES = ["reel-reactor-import", "reel-reactor-imports", "reel-reactor-cutout", "reel-reactor-composite", "reel-reactor-source", "ReelReactor-"];

function isManagedCacheFile(name: string) {
  return KEEP_PREFIXES.some((prefix) => name.startsWith(prefix) || name.includes(`/${prefix}`));
}

export async function pruneReactionCache(keepUri?: string | null) {
  const root = FileSystem.cacheDirectory;
  if (!root) return;

  const keep = keepUri?.replace(/^file:\/\//, "") ?? "";
  const cutoff = Date.now() - 30 * 60 * 1000;

  async function pruneDir(dir: string) {
    const listing = await FileSystem.readDirectoryAsync(dir).catch(() => [] as string[]);
    for (const name of listing) {
      const path = dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
      if (keep && (path === keep || keep.startsWith(path))) continue;
      const info = await FileSystem.getInfoAsync(path).catch(() => null);
      if (!info?.exists) continue;
      if (info.isDirectory) {
        if (name.startsWith("reel-reactor-cutout") || name === "reel-reactor-imports") {
          const mtime = "modificationTime" in info ? Number(info.modificationTime ?? 0) * 1000 : 0;
          if (!mtime || mtime < cutoff) {
            await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
          } else {
            await pruneDir(path.endsWith("/") ? path : `${path}/`);
          }
        }
        continue;
      }
      if (!isManagedCacheFile(name)) continue;
      const mtime = "modificationTime" in info ? Number(info.modificationTime ?? 0) * 1000 : Date.now();
      if (mtime && mtime < cutoff) {
        await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined);
      }
    }
  }

  await pruneDir(root);
}
