import { useLocalSearchParams } from "expo-router";
import React from "react";

import { InAppBrowser } from "@/components/InAppBrowser";

export default function BrowserView() {
  const { url, title } = useLocalSearchParams<{ url: string; title?: string }>();
  return <InAppBrowser url={url ?? ""} title={title} />;
}
