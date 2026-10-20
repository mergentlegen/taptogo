const TWOGIS_HOSTS = new Set(["2gis.kz", "www.2gis.kz", "2gis.ru", "www.2gis.ru"]);

export type ParsedTwogisUrl = {
  firmId: string;
  host: string;
  /** City slug from the path, e.g. "almaty". */
  city: string;
};

/**
 * Extracts the firm id from a 2GIS organization link such as
 * https://2gis.kz/almaty/firm/70000001012345678/tab/reviews.
 * Short links (go.2gis.com/…) need a network call to resolve and return null here.
 */
export function parseTwogisFirmUrl(rawUrl: string): ParsedTwogisUrl | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !TWOGIS_HOSTS.has(url.hostname.toLowerCase())) return null;

  const match = /^\/([a-z_-]+)\/firm\/(\d{5,20})(?:\/|$)/i.exec(url.pathname);
  if (!match?.[1] || !match[2]) return null;

  return {
    host: url.hostname.toLowerCase().replace(/^www\./, ""),
    city: match[1].toLowerCase(),
    firmId: match[2],
  };
}

export function twogisProfileUrl({ host, city, firmId }: ParsedTwogisUrl): string {
  return `https://${host}/${city}/firm/${firmId}`;
}

export function twogisReviewsUrl(parsed: ParsedTwogisUrl): string {
  return `${twogisProfileUrl(parsed)}/tab/reviews`;
}
