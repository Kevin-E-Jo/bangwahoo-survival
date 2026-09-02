// 만든 스프라이트를 한눈에 볼 수 있게 크게 확대해 한 장으로 모은 미리보기.
// 게임에 쓰이는 실제 파일(public/assets/sprites)은 건드리지 않는다.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { encodePNG } = require("./png-encoder");

const SPRITE_DIR = path.join(__dirname, "..", "..", "public", "assets", "sprites");
const OUT = path.join(__dirname, "contact-sheet.png");
const SCALE = 5;
const CELL = 48 * SCALE + 16;
const COLS = 6;
const NAMES = [
  "player", "enemy", "enemy-elite", "bullet", "pickup", "ground",
  // 흔함
  "bottle_cap", "rubber_band", "stamp", "junk_food", "bean_bag", "toy_ddakji",
  // 보통
  "marble", "jegi", "spin_top", "toy_set_square", "glue_stick", "crayon",
  "sticker_book",
  // 희귀
  "yoyo", "toy_paint", "glow_bracelet", "hula_hoop", "gacha_capsule", "boomerang",
  // 레전드
  "character_card", "cap_gun", "toy_fidget_spinner",
];

function decodePNG(buf) {
  // 최소 PNG 디코더: 우리 인코더가 만든 단순 포맷(필터 none, RGBA 8bit)만 지원.
  let offset = 8;
  let width, height, idat = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
    } else if (type === "IDAT") {
      idat.push(data);
    }
    offset += 8 + len + 4;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const grid = [];
  let p = 0;
  for (let y = 0; y < height; y++) {
    p++; // filter byte (none)
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push([raw[p], raw[p + 1], raw[p + 2], raw[p + 3]]);
      p += 4;
    }
    grid.push(row);
  }
  return grid;
}

function makeGrid(w, h, fill) {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
}

const BG = [242, 243, 236, 255];
const rows = Math.ceil(NAMES.length / COLS);
const sheet = makeGrid(CELL * COLS, CELL * rows, BG);

NAMES.forEach((name, i) => {
  const grid = decodePNG(fs.readFileSync(path.join(SPRITE_DIR, `${name}.png`)));
  const col = i % COLS, row = Math.floor(i / COLS);
  const ox = col * CELL + (CELL - grid[0].length * SCALE) / 2;
  const oy = row * CELL + (CELL - grid.length * SCALE) / 2;
  for (let y = 0; y < grid.length; y++)
    for (let x = 0; x < grid[0].length; x++) {
      const [r, g, b, a] = grid[y][x];
      if (a === 0) continue;
      for (let dy = 0; dy < SCALE; dy++)
        for (let dx = 0; dx < SCALE; dx++) {
          sheet[Math.round(oy) + y * SCALE + dy][Math.round(ox) + x * SCALE + dx] = [r, g, b, 255];
        }
    }
});

fs.writeFileSync(OUT, encodePNG(sheet));
console.log("wrote", OUT);
