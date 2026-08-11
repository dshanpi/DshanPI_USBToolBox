import { tempDir, join } from '@tauri-apps/api/path';
import { exists, mkdir } from '@tauri-apps/plugin-fs';

/** Cache directory name in temp folder */
const TEMP_DIR_NAME = 'usbtoolbox-cache';

/**
 * Gets or creates the cache directory path.
 *
 * Creates a cache directory in the system temp folder
 * for storing temporary files during firmware operations.
 * Directory is created if it doesn't exist.
 *
 * @returns Promise resolving to cache directory path
 */
export async function getCacheDir(): Promise<string> {
  const tempDirPath = await tempDir();
  const cacheDir = await join(tempDirPath, TEMP_DIR_NAME);

  if (!(await exists(cacheDir))) {
    await mkdir(cacheDir);
  }

  return cacheDir;
}