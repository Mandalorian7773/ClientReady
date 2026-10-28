import { ImageResponse } from "next/og";
import { OG_ALT, OG_SIZE, OgArt, ogFonts } from "./og-art";

export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(<OgArt />, { ...OG_SIZE, fonts: await ogFonts() });
}
