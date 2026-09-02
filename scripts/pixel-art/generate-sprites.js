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

function fillRect(grid, x0, y0, x1, y1, c) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setPx(grid, x, y, c);
}

function write(name, grid) {
  const png = encodePNG(scale2x(grid));
  fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), png);
  console.log(`wrote ${name}.png (${grid[0].length * 2}x${grid.length * 2})`);
}

// 2x 확대 없이 원본 해상도 그대로 저장한다 — 캐릭터는 세부 묘사(머리카락·
// 옷깃·팔다리)가 필요해서, 저해상도 그리드를 확대하면 뭉개진다.
function writeDirect(name, grid) {
  fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), encodePNG(grid));
  console.log(`wrote ${name}.png (${grid[0].length}x${grid.length}, direct)`);
}

// 몸통 실루엣(측면, 오른쪽을 보고 서 있는 자세) — 머리/앞머리/몸통/소매/
// 반바지/다리/신발을 개별 사각형으로 쌓아 사람 형태를 낸다. 각 캐릭터는
// 같은 골격에 색·비율만 바꿔서 통일감을 준다.
function drawKid(g, o, { hair, hairShade, skin, skinShade, shirt, shirtShade, collar, shorts, shortsShade, shoe, ink }, walking = false) {
  const { x, y, s } = o; // 좌상단 기준, s = 스케일(1이면 1px 단위)
  const R = (dx0, dy0, dx1, dy1, c) =>
    fillRect(
      g,
      Math.round(x + dx0 * s),
      Math.round(y + dy0 * s),
      Math.round(x + dx1 * s),
      Math.round(y + dy1 * s),
      c,
    );
  // 뒷머리(정수리~뒤통수)
  R(0, 0, 9, 3, hair);
  R(0, 4, 2, 6, hair);
  // 얼굴
  R(2, 3, 9, 9, skin);
  R(2, 8, 9, 9, skinShade);
  // 앞머리(이마 위로 살짝)
  R(6, 2, 10, 4, hair);
  R(9, 4, 10, 5, hairShade);
  // 눈(진행방향 오른쪽)
  R(8, 5, 8, 5, ink);
  // 목
  R(4, 10, 6, 10, skin);
  // 몸통(셔츠)
  R(1, 11, 9, 18, shirt);
  R(1, 16, 9, 18, shirtShade);
  R(2, 11, 8, 12, collar); // 옷깃
  // 소매/팔
  R(-1, 12, 0, 16, shirt);
  R(9, 12, 10, 16, shirt);
  R(-1, 17, 0, 19, skin); // 팔뚝
  R(9, 17, 10, 19, skin);
  // 반바지
  R(1, 19, 9, 22, shorts);
  R(1, 21, 9, 22, shortsShade);
  // 다리 — walking이면 한쪽은 올리고 한쪽은 내려서 보행감을 낸다(2프레임 걷기)
  const lift = walking ? 1 : 0;
  R(2, 23 - lift, 4, 25 - lift, skin);
  R(6, 23 + lift, 8, 25 + lift, skin);
  // 신발
  R(1, 26 - lift, 4, 27 - lift, shoe);
  R(6, 26 + lift, 9, 27 + lift, shoe);
}

// ── player: 32x32, 그 시절 골목 아이 캐릭터(민트) ──────────────────────
{
  const palette = {
    hair: hex("#6B4A3A"), hairShade: hex("#523628"),
    skin: hex("#F5E1C8"), skinShade: hex("#E0C4A0"),
    shirt: hex("#4FA98F"), shirtShade: hex("#357A66"), collar: hex("#DCEFE9"),
    shorts: hex("#E8DCB8"), shortsShade: hex("#C8B98A"),
    shoe: hex("#357A66"), ink: hex("#2B2A28"),
  };
  const g = makeGrid(32, 32);
  drawKid(g, { x: 6, y: 3, s: 1 }, palette);
  writeDirect("player", g);
  const gw = makeGrid(32, 32);
  drawKid(gw, { x: 6, y: 3, s: 1 }, palette, true);
  writeDirect("player-walk", gw);
}

// ── enemy: 28x28, 골목 상대편 아이(코랄) — 몬스터가 아니라 또래 아이 ────
{
  const palette = {
    hair: hex("#7A4B34"), hairShade: hex("#5C3826"),
    skin: hex("#F5E1C8"), skinShade: hex("#E0C4A0"),
    shirt: hex("#E98A66"), shirtShade: hex("#C4694A"), collar: hex("#FBE3DA"),
    shorts: hex("#EFDCC8"), shortsShade: hex("#D6C2A6"),
    shoe: hex("#C4694A"), ink: hex("#2B2A28"),
  };
  const g = makeGrid(28, 28);
  drawKid(g, { x: 4, y: 1, s: 1 }, palette);
  writeDirect("enemy", g);
  const gw = makeGrid(28, 28);
  drawKid(gw, { x: 4, y: 1, s: 1 }, palette, true);
  writeDirect("enemy-walk", gw);
}

