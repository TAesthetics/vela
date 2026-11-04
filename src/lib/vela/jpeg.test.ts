// The server strips EXIF/GPS and other metadata from portraits, because a
// modified client could skip the canvas re-encode in the app.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cleanJpegDataUrl, stripJpegMetadata } from "./jpeg.ts";

const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
const jfif = seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const gps = seg(0xe1, [...Buffer.from("Exif\0\0GPS 48.2082N 16.3738E")]);
const comment = seg(0xfe, [...Buffer.from("camera serial 1234")]);
const dqt = seg(0xdb, new Array(65).fill(1));
const sos = seg(0xda, [1, 1, 0, 0, 0x3f, 0]);
const scan = [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd9];
const jpeg = (...parts: number[][]) => Uint8Array.from([0xff, 0xd8, ...parts.flat()]);

describe("jpeg metadata", () => {
  it("drops EXIF and comments, keeps image data byte for byte", () => {
    const out = stripJpegMetadata(jpeg(jfif, gps, comment, dqt, sos, scan));
    assert.deepEqual(out, jpeg(jfif, dqt, sos, scan));
  });
  it("leaves a clean JPEG unchanged", () => {
    const clean = jpeg(jfif, dqt, sos, scan);
    assert.deepEqual(stripJpegMetadata(clean), clean);
  });
  it("rejects data that is not a JPEG", () => {
    assert.equal(stripJpegMetadata(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), null);
    assert.equal(stripJpegMetadata(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff])), null);
  });
  it("cleans data URLs and refuses broken ones", () => {
    const padding = seg(0xe2, new Array(200).fill(7));
    const url = "data:image/jpeg;base64," + Buffer.from(jpeg(jfif, gps, padding, dqt, sos, scan)).toString("base64");
    const cleaned = cleanJpegDataUrl(url, 120_000);
    assert.ok(cleaned);
    assert.ok(!Buffer.from(cleaned.split(",")[1], "base64").toString("latin1").includes("GPS"));
    assert.equal(cleanJpegDataUrl("data:image/jpeg;base64,<script>", 120_000), null);
    assert.equal(cleanJpegDataUrl(url, 50), null);
    assert.equal(cleanJpegDataUrl("data:image/png;base64,AAAA", 120_000), null);
  });
});
