// 블루프린트 비주얼 방향(아웃라인 없는 소프트 픽셀, 따뜻한 파스텔)에 맞춘
// 전투 스프라이트를 절차적으로 그려 public/assets/sprites/*.png로 내보낸다.
// 외부 이미지 생성 도구가 없어서, 저해상도 그리드에 도형을 채운 뒤 2배로
// 확대(nearest-neighbor)해 통통한 픽셀 느낌을 낸다. DungeonScene이 쓰는
// 텍스처 키·최종 픽셀 크기는 기존 placeholder(textures.ts)와 동일하게
// 맞춰서, 물리 바디 크기 등 게임 코드는 손댈 필요가 없다.
const fs = require("fs");
const path = require("path");
const { encodePNG } = require("./png-encoder");

const OUT_DIR = path.join(__dirname, "..", "..", "public", "assets", "sprites");
fs.mkdirSync(OUT_DIR, { recursive: true });

function hex(c) {
  const n = parseInt(c.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}
const T = [0, 0, 0, 0]; // transparent

function makeGrid(w, h) {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => T));
}

function scale2x(grid) {
  const h = grid.length, w = grid[0].length;
  const out = makeGrid(w * 2, h * 2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      out[y * 2][x * 2] = grid[y][x];
      out[y * 2][x * 2 + 1] = grid[y][x];
      out[y * 2 + 1][x * 2] = grid[y][x];
      out[y * 2 + 1][x * 2 + 1] = grid[y][x];
    }
  return out;
}

function fillEllipse(grid, cx, cy, rx, ry, colorAt) {
  const h = grid.length, w = grid[0].length;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        const c = colorAt(x, y, dx, dy);
        if (c) grid[y][x] = c;
      }
    }
}

function setPx(grid, x, y, c) {
  if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) grid[y][x] = c;
}

function write(name, grid) {
  const png = encodePNG(scale2x(grid));
  fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), png);
  console.log(`wrote ${name}.png (${grid[0].length * 2}x${grid.length * 2})`);
}

// ── player: 16x16 → 32x32, 그 시절 골목 아이 캐릭터, 민트 톤 ──────────
{
  const skin = hex("#F5E1C8");
  const skinShade = hex("#E0C4A0");
  const coat = hex("#4FA98F");
  const coatShade = hex("#357A66");
  const ink = hex("#2B2A28");

  const g = makeGrid(16, 16);
  fillEllipse(g, 8, 5, 3.2, 3, (x, y) => (y >= 6 ? skinShade : skin));
  // 모자/후드
  fillEllipse(g, 8, 3.4, 3.4, 2, (x, y, dx, dy) => (dy <= 0.2 ? coat : null));
  // 몸통
  fillEllipse(g, 8, 11, 3.4, 4, (x, y) => (y >= 13 ? coatShade : coat));
  setPx(g, 10, 5, ink); // 진행방향(오른쪽) 쪽 눈
  setPx(g, 7, 15, skinShade);
  setPx(g, 10, 15, skinShade);
  write("player", g);
}

// ── enemy: 14x14 → 28x28, 상상 속 귀여운 블롭 괴수(코랄) ───────────────
{
  const body = hex("#E98A66");
  const shade = hex("#C4694A");
  const hi = hex("#F5B79B");
  const ink = hex("#2B2A28");

  const g = makeGrid(14, 14);
  fillEllipse(g, 7, 8, 5.4, 4.6, (x, y) => {
    if (y <= 4) return hi;
    if (y >= 10) return shade;
    return body;
  });
  setPx(g, 5, 2, shade);
  setPx(g, 9, 2, shade); // 더듬이 두 개
  setPx(g, 5, 7, ink);
  setPx(g, 9, 7, ink); // 눈
  write("enemy", g);
}

// ── enemy-elite: 20x20 → 40x40, 더 큰 블롭 + 뿔(가시) 3개(골드) ────────
{
  const body = hex("#E0B85C");
  const shade = hex("#B98E36");
  const hi = hex("#F3D48A");
  const ink = hex("#2B2A28");

  const g = makeGrid(20, 20);
  fillEllipse(g, 10, 11, 8, 7, (x, y) => {
    if (y <= 6) return hi;
    if (y >= 15) return shade;
    return body;
  });
  // 가시 3개
  [6, 10, 14].forEach((sx) => {
    setPx(g, sx, 3, shade);
    setPx(g, sx, 4, shade);
  });
  setPx(g, 7, 10, ink);
  setPx(g, 7, 11, ink);
  setPx(g, 13, 10, ink);
  setPx(g, 13, 11, ink);
  write("enemy-elite", g);
}

// ── bullet: 4x4 → 8x8, BB탄 ────────────────────────────────────────
{
  const body = hex("#ECE7D5");
  const hiC = hex("#FFFFFF");
  const g = makeGrid(4, 4);
  fillEllipse(g, 1.8, 1.8, 1.7, 1.7, () => body);
  setPx(g, 1, 1, hiC);
  write("bullet", g);
}

// ── pickup: 10x10 → 20x20, 무기 파츠(다이아몬드 컷) ─────────────────
{
  const body = hex("#E0B85C");
  const shade = hex("#B98E36");
  const hi = hex("#F3D48A");
  const g = makeGrid(10, 10);
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 10; x++) {
      const d = Math.abs(x - 4.5) + Math.abs(y - 4.5);
      if (d <= 4.2) {
        if (x < 4.5 && y < 4.5) g[y][x] = hi;
        else if (x >= 4.5 && y >= 4.5) g[y][x] = shade;
        else g[y][x] = body;
      }
    }
  write("pickup", g);
}

// ── ground: 32x8 → 64x16, 흙길 타일(반복 배치 가능) ─────────────────
{
  const base = hex("#DCCFA6");
  const dark = hex("#C8B98A");
  const light = hex("#E8DCB8");
  const g = makeGrid(32, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) g[y][x] = base;
  const specks = [
    [3, 1, dark], [9, 2, light], [14, 1, dark], [20, 2, dark],
    [25, 1, light], [6, 4, light], [17, 4, dark], [28, 3, dark],
    [2, 5, dark], [22, 5, light],
  ];
  specks.forEach(([x, y, c]) => setPx(g, x, y, c));
  write("ground", g);
}

console.log("done");
