import fs from "fs";
import zlib from "zlib";

function createPng(width, height, r, g, b) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function createChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);

    let c = 0xffffffff;
    for (const byte of Buffer.concat([typeBuf, data])) {
      c ^= byte;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
    }
    crc.writeUInt32BE((c ^ 0xffffffff) >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8-bit depth
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const raw = Buffer.alloc(height * (1 + width * 4));
  let pos = 0;
  for (let y = 0; y < height; y++) {
    raw[pos++] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const dx = x - width / 2;
      const dy = y - height / 2;
      const dist = Math.sqrt(dx * dx + dy * dy) / (width / 2);

      let pr = r, pg = g, pb = b, pa = 255;
      if (dist < 0.65) {
        const factor = 1 - dist / 0.65;
        pr = Math.min(255, Math.floor(59 + factor * 60));
        pg = Math.min(255, Math.floor(130 + factor * 70));
        pb = Math.min(255, Math.floor(246 + factor * 9));
      } else {
        pr = 11;
        pg = 15;
        pb = 23;
      }
      raw[pos++] = pr;
      raw[pos++] = pg;
      raw[pos++] = pb;
      raw[pos++] = pa;
    }
  }

  const compressed = zlib.deflateSync(raw);
  const idat = createChunk("IDAT", compressed);
  const iend = createChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, createChunk("IHDR", ihdr), idat, iend]);
}

if (!fs.existsSync("public")) {
  fs.mkdirSync("public", { recursive: true });
}

fs.writeFileSync("public/icon-192.png", createPng(192, 192, 59, 130, 246));
fs.writeFileSync("public/icon-512.png", createPng(512, 512, 59, 130, 246));
fs.writeFileSync("public/apple-touch-icon.png", createPng(180, 180, 59, 130, 246));
console.log("Icons created successfully");
