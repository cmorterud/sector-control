// Vite replaces BASE_URL for root hosting or a GitHub Pages project path.
export function publicAsset(path: string) {
  return import.meta.env.BASE_URL + path;
}
