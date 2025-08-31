declare module 'geohash' {
  export function encode(latitude: number, longitude: number, precision?: number): string;
  export function decode(geohash: string): { latitude: number; longitude: number };
  export function bounds(geohash: string): {
    sw: { lat: number; lon: number };
    ne: { lat: number; lon: number };
  };
  export function neighbors(geohash: string): {
    n: string;
    ne: string;
    e: string;
    se: string;
    s: string;
    sw: string;
    w: string;
    nw: string;
  };
}