// ── enemy-elite: 40x40, "수학익힘책을 방패처럼 든 6학년 보스" ──────────
{
  const g = makeGrid(40, 40);
  // 덩치 큰 골격을 살짝 키운 스케일로 그린다.
  drawKid(g, { x: 6, y: 2, s: 1.25 }, {
    hair: hex("#4A3527"), hairShade: hex("#372716"),
    skin: hex("#F5E1C8"), skinShade: hex("#E0C4A0"),
    shirt: hex("#E0B85C"), shirtShade: hex("#B98E36"), collar: hex("#F3D48A"),
    shorts: hex("#EFDCC8"), shortsShade: hex("#D6C2A6"),
    shoe: hex("#8A6425"), ink: hex("#2B2A28"),
  });
  // 방패로 든 수학익힘책 — 몸통 앞을 가리는 큰 책, 옆면(종이 단면) +
  // 표지 + 표지 위 라벨(제목칸)로 "책"임을 읽히게 한다.
  const bookCover = hex("#6FA8C9");
  const bookCoverShade = hex("#4F86A8");
  const bookPages = hex("#F7F3E6");
  const bookLabel = hex("#F5C9A0");
  fillRect(g, 9, 15, 30, 34, bookPages); // 종이 단면(살짝 크게, 테두리로 보임)
  fillRect(g, 10, 16, 29, 33, bookCover); // 표지
  fillRect(g, 10, 30, 29, 33, bookCoverShade); // 표지 아래쪽 음영
  fillRect(g, 14, 19, 25, 25, bookLabel); // 제목 라벨
  // "수학"임을 알아보게 라벨 안에 + 기호를 그린다(작은 픽셀에서 숫자보다 기호가 더 잘 읽힘)
  fillRect(g, 18, 20, 21, 21, bookCoverShade);
  fillRect(g, 19, 19, 20, 23, bookCoverShade);
  // 표지에 공책 줄(가로선)을 몇 줄 그어 "익힘책" 느낌 추가
  fillRect(g, 11, 27, 28, 27, bookCoverShade);
  fillRect(g, 11, 29, 28, 29, bookCoverShade);
  // 책 위로 살짝 넘겨보는 눈 두 개(단호한 표정)
  fillRect(g, 15, 12, 16, 13, hex("#2B2A28"));
  fillRect(g, 23, 12, 24, 13, hex("#2B2A28"));
  writeDirect("enemy-elite", g);
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

// ── 드롭 아이템 아이콘(20x20, direct) — 마을/결과 화면 표시용 ───────────
// 던전 안 파밍 지점의 반짝이는 표식은 위 "pickup" 하나로 통일하고(어떤
// 아이템인지는 파밍 시점엔 안 보여줘도 됨), 실제로 뭘 주웠는지는 이
// 아이콘들로 결과창/마을 인벤토리에서 보여준다.

// 딱지 — 접힌 종이, 대각선으로 나뉜 두 색
{
  const g = makeGrid(20, 20);
  const red = hex("#D4537E");
  const redShade = hex("#993556");
  const cream = hex("#F7F3E6");
  fillRect(g, 3, 3, 16, 16, cream);
  for (let y = 3; y <= 16; y++)
    for (let x = 3; x <= 16; x++) if (x - 3 >= y - 3) setPx(g, x, y, red);
  fillRect(g, 3, 3, 16, 3, redShade);
  fillRect(g, 16, 3, 16, 16, redShade);
  writeDirect("toy_ddakji", g);
}

// (삼각자·물감·피젯스피너는 아래 티어별 섹션에서 정의 — 여기서는 딱지만)

// ── 흔함 티어 ──────────────────────────────────────────────────────

// 병뚜껑 — 톱니 모양 테두리가 있는 금속 캡
{
  const g = makeGrid(20, 20);
  const metal = hex("#B9BCC0");
  const metalShade = hex("#8B8E92");
  const label = hex("#D4537E");
  fillEllipse(g, 10, 10, 8, 8, (x, y, dx, dy) => (dy > 0.4 ? metalShade : metal));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    setPx(g, Math.round(10 + Math.cos(a) * 8), Math.round(10 + Math.sin(a) * 8), metalShade);
  }
  fillEllipse(g, 10, 10, 4.5, 4.5, () => label);
  writeDirect("bottle_cap", g);
}

