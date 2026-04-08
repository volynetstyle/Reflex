import { bench, describe } from "vitest";

class PointClass {
  x: number;
  y: number;
  z: number;

  constructor(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}

type PointObject = {
  x: number;
  y: number;
  z: number;
};

let sink = 0;

function consume(value: number) {
  sink = (sink + value) | 0;
}

describe("classes vs objects", () => {
  bench("class: create 100k", () => {
    for (let i = 0; i < 100_000; i++) {
      const point = new PointClass(i, i + 1, i + 2);
      consume(point.x);
    }
  });

  bench("object: create 100k", () => {
    for (let i = 0; i < 100_000; i++) {
      const point: PointObject = { x: i, y: i + 1, z: i + 2 };
      consume(point.x);
    }
  });

  const classPoints = Array.from(
    { length: 10_000 },
    (_, i) => new PointClass(i, i + 1, i + 2),
  );
  const objectPoints = Array.from(
    { length: 10_000 },
    (_, i): PointObject => ({ x: i, y: i + 1, z: i + 2 }),
  );

  bench("class: read + write 10k", () => {
    for (let i = 0; i < classPoints.length; i++) {
      const point = classPoints[i]!;
      point.x += 1;
      point.y += point.x;
      consume(point.z + point.y);
    }
  });

  bench("object: read + write 10k", () => {
    for (let i = 0; i < objectPoints.length; i++) {
      const point = objectPoints[i]!;
      point.x += 1;
      point.y += point.x;
      consume(point.z + point.y);
    }
  });
});
