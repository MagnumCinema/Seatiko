import { describe, expect, it } from "vitest";
import { googleMapDirections, googleMapSearch } from "./google-map";

describe("google map links", () => {
  it("builds directions to a point", () => {
    const url = new URL(googleMapDirections({ lat: 47.76, lng: 27.93 }));
    expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("destination")).toBe("47.76,27.93");
  });

  it("searches by name and address, with the place id when known", () => {
    const url = new URL(googleMapSearch("Andy's Pizza, Bălți", "abc"));
    expect(url.searchParams.get("query")).toBe("Andy's Pizza, Bălți");
    expect(url.searchParams.get("query_place_id")).toBe("abc");
  });
});
