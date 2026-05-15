import type { useRouter } from "expo-router";

type Router = ReturnType<typeof useRouter>;

export function openInAppBrowser(
  router: Router,
  url: string,
  title?: string,
): void {
  if (!url) return;
  router.push({
    pathname: "/browser/view",
    params: { url, title: title ?? "" },
  });
}