// 고무줄 — 얇은 고리(도넛) 모양
{
  const g = makeGrid(20, 20);
  const band = hex("#E98A66");
  const bandShade = hex("#C4694A");
  fillEllipse(g, 10, 10, 7.5, 5.5, (x, y, dx, dy) => (dy > 0.3 ? bandShade : band));
  fillEllipse(g, 10, 10, 4.5, 2.8, () => [0, 0, 0, 0]);
  writeDirect("rubber_band", g);
}

// 우표 — 톱니 테두리 사각형 + 안쪽 작은 그림
{
  const g = makeGrid(20, 20);
  const paper = hex("#F7F3E6");
  const paperShade = hex("#E0D9C0");
  const ink = hex("#8FC1D9");
  fillRect(g, 3, 3, 16, 16, paper);
  // 톱니(스캘럽) 테두리 — 네 변에 반원 홈을 파서 우표 느낌을 낸다.
  const notch = (cx, cy) => fillEllipse(g, cx, cy, 1.3, 1.3, () => T);
  for (let i = 3; i <= 16; i += 2.6) {
    notch(i, 3);
    notch(i, 16);
    notch(3, i);
    notch(16, i);
  }
  fillRect(g, 6, 6, 13, 13, ink);
  fillRect(g, 6, 12, 13, 13, paperShade);
  writeDirect("stamp", g);
}

// 불량식품 봉지 — 위가 크림프된 삼각 봉지
{
  const g = makeGrid(20, 20);
  const bag = hex("#E0B85C");
  const bagShade = hex("#B98E36");
  for (let y = 4; y <= 17; y++) {
    const half = Math.round(((y - 4) / 13) * 7);
    fillRect(g, 10 - half, y, 10 + half, y, y > 12 ? bagShade : bag);
  }
  for (let i = 0; i < 5; i++) setPx(g, 6 + i * 2, 4, bagShade); // 크림프
  writeDirect("junk_food", g);
}

// 콩주머니 — 위가 묶인 천 주머니, 물방울 패턴
{
  const g = makeGrid(20, 20);
  const cloth = hex("#8FC1D9");
  const dot = hex("#F7F3E6");
  const knot = hex("#5F9FBE");
  fillRect(g, 4, 7, 15, 17, cloth);
  fillRect(g, 8, 4, 11, 7, knot);
  [
    [6, 10], [12, 9], [9, 13], [5, 15], [14, 14],
  ].forEach(([x, y]) => setPx(g, x, y, dot));
  writeDirect("bean_bag", g);
}

// ── 보통 티어 ──────────────────────────────────────────────────────

// 구슬 — 유리구슬(하이라이트 + 속 소용돌이)
{
  const g = makeGrid(20, 20);
  const glass = hex("#8FC1D9");
  const swirl = hex("#5F9FBE");
  const hi = hex("#F7F3E6");
  fillEllipse(g, 10, 10, 7, 7, () => glass);
  fillEllipse(g, 11, 12, 3, 2, () => swirl);
  fillEllipse(g, 7, 7, 2, 1.5, () => hi);
  writeDirect("marble", g);
}

// 제기 — 동전 원판 위로 부채꼴로 퍼지는 종이 술(fringe)
{
  const g = makeGrid(20, 20);
  const disc = hex("#B9BCC0");
  const discShade = hex("#8B8E92");
  const fringe = hex("#D4537E");
  const fringeShade = hex("#993556");
  const baseX = 10, baseY = 14;
  const strands = 9;
  for (let s = 0; s < strands; s++) {
    const angle = (-65 + (130 / (strands - 1)) * s) * (Math.PI / 180) - Math.PI / 2; // 위쪽으로 부채꼴
    const len = 9 + (s % 2 === 0 ? 0 : 1.5);
    const steps = Math.round(len);
    for (let t = 1; t <= steps; t++) {
      const x = Math.round(baseX + Math.cos(angle) * t);
      const y = Math.round(baseY + Math.sin(angle) * t);
      setPx(g, x, y, t > steps - 3 ? fringeShade : fringe);
    }
  }
  fillEllipse(g, baseX, baseY, 3.2, 1.8, (x, y, dx, dy) => (dy > 0.2 ? discShade : disc));
  writeDirect("jegi", g);
}

// 팽이 — 원뿔 몸통 + 색 줄무늬
{
  const g = makeGrid(20, 20);
  const body = hex("#E0B85C");
  const stripe = hex("#D4537E");
  const tip = hex("#4A3527");
  for (let y = 3; y <= 15; y++) {
    const half = Math.round(8 - ((y - 3) / 12) * 6);
    fillRect(g, 10 - half, y, 10 + half, y, (y - 3) % 4 < 2 ? body : stripe);
  }
  fillRect(g, 9, 16, 11, 18, tip);
  writeDirect("spin_top", g);
}

