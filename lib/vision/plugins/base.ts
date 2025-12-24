import type { VisionPlugin, VisionResult } from "./types";

/**
 * Example plugin: normalize responses (safe + consistent).
 * Later add plugins:
 * - DB logging plugin
 * - profanity filter plugin
 * - geo/places enrichment plugin
 * - caching plugin
 */
export const normalizePlugin: VisionPlugin = {
  name: "normalize",
  order: 10,
  postprocess: async (result: VisionResult) => {
    const caption = (result.caption || "").trim();
    return {
      ...result,
      caption: caption.length ? caption : "I couldn't confidently describe this scene.",
    };
  },
};
