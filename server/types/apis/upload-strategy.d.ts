export type AttachmentUploadLocation = "local" | "cos";

export type LocalUploadResult =
  | { success: true; url: string }
  | { success: false; error: string };
