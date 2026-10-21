import { describe, expect, it } from "vitest";

import { homepageSchema, serializeJsonLd } from "./homepage-schema";

describe("homepage structured data", () => {
  it("uses one canonical origin for linked public entities", () => {
    const schema = homepageSchema("https://example.com/ignored?query=1", "Title", "Description", "ru");
    const nodes = schema["@graph"];
    expect(nodes.map((node) => node.url)).toEqual(Array(3).fill("https://example.com/"));
    expect(nodes[1]?.publisher).toEqual({ "@id": nodes[0]?.["@id"] });
    expect(nodes[2]?.isPartOf).toEqual({ "@id": nodes[1]?.["@id"] });
    expect(serializeJsonLd(schema)).not.toMatch(/aggregateRating|telephone|SearchAction/);
  });

  it("cannot terminate the inline script through translated text", () => {
    const payload = { description: '</script><script>alert("x")</script>' };
    const serialized = serializeJsonLd(payload);
    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized)).toEqual(payload);
  });
});
