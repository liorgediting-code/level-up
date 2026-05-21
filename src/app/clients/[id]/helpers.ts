import { publicPath } from "@/lib/landing/paths";

export { fmtIls } from "@/lib/utils";

export function publicUrlForUpload(absPath: string) {
  return publicPath(absPath);
}
