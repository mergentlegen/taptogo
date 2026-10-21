/** Public facts only: demo venue ratings and placeholder contacts are not brand data. */
export function homepageSchema(baseUrl: string, title: string, description: string, language: string) {
  const url = new URL("/", baseUrl).href;
  const organization = `${url}#organization`;
  const website = `${url}#website`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", "@id": organization, name: "TapToGo", url, description },
      {
        "@type": "WebSite",
        "@id": website,
        name: "TapToGo",
        url,
        inLanguage: language,
        publisher: { "@id": organization },
      },
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: title,
        description,
        inLanguage: language,
        isPartOf: { "@id": website },
        about: { "@id": organization },
      },
    ],
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