// 삼각자 — 반투명 하늘색 직각삼각형 + 눈금
{
  const g = makeGrid(20, 20);
  const ruler = hex("#8FC1D9");
  const rulerShade = hex("#5F9FBE");
  for (let y = 2; y <= 17; y++) for (let x = 2; x <= 17 - (y - 2); x++) setPx(g, x, y, ruler);
  for (let y = 2; y <= 17; y++) setPx(g, 2, y, rulerShade);
  for (let i = 0; i < 6; i++) setPx(g, 4 + i * 2, 15 - i, rulerShade);
  writeDirect("toy_set_square", g);
}

// 딱풀 — 원통 몸통 + 다른 색 뚜껑
{
  const g = makeGrid(20, 20);
  const body = hex("#F5E1C8");
  const bodyShade = hex("#E0C4A0");
  const cap = hex("#4FA98F");
  fillRect(g, 6, 3, 13, 6, cap);
  fillRect(g, 6, 7, 13, 17, body);
  fillRect(g, 6, 14, 13, 17, bodyShade);
  writeDirect("glue_stick", g);
}

// 크레파스 — 색이 다른 세 자루가 살짝 겹쳐 놓임
{
  const g = makeGrid(20, 20);
  const colors = [hex("#D4537E"), hex("#E0B85C"), hex("#4FA98F")];
  colors.forEach((c, i) => {
    const x0 = 3 + i * 5;
    fillRect(g, x0, 11, x0 + 4, 17, c);
    fillRect(g, x0 + 1, 7, x0 + 3, 11, c); // 뾰족한 끝(사다리꼴 근사)
    setPx(g, x0 + 2, 6, c);
  });
  writeDirect("crayon", g);
}

// 스티커북 — 작은 수첩 + 표지 위 동그란 스티커들
{
  const g = makeGrid(20, 20);
  const cover = hex("#D4537E");
  const coverShade = hex("#993556");
  const page = hex("#F7F3E6");
  fillRect(g, 3, 3, 4, 17, page); // 책등 종이 단면
  fillRect(g, 5, 3, 17, 17, cover);
  fillRect(g, 5, 14, 17, 17, coverShade);
  [hex("#E0B85C"), hex("#4FA98F"), hex("#8FC1D9")].forEach((c, i) =>
    fillEllipse(g, 9 + i * 3, 8, 1.6, 1.6, () => c),
  );
  writeDirect("sticker_book", g);
}

// ── 희귀 티어 ──────────────────────────────────────────────────────

// 요요 — 겹친 원판 두 개 + 줄
{
  const g = makeGrid(20, 20);
  const disc = hex("#4FA98F");
  const discShade = hex("#357A66");
  const string = hex("#DCEFE9");
  fillRect(g, 9, 2, 10, 6, string);
  fillEllipse(g, 10, 12, 6.5, 6.5, (x, y, dx, dy) => (dy > 0.2 ? discShade : disc));
  fillEllipse(g, 10, 12, 2, 2, () => string);
  writeDirect("yoyo", g);
}

// 물감 — 팔레트 + 세 가지 색 물감
{
  const g = makeGrid(20, 20);
  const wood = hex("#E0B85C");
  const woodShade = hex("#B98E36");
  fillEllipse(g, 10, 11, 8, 6, (x, y, dx, dy) => (dy >= 0.5 ? woodShade : wood));
  fillEllipse(g, 10, 10, 5.5, 3.8, () => hex("#F7F3E6"));
  fillEllipse(g, 7, 9, 1.6, 1.6, () => hex("#D4537E"));
  fillEllipse(g, 11, 8, 1.6, 1.6, () => hex("#E0B85C"));
  fillEllipse(g, 13, 11, 1.6, 1.6, () => hex("#4FA98F"));
  writeDirect("toy_paint", g);
}

// 야광팔찌 — 얇은 발광 링 + 반짝임
{
  const g = makeGrid(20, 20);
  const glow = hex("#9FE1CB");
  const glowShade = hex("#5DCAA5");
  const spark = hex("#F7F3E6");
  fillEllipse(g, 10, 10, 7, 6, (x, y, dx, dy) => (Math.abs(dx * dx + dy * dy - 0.7) < 0.35 ? glow : null));
  fillEllipse(g, 10, 10, 7, 6, (x, y, dx, dy) => (dy > 0.5 && dx * dx + dy * dy <= 1 ? glowShade : null));
  setPx(g, 5, 6, spark);
  setPx(g, 6, 5, spark);
  writeDirect("glow_bracelet", g);
}

