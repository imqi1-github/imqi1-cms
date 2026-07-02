export type AttachmentUploadLocation = "local" | "cos";

export interface LocalUploadResult {
  success: boolean;
  url?: string;
  error?: string;
}
