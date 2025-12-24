export type VisionMode = "quick" | "detailed";

export type VisionRequest = {
  imageDataUrl: string; // data:image/jpeg;base64,...
  mode: VisionMode;
  language?: string; // future: "en", "ur", etc.
};

export type VisionResult = {
  caption: string;
  meta?: Record<string, unknown>;
};

export type VisionPlugin = {
  name: string;
  order?: number; // lower runs earlier
  preprocess?: (req: VisionRequest) => Promise<VisionRequest> | VisionRequest;
  postprocess?: (result: VisionResult, req: VisionRequest) => Promise<VisionResult> | VisionResult;
};