// 훌라후프 — 색 구간이 나뉜 큰 고리
{
  const g = makeGrid(20, 20);
  const colors = [hex("#D4537E"), hex("#E0B85C"), hex("#4FA98F"), hex("#8FC1D9")];
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 20; x++) {
      const dx = x - 10, dy = y - 10;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r >= 7.5 && r <= 9.5) {
        const angle = Math.atan2(dy, dx);
        const band = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * colors.length);
        setPx(g, x, y, colors[band % colors.length]);
      }
    }
  writeDirect("hula_hoop", g);
}

// 뽑기 캡슐 — 위/아래 색이 나뉜 알
{
  const g = makeGrid(20, 20);
  const top = hex("#F7F3E6");
  const bottom = hex("#D4537E");
  const bottomShade = hex("#993556");
  fillEllipse(g, 10, 10, 7.5, 7.5, (x, y, dx, dy) => (dy < 0 ? top : dy > 0.5 ? bottomShade : bottom));
  fillRect(g, 4, 10, 16, 10, hex("#B9BCC0")); // 이음매
  writeDirect("gacha_capsule", g);
}

// 부메랑 — V자로 꺾인 두 날개
{
  const g = makeGrid(20, 20);
  const body = hex("#B98E36");
  const bodyShade = hex("#8A6425");
  for (let i = 0; i < 12; i++) {
    fillRect(g, 4 + i, 4 + Math.round(i * 0.3), 6 + i, 5 + Math.round(i * 0.3), body);
    fillRect(g, 4 + i, 16 - Math.round(i * 0.9), 6 + i, 17 - Math.round(i * 0.9), bodyShade);
  }
  writeDirect("boomerang", g);
}

// ── 레전드 티어 ────────────────────────────────────────────────────

// 캐릭터 카드 — 금박 테두리 카드 + 가운데 별
{
  const g = makeGrid(20, 20);
  const border = hex("#E0B85C");
  const face = hex("#8FC1D9");
  const star = hex("#F7F3E6");
  fillRect(g, 3, 2, 16, 17, border);
  fillRect(g, 4, 3, 15, 16, face);
  const starPx = [
    [9, 6], [10, 6], [8, 8], [9, 8], [10, 8], [11, 8],
    [9, 9], [10, 9], [8, 11], [11, 11], [7, 13], [12, 13],
  ];
  starPx.forEach(([x, y]) => setPx(g, x, y, star));
  writeDirect("character_card", g);
}

// 딱총 — 장난감 권총 실루엣(테마와 연결)
{
  const g = makeGrid(20, 20);
  const body = hex("#B98E36");
  const bodyShade = hex("#8A6425");
  const grip = hex("#4A3527");
  fillRect(g, 3, 7, 15, 10, body);
  fillRect(g, 3, 9, 15, 10, bodyShade);
  fillRect(g, 13, 5, 16, 7, body); // 공이치기
  fillRect(g, 5, 10, 8, 15, grip); // 손잡이
  writeDirect("cap_gun", g);
}

// 피젯스피너 — 3엽 스피너 + 중심 베어링
{
  const g = makeGrid(20, 20);
  const body = hex("#D4537E");
  const bodyShade = hex("#993556");
  const bearing = hex("#F7F3E6");
  [
    [10, 4],
    [16, 14],
    [4, 14],
  ].forEach(([cx, cy]) => fillEllipse(g, cx, cy, 3.4, 3.4, (x, y, dx, dy) => (dy > 0.3 ? bodyShade : body)));
  fillEllipse(g, 10, 10.5, 3, 3, () => bodyShade);
  fillEllipse(g, 10, 10.5, 1.6, 1.6, () => bearing);
  writeDirect("toy_fidget_spinner", g);
}

// ── ground: 16x16 → 32x32, 정사각 바닥 타일(탑뷰 TileSprite로 사방 반복) ──
{
  const base = hex("#DCCFA6");
  const dark = hex("#C8B98A");
  const light = hex("#E8DCB8");
  const g = makeGrid(16, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) g[y][x] = base;
  const specks = [
    [2, 2, dark], [7, 1, light], [12, 3, dark], [4, 6, light],
    [10, 7, dark], [14, 9, light], [1, 10, dark], [8, 12, light],
    [13, 13, dark], [3, 14, light], [6, 9, dark],
  ];
  specks.forEach(([x, y, c]) => setPx(g, x, y, c));
  write("ground", g);
}

console.log("done");
