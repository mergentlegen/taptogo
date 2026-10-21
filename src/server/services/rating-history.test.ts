import { expect, it } from "vitest";

import { RatingHistory } from "./rating-history";

it("shows a falling review count instead of claiming zero new reviews", () => {
  const history = new RatingHistory(
    [
      {
        id: "a",
        locationId: "venue",
        rating: 4,
        reviewCount: 100,
        capturedAt: "2026-10-01T00:00:00Z",
      },
      {
        id: "b",
        locationId: "venue",
        rating: 4,
        reviewCount: 97,
        capturedAt: "2026-10-03T00:00:00Z",
      },
    ],
    "Asia/Almaty",
  );
  expect(history.newReviews(["venue"], "2026-10-01", "2026-10-02")).toBe(-3);
});
