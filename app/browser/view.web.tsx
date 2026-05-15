import { useLocalSearchParams } from "expo-router";
import React from "react";

import { InAppBrowserWeb } from "@/components/InAppBrowser.web";

export default function BrowserViewWeb() {
  const { url, title } = useLocalSearchParams<{ url: string; title?: string }>();
  return <InAppBrowserWeb url={url ?? ""} title={title} />;
}
