import { moveItem } from "./list";

describe("moveItem", () => {
  const items = ["a", "b", "c", "d"];

  it("moves an item up and down", () => {
    expect(moveItem(items, 2, -1)).toEqual(["a", "c", "b", "d"]);
    expect(moveItem(items, 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("clamps at both ends", () => {
    expect(moveItem(items, 0, -1)).toEqual(items);
    expect(moveItem(items, 3, 5)).toEqual(items);
  });

  it("ignores an index that is not in the list", () => {
    expect(moveItem(items, -1, 1)).toEqual(items);
    expect(moveItem(items, 9, -1)).toEqual(items);
  });

  it("does not mutate its input", () => {
    const input = [1, 2, 3];
    moveItem(input, 0, 1);
    expect(input).toEqual([1, 2, 3]);
  });
});
