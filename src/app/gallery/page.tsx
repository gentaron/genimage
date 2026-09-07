import type { Metadata } from "next";
import { GalleryView } from "@/components/GalleryView";

export const metadata: Metadata = { title: "Gallery · GenImage Studio" };

export default function GalleryPage() {
  return <GalleryView />;
}
