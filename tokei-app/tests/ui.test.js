// 実行：NODE_PATH=$(npm root -g) node --test tests/
// Chromium（Playwright）で index.html を動かす画面テスト。iPad Safari 実機の代わりではない。
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const INDEX = path.join(__dirname, '..', 'index.html');
let server, baseUrl, browser;

test.before(async () => {
  server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(INDEX));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = 'http://127.0.0.1:' + server.address().port + '/';
  browser = await chromium.launch();
});
test.after(async () => {
  if (browser) await browser.close();
  if (server) server.close();
});

async function open(opts = {}) {
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1024, height: 768 },
    hasTouch: !!opts.touch,
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => (opts.onDialog ? opts.onDialog(d) : d.accept()));
  await page.goto(baseUrl);
  await page.waitForSelector('.s0');
  return { context, page, errors };
}

// profiles: [{code, preset, over}]
async function seed(page, profiles, device) {
  await page.evaluate(({ profiles, device }) => {
    const C = window.TokeiCore;
    const list = profiles.map((p, i) => {
      let s = C.defaultSettings();
      if (p.preset) s = C.applyPreset(s, p.preset);
      s = C.normalizeSettings(Object.assign(s, p.over || {}));
      return { id: 'p' + i + p.code, code: p.code, order: i, settings: s };
    });
    localStorage.setItem('tokei.v1.profiles', JSON.stringify(list));
    const dev = Object.assign({ skipCodeSelection: false, lastProfileId: null }, device || {});
    if (dev.lastProfileId === 'first') dev.lastProfileId = list[0].id;
    localStorage.setItem('tokei.v1.device', JSON.stringify(dev));
  }, { profiles, device });
  await page.reload();
  await page.waitForSelector('.s0');
}

async function startAs(page, code) {
  await page.click(`.btn.code:text-is("${code}")`);
  await page.click('.btn.start');
  await page.waitForSelector('.s1');
}

async function sessions(page) {
  return page.evaluate(() => window.__tokei.idbGetAll('sessions'));
}
async function runState(page) {
  return page.evaluate(() => {
    const r = window.__tokei.state.run;
    return r && { idx: r.idx, current: r.current, target: r.q.targetTime12, correctOptionId: r.q.correctOptionId, state: r.state, task: r.q.task, options: r.q.options };
  });
}
// 時計上の点（角度・半径は viewBox 240 基準）→ 画面座標
async function clockPoint(page, angle, radius, sel = '#makeClock svg') {
  return page.evaluate(({ angle, radius, sel }) => {
    const svg = document.querySelector(sel);
    const rad = angle * Math.PI / 180;
    const pt = svg.createSVGPoint();
    pt.x = 120 + radius * Math.sin(rad);
    pt.y = 120 - radius * Math.cos(rad);
    const p = pt.matrixTransform(svg.getScreenCTM());
    return { x: p.x, y: p.y };
  }, { angle, radius, sel });
}
async function angles(page, sel = '#makeClock svg') {
  return page.evaluate((sel) => {
    const s = document.querySelector(sel);
    return { hour: Number(s.dataset.hourAngle), minute: Number(s.dataset.minuteAngle) };
  }, sel);
}
async function tapClock(page, angle, radius = 78) {
  const p = await clockPoint(page, angle, radius);
  await page.mouse.click(p.x, p.y);
}
async function answerCorrect(page) {
  const st = await runState(page);
  await page.click(`[data-opt="${st.correctOptionId}"]`);
}
async function answerWrong(page) {
  const st = await runState(page);
  const wrong = st.options.find((o) => o.id !== st.correctOptionId);
  await page.click(`[data-opt="${wrong.id}"]`);
}
async function makeByTap(page, target) {
  const h = Math.floor(target / 60) || 12, m = target % 60;
  const hasSelect = await page.$('.hand-select');
  if (hasSelect) {
    await page.click('[data-hand="long"]');
    await tapClock(page, m * 6, 95);
    await page.click('[data-hand="short"]');
  }
  await tapClock(page, h * 30, 80);
}
async function passGate(page, correct = true) {
  await page.waitForSelector('.t0');
  const a = Number(await page.textContent('#gateA'));
  const b = Number(await page.textContent('#gateB'));
  const ans = String(correct ? a * b : a * b + 1);
  for (const ch of ans) await page.click(`[data-action="gateKey"][data-k="${ch}"]`);
  await page.click('[data-action="gateOk"]');
  return a + 'x' + b;
}
async function cdpTouchDrag(context, page, points) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: points[0].x, y: points[0].y }] });
  for (const p of points.slice(1)) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

// ---------------------------------------------------------------------------

test('基準1: 保存済み設定なら「記号→はじめる」の2タップで第1問、省略設定なら「はじめる」1タップ', async () => {
  const { context, page, errors } = await open();
  await seed(page, [{ code: 'A', preset: 'seijiYomu' }, { code: 'B', preset: 'seijiTsukuru' }]);
  assert.equal(await page.isDisabled('.btn.start'), true);
  await page.click('.btn.code:text-is("A")');
  await page.click('.btn.start');
  await page.waitForSelector('.s1.task-readTime');

  await seed(page, [{ code: 'A', preset: 'seijiTsukuru' }], { skipCodeSelection: true, lastProfileId: 'first' });
  assert.equal(await page.$$eval('.btn.code', (x) => x.length), 0);
  await page.click('.btn.start');
  await page.waitForSelector('.s1.task-makeTime');
  assert.deepEqual(errors, []);
  await context.close();
});

const IPAD_VIEWPORTS = [
  // 画面全体と、Safari のツールバー分を引いた表示領域（目安）
  { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 1024, height: 680 }, { width: 768, height: 940 },
  { width: 1180, height: 820 }, { width: 820, height: 1180 }, { width: 1180, height: 740 }, { width: 820, height: 1100 },
  { width: 1133, height: 744 }, { width: 744, height: 1133 }, { width: 1133, height: 670 }, { width: 744, height: 1050 },
  { width: 1366, height: 1024 }, { width: 1024, height: 1366 }, { width: 1080, height: 810 }, { width: 810, height: 1080 }
];
async function assertNoOverflow(page, label) {
  const r = await page.evaluate(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const bad = [];
    document.querySelectorAll('#app button, #app .prompt, #app svg.clock, #app .textcard, #app .scene-card, #app .feedback, #app .hinttext').forEach((el) => {
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) return;
      if (b.bottom > vh + 0.5 || b.right > vw + 0.5 || b.top < -0.5 || b.left < -0.5) bad.push(el.className.baseVal || el.className);
    });
    // 選択肢の中身がボタンからはみ出していないか
    document.querySelectorAll('#app .btn.opt').forEach((btn) => {
      const bb = btn.getBoundingClientRect();
      btn.querySelectorAll('svg, img, .scene-label').forEach((c) => {
        const b = c.getBoundingClientRect();
        if (b.bottom > bb.bottom + 1 || b.top < bb.top - 1) bad.push('inside-opt:' + (c.className.baseVal || c.className || c.tagName));
      });
      if (bb.height < 44) bad.push('tiny-opt');
    });
    const se = document.scrollingElement;
    return { bad, scroll: se.scrollHeight > se.clientHeight + 1 || se.scrollWidth > se.clientWidth + 1 };
  });
  assert.deepEqual(r.bad, [], label);
  assert.equal(r.scroll, false, label + ' page scroll');
}

test('基準2: 児童画面（S0・全課題の S1・S2）が iPad の主要サイズでスクロール不要・はみ出しなし', async () => {
  const tasks = [
    ['sameClock', { minutePreset: 'hour', allowedHours: [1, 2, 3, 4, 5, 6] }],
    ['selectShortHand', { minutePreset: 'hourAndHalf', allowedHours: [1, 2, 3, 4, 5, 6] }],
    ['readMinute', { minutePreset: 'five' }],
    ['readTime', { minutePreset: 'five' }],
    ['makeTime', { minutePreset: 'five' }],
    ['analogToText', { minutePreset: 'five', timeFormat: 'digital' }],
    ['textToAnalog', { minutePreset: 'five' }],
    ['clockToScene', { showSceneClockModel: true, includePeriod: true }],
    ['sceneToClock', { showSceneClockModel: true, includePeriod: true }],
    ['periodFromScene', { showSceneClockModel: true }]
  ];
  const profiles = tasks.map(([task, over], i) => ({ code: String.fromCharCode(65 + i), over: Object.assign({ task, optionCount: 4, audio: true, hints: 'manual' }, over) }));
  profiles.push({ code: 'K' }, { code: 'L' });
  const { context, page, errors } = await open();
  await seed(page, profiles);
  for (const vp of IPAD_VIEWPORTS) {
    await page.setViewportSize(vp);
    await page.reload();
    await page.waitForSelector('.s0');
    await assertNoOverflow(page, `S0 ${vp.width}x${vp.height}`);
    for (let i = 0; i < tasks.length; i++) {
      await page.reload();
      await page.waitForSelector('.s0');
      await startAs(page, String.fromCharCode(65 + i));
      const label = `${tasks[i][0]} ${vp.width}x${vp.height}`;
      await assertNoOverflow(page, label);
      // ヒント最大（H3）でもはみ出さない
      for (let k = 0; k < 3; k++) await page.click('.hintbtn');
      await assertNoOverflow(page, label + ' H3');
      // 誤答2回後（「せんせいと」表示）
      if (tasks[i][0] !== 'makeTime') {
        await answerWrong(page); await answerWrong(page);
        await page.waitForSelector('.helpbtn');
        await assertNoOverflow(page, label + ' help');
        await answerCorrect(page);
      } else {
        const st = await runState(page);
        await page.click('.done-btn'); await page.click('.done-btn');
        await assertNoOverflow(page, label + ' help');
        await makeByTap(page, st.target);
        await page.click('.done-btn');
      }
      await page.waitForSelector('.btn.next');
      await assertNoOverflow(page, label + ' correct');
    }
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test('基準2: S2 と 12個の記号の S0 もスクロール不要', async () => {
  const { context, page } = await open();
  await seed(page, 'ABCDEFGHIJKL'.split('').map((c) => ({ code: c, over: { questionCount: 3 } })));
  for (const vp of IPAD_VIEWPORTS) {
    await page.setViewportSize(vp);
    await assertNoOverflow(page, `S0x12 ${vp.width}x${vp.height}`);
  }
  await startAs(page, 'A');
  for (let i = 0; i < 3; i++) { await answerCorrect(page); await page.click('.btn.next'); }
  await page.waitForSelector('.s2');
  for (const vp of IPAD_VIEWPORTS) {
    await page.setViewportSize(vp);
    await assertNoOverflow(page, `S2 ${vp.width}x${vp.height}`);
  }
  await context.close();
});

test('基準7: 12:00 で針が重なっても、ボタンで長針・短針を選んで操作できる', async () => {
  const { context, page, errors } = await open();
  await seed(page, [{ code: 'A', over: { task: 'makeTime', minutePreset: 'hourAndHalf', allowedHours: [3] } }]);
  await startAs(page, 'A');
  assert.deepEqual(await angles(page), { hour: 0, minute: 0 }); // 12:00 で重なっている
  // 重なっている針そのものをタップしても何も変わらない
  const onHands = await clockPoint(page, 0, 40);
  await page.mouse.click(onHands.x, onHands.y);
  assert.deepEqual(await angles(page), { hour: 0, minute: 0 });
  await page.click('[data-hand="long"]');
  assert.equal(await page.getAttribute('[data-hand="long"]', 'aria-pressed'), 'true');
  await tapClock(page, 180, 95);
  assert.deepEqual(await angles(page), { hour: 15, minute: 180 }); // 12:30
  await page.click('[data-hand="short"]');
  await tapClock(page, 90, 80);
  assert.deepEqual(await angles(page), { hour: 105, minute: 180 }); // 3:30
  // 12:00 に戻して短針だけを動かす
  await page.click('[data-hand="long"]');
  await tapClock(page, 0, 95);
  await page.click('[data-hand="short"]');
  await tapClock(page, 0, 80);
  assert.deepEqual(await angles(page), { hour: 0, minute: 0 });
  await page.click('[data-hand="short"]');
  await tapClock(page, 90, 80);
  assert.deepEqual(await angles(page), { hour: 90, minute: 0 });
  assert.deepEqual(errors, []);
  await context.close();
});

test('基準8・9・10: B はタップだけで全問完了でき、「できた」で判定し、途中の時刻を数字で出さない', async () => {
  for (const [preset, input] of [['hour', 'dragAndTap'], ['hourAndHalf', 'tapOnly'], ['five', 'tapOnly'], ['five', 'dragAndTap']]) {
    const { context, page, errors } = await open({ touch: true });
    await seed(page, [{ code: 'A', over: { task: 'makeTime', minutePreset: preset, allowedHours: [12, 3, 11], questionCount: 10, constructionInput: input } }]);
    await startAs(page, 'A');
    for (let i = 0; i < 10; i++) {
      const st = await runState(page);
      await makeByTap(page, st.target);
      // 針を離しただけでは判定しない
      assert.equal((await runState(page)).state, 'answering');
      assert.equal(await page.$('.btn.next'), null);
      // 操作中の現在時刻（数字）を表示しない：画面の文字は問題文の目標だけ
      const txt = await page.evaluate(() => { const c = document.querySelector('.s1').cloneNode(true); c.querySelectorAll('svg').forEach((x) => x.remove()); return c.textContent; });
      const digits = (txt.match(/\d+/g) || []).join(',');
      const tgt = await page.textContent('.prompt .target');
      assert.equal(digits, (tgt.match(/\d+/g) || []).join(','), 'no current time shown');
      await page.click('.done-btn');
      assert.equal((await runState(page)).state, 'correct', `${preset} q${i}`);
      await page.click('.btn.next');
    }
    await page.waitForSelector('.s2');
    const ss = await sessions(page);
    assert.equal(ss[0].status, 'completed');
    assert.ok(ss[0].results.every((r) => r.finalOutcome === 'firstH0' && r.inputMethod.join() === 'tap'));
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test('基準10: 誤答しても正答を見せない（選択式・つくる）', async () => {
  const { context, page } = await open();
  await seed(page, [{ code: 'A', over: { task: 'readTime', optionCount: 3, allowedHours: [3, 6, 9] } }, { code: 'B', over: { task: 'makeTime' } }]);
  await startAs(page, 'A');
  await answerWrong(page);
  assert.equal((await runState(page)).state, 'retry');
  assert.equal(await page.$$eval('.btn.opt.selected, .btn.opt.hinted', (x) => x.length), 0);
  assert.equal(await page.textContent('.feedback'), 'もういちど');
  assert.equal(await page.$('.hinttext'), null); // manual なので自動ヒントも出ない
  await page.reload(); await page.waitForSelector('.s0');
  await startAs(page, 'B');
  await page.click('.done-btn');
  assert.equal((await runState(page)).state, 'retry');
  assert.equal(await page.$('.ghost-short'), null);
  await context.close();
});

test('基準21・22（マウス）: 3:30 で短針に触れて少し動かしても3のまま、4までドラッグで4:30（4と5の中間）', async () => {
  const { context, page, errors } = await open();
  await seed(page, [{ code: 'A', over: { task: 'makeTime', minutePreset: 'hourAndHalf', allowedHours: [3] } }]);
  await startAs(page, 'A');
  await makeByTap(page, 3 * 60 + 30);
  assert.deepEqual(await angles(page), { hour: 105, minute: 180 });
  // 短針(105°)をつまんで少しだけ動かす
  let p = await clockPoint(page, 105, 40);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (const a of [108, 112, 116, 112, 100, 94, 100]) { const q = await clockPoint(page, a, 42); await page.mouse.move(q.x, q.y, { steps: 2 }); assert.equal((await angles(page)).hour, 105, 'during a=' + a); }
  await page.mouse.up();
  assert.deepEqual(await angles(page), { hour: 105, minute: 180 });
  assert.equal((await runState(page)).current, 210);
  // 4の数字の位置までドラッグ（仕様9-3の式では 3/4 の境界がちょうど「4」の中心(120°)。
  // 画面座標は整数に丸められるので、「4」の文字の上で中心より少し先（121°・124°）を使う）
  for (const end of [121, 124]) {
    await makeByTap(page, 210);
    p = await clockPoint(page, 105, 40);
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    for (const a of [110, 115, 118, end]) { const q = await clockPoint(page, a, 78); await page.mouse.move(q.x, q.y, { steps: 3 }); }
    await page.mouse.up();
    assert.equal((await runState(page)).current, 270, 'end=' + end);
    assert.deepEqual(await angles(page), { hour: 135, minute: 180 });
  }
  // 参考（仕様どおりの挙動の記録）：「4」の文字の中心より手前（118°）で指を離すと 3:30 のまま
  await makeByTap(page, 210);
  p = await clockPoint(page, 105, 40);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (const a of [110, 115, 118]) { const q = await clockPoint(page, a, 78); await page.mouse.move(q.x, q.y, { steps: 3 }); }
  await page.mouse.up();
  assert.equal((await runState(page)).current, 210);
  assert.deepEqual(errors, []);
  await context.close();
});

test('基準21・22・20（タッチのエミュレーション）: 同じ操作をタッチで行い、ページもスクロールしない', async () => {
  for (const vp of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
    const { context, page, errors } = await open({ touch: true, viewport: vp });
    await seed(page, [{ code: 'A', over: { task: 'makeTime', minutePreset: 'hourAndHalf', allowedHours: [3] } }]);
    await startAs(page, 'A');
    await makeByTap(page, 210);
    const pts = async (list, r) => { const out = []; for (const a of list) out.push(await clockPoint(page, a, r)); return out; };
    await cdpTouchDrag(context, page, await pts([105, 107, 110, 113, 110, 102, 97], 40));
    assert.equal((await runState(page)).current, 210);
    assert.deepEqual(await angles(page), { hour: 105, minute: 180 });
    // 大きく縦方向に指を動かしてもスクロールしない
    const a = await clockPoint(page, 105, 40);
    await cdpTouchDrag(context, page, [a, { x: a.x, y: a.y + 60 }, { x: a.x, y: a.y + 200 }, { x: a.x, y: a.y + 400 }]);
    const sc = await page.evaluate(() => ({ y: window.scrollY, x: window.scrollX, se: document.scrollingElement.scrollTop }));
    assert.deepEqual(sc, { y: 0, x: 0, se: 0 });
    // 4 までドラッグ
    await page.click('[data-hand="long"]'); await tapClock(page, 180, 95); await page.click('[data-hand="short"]'); await tapClock(page, 90, 80);
    await cdpTouchDrag(context, page, await pts([105, 109, 113, 117, 121], 40).then(async (x) => x.concat(await pts([121], 78))));
    assert.equal((await runState(page)).current, 270);
    assert.deepEqual(await angles(page), { hour: 135, minute: 180 });
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test('基準6（画面）: 長針のドラッグで 11:55→12:00→12:05 と進み、短針も 357.5°→0°→2.5°', async () => {
  const { context, page, errors } = await open();
  await seed(page, [{ code: 'A', over: { task: 'makeTime', minutePreset: 'five', allowedHours: [3] } }]);
  await startAs(page, 'A');
  await makeByTap(page, 11 * 60 + 55);
  assert.deepEqual(await angles(page), { hour: 357.5, minute: 330 });
  await page.click('[data-hand="long"]');
  const p = await clockPoint(page, 330, 70);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  const seen = [];
  for (let a = 332; a <= 390; a += 3) {
    const q = await clockPoint(page, a % 360, 70);
    await page.mouse.move(q.x, q.y);
    seen.push((await angles(page)).hour);
  }
  await page.mouse.up();
  assert.ok(seen.includes(357.5) && seen.includes(0) && seen.includes(2.5), JSON.stringify(seen));
  assert.equal((await runState(page)).current, 5);
  // 逆回しで 11:55 に戻る
  const p2 = await clockPoint(page, 30, 70);
  await page.mouse.move(p2.x, p2.y); await page.mouse.down();
  for (let a = 28; a >= -30; a -= 3) { const q = await clockPoint(page, (a + 360) % 360, 70); await page.mouse.move(q.x, q.y); }
  await page.mouse.up();
  assert.equal((await runState(page)).current, 715);
  assert.deepEqual(errors, []);
  await context.close();
});

test('基準11・16: H1〜H3 を問題ごとに記録し、初回H0・再試行H0・ヒント後・模倣・教師と・未完を区別する', async () => {
  const { context, page, errors } = await open();
  await seed(page, [{ code: 'A', over: { task: 'readTime', questionCount: 10, allowedHours: [3, 6, 9], hints: 'manual' } }]);
  await startAs(page, 'A');
  // Q1 初回H0
  await answerCorrect(page); await page.click('.btn.next');
  // Q2 再試行H0
  await answerWrong(page); await answerCorrect(page); await page.click('.btn.next');
  // Q3 H1 後
  await page.click('.hintbtn'); await answerCorrect(page); await page.click('.btn.next');
  // Q4 H1→H2 後
  await page.click('.hintbtn'); await page.click('.hintbtn'); await answerCorrect(page); await page.click('.btn.next');
  // Q5 H3（模倣）
  await page.click('.hintbtn'); await page.click('.hintbtn'); await page.click('.hintbtn');
  assert.equal(await page.isDisabled('.hintbtn'), true);
  await answerCorrect(page); await page.click('.btn.next');
  // Q6 誤答2回→「せんせいと」→教師入口→外部支援を記録して いっしょに答える
  await answerWrong(page); await answerWrong(page);
  await page.click('.helpbtn');
  await passGate(page);
  await page.waitForSelector('.help');
  await page.check('input[name=support][value="ゆびさし"]');
  await page.click('[data-action="helpTogether"]');
  await page.waitForSelector('.s1');
  await answerCorrect(page); await page.click('.btn.next');
  // Q7 教師入口で不正解 → S1 に戻る（T1 には入れない）→ とばす（未完）
  await answerWrong(page); await answerWrong(page);
  await page.click('.helpbtn'); await passGate(page, false);
  await page.waitForSelector('.s1');
  await page.click('.helpbtn'); await passGate(page);
  await page.click('[data-action="helpSkip"]');
  await page.waitForSelector('.s1');
  // Q8 H3 の後も誤答 → teacherHelp（勝手に正解扱いにしない）
  for (let k = 0; k < 3; k++) await page.click('.hintbtn');
  await answerWrong(page);
  assert.equal((await runState(page)).state, 'teacherHelp');
  assert.ok(await page.$('.helpbtn'));
  await answerCorrect(page); await page.click('.btn.next');
  // Q9 学習をここで終わる → 残りは未完
  await page.click('.hintbtn');
  await answerWrong(page); await answerWrong(page);
  await page.click('.helpbtn'); await passGate(page);
  await page.click('[data-action="helpEnd"]');
  await page.waitForSelector('.s0');

  const [ss] = await sessions(page);
  const oc = ss.results.map((r) => r && r.finalOutcome);
  assert.deepEqual(oc.slice(0, 9), ['firstH0', 'retryH0', 'afterHint', 'afterHint', 'imitation', 'teacherSupported', 'incomplete', 'imitation', 'incomplete']);
  assert.deepEqual(ss.results[2].hintsShown.map((h) => h.level), [1]);
  assert.deepEqual(ss.results[3].hintsShown.map((h) => h.level), [1, 2]);
  assert.deepEqual(ss.results[4].hintsShown.map((h) => h.level), [1, 2, 3]);
  assert.equal(ss.results[4].maxHint, 3);
  assert.deepEqual(ss.results[5].externalSupport, ['ゆびさし']);
  assert.equal(ss.status, 'endedByTeacher');
  // 教師結果画面で区分が見分けられる
  await page.click('.teacher-link'); await passGate(page);
  await page.click('[data-action="toT3"]');
  await page.waitForSelector('.rtable');
  await page.click('[data-action="t3Open"]');
  const detail = await page.textContent('.dtable');
  for (const w of ['初回・ヒントなし', '再試行・ヒントなし', 'ヒント後（H1〜H2）', '模倣（H3見本後）', '教師と（外部支援）', '未完', 'H1(手動) H2(手動) H3(手動)']) {
    assert.ok(detail.includes(w), w);
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test('10-1: 誤答後自動ヒント（autoAfterError）は誤答1回ごとに1段階、ヒントOFFでは2回誤答で「せんせいと」', async () => {
  const { context, page } = await open();
  await seed(page, [{ code: 'A', preset: 'miruAwaseru', over: { optionCount: 3, allowedHours: [3, 6, 9] } }, { code: 'B', over: { hints: 'off', allowedHours: [3, 6, 9] } }]);
  await startAs(page, 'A');
  assert.equal(await page.$('.hintbtn'), null);
  await answerWrong(page);
  let run = await page.evaluate(() => window.__tokei.state.run.hintLevel);
  assert.equal(run, 1);
  await answerWrong(page);
  run = await page.evaluate(() => window.__tokei.state.run.hintLevel);
  assert.equal(run, 2);
  assert.ok(await page.$('.helpbtn'));
  await page.reload(); await page.waitForSelector('.s0');
  await startAs(page, 'B');
  assert.equal(await page.$('.hintbtn'), null);
  await answerWrong(page);
  assert.equal(await page.$('.helpbtn'), null);
  await answerWrong(page);
  assert.ok(await page.$('.helpbtn'));
  assert.equal(await page.evaluate(() => window.__tokei.state.run.hintLevel), 0);
  await context.close();
});

test('基準17: 再読み込み後も保存済み設定と過去結果が残る（中断セッションは「中断」になる）', async () => {
  const { context, page } = await open();
  await seed(page, [{ code: 'A', over: { questionCount: 3, allowedHours: [3, 6, 9] } }]);
  await startAs(page, 'A');
  for (let i = 0; i < 3; i++) { await answerCorrect(page); await page.click('.btn.next'); }
  await page.waitForSelector('.s2');
  await page.click('[data-action="again"]');
  await page.waitForSelector('.s1');
  await answerCorrect(page);
  await page.reload();
  await page.waitForSelector('.s0');
  const ss = await sessions(page);
  assert.equal(ss.length, 2);
  const st = ss.map((x) => x.status).sort();
  assert.deepEqual(st, ['completed', 'interrupted']);
  const prof = await page.evaluate(() => JSON.parse(localStorage.getItem('tokei.v1.profiles')));
  assert.equal(prof[0].code, 'A');
  assert.equal(prof[0].settings.questionCount, 3);
  await context.close();
});

test('基準18: 日課カードを編集しても過去結果の時刻・名称・成績が変わらない', async () => {
  const { context, page } = await open();
  await seed(page, [{ code: 'A', over: { task: 'clockToScene', questionCount: 3, sceneIds: ['sc-okiru', 'sc-gakkou', 'sc-kyushoku'] } }]);
  await startAs(page, 'A');
  for (let i = 0; i < 3; i++) { await answerCorrect(page); await page.click('.btn.next'); }
  await page.waitForSelector('.s2');
  await page.click('[data-action="toS0"]');
  await page.click('.teacher-link'); await passGate(page);
  await page.click('[data-action="toT3"]'); await page.waitForSelector('.rtable');
  await page.click('[data-action="t3Open"]');
  const before = await page.textContent('.dtable');
  const beforeRow = await page.textContent('.rtable tbody tr');
  // T2 で名称・時刻を変更、カードを削除
  await page.click('[data-action="toT1"]'); await page.click('[data-action="toT2"]');
  await page.waitForSelector('.stable');
  await page.fill('tr[data-scene="sc-okiru"] .slabel', 'めがさめる');
  await page.dispatchEvent('tr[data-scene="sc-okiru"] .slabel', 'change');
  await page.selectOption('tr[data-scene="sc-okiru"] select[data-scene-field="hour"]', '6');
  await page.click('tr[data-scene="sc-gakkou"] [data-action="sceneDelete"]');
  await page.waitForSelector('tr[data-scene="sc-gakkou"]', { state: 'detached' });
  await page.reload(); await page.waitForSelector('.s0');
  const scenes = await page.evaluate(() => JSON.parse(localStorage.getItem('tokei.v1.scenes')));
  assert.equal(scenes.find((s) => s.id === 'sc-okiru').label, 'めがさめる');
  assert.equal(scenes.find((s) => s.id === 'sc-okiru').minuteOfDay, 360);
  await page.click('.teacher-link'); await passGate(page);
  await page.click('[data-action="toT3"]'); await page.waitForSelector('.rtable');
  await page.click('[data-action="t3Open"]');
  assert.equal(await page.textContent('.dtable'), before);
  assert.equal(await page.textContent('.rtable tbody tr'), beforeRow);
  assert.ok(before.includes('おきる'));
  await context.close();
});

test('基準19: 音声OFFでは「きく」ボタンがなく、最後まで成立する（全課題）', async () => {
  const tasks = ['sameClock', 'selectShortHand', 'readMinute', 'readTime', 'makeTime', 'analogToText', 'textToAnalog', 'clockToScene', 'sceneToClock', 'periodFromScene'];
  const { context, page, errors } = await open();
  await page.addInitScript(() => { try { delete window.speechSynthesis; } catch (e) {} });
  await seed(page, tasks.map((t, i) => ({ code: String.fromCharCode(65 + i), over: { task: t, questionCount: 3, audio: false, minutePreset: t === 'readMinute' ? 'hourAndHalf' : 'hour' } })));
  for (let i = 0; i < tasks.length; i++) {
    await page.reload(); await page.waitForSelector('.s0');
    await startAs(page, String.fromCharCode(65 + i));
    assert.equal(await page.$('.listen'), null);
    for (let k = 0; k < 3; k++) {
      if (tasks[i] === 'makeTime') { const st = await runState(page); await makeByTap(page, st.target); await page.click('.done-btn'); }
      else await answerCorrect(page);
      await page.click('.btn.next');
    }
    await page.waitForSelector('.s2');
  }
  // 音声ONでも speechSynthesis がない端末で止まらない
  await seed(page, [{ code: 'A', over: { audio: true, questionCount: 3 } }]);
  await startAs(page, 'A');
  await page.click('.listen');
  await answerCorrect(page);
  assert.deepEqual(errors, []);
  await context.close();
});

test('13-9: 「きく」は指示だけを読み、選択肢の正答を読まない', async () => {
  const { context, page } = await open();
  await page.addInitScript(() => {
    window.__spoken = [];
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    Object.defineProperty(window, 'speechSynthesis', { value: { cancel() {}, speak(u) { window.__spoken.push(u.text); } } });
  });
  await seed(page, [{ code: 'A', over: { audio: true, task: 'readTime', allowedHours: [4, 7, 9] } }, { code: 'B', over: { audio: true, task: 'makeTime', allowedHours: [4, 7, 9] } }]);
  await startAs(page, 'A');
  await page.click('.listen');
  let spoken = await page.evaluate(() => window.__spoken);
  assert.deepEqual(spoken, ['とけいは なんじ']);
  await page.reload(); await page.waitForSelector('.s0');
  await startAs(page, 'B');
  await page.click('.listen');
  spoken = await page.evaluate(() => window.__spoken);
  assert.match(spoken[0], /^(よじ|しちじ|くじ) に しよう$/);
  await context.close();
});

test('基準23: 児童画面に点滅・アニメーション・トランジションがない（ヒント・正解・誤答を含む）', async () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  assert.ok(!/@keyframes|text-decoration[^;]*blink|<animate|requestAnimationFrame|setInterval/i.test(html), 'animation code found');
  const { context, page } = await open();
  await seed(page, [{ code: 'A', over: { task: 'readTime', minutePreset: 'hourAndHalf', hints: 'manual', allowedHours: [3, 6] } }, { code: 'B', over: { task: 'makeTime', minutePreset: 'five' } }]);
  const check = async (label) => {
    const r = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll('*').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.animationName !== 'none' || (cs.transitionDuration && cs.transitionDuration.split(',').some((d) => parseFloat(d) > 0))) bad.push(el.tagName + '.' + el.className);
        if (cs.textDecorationLine && cs.textDecorationLine.includes('blink')) bad.push('blink');
      });
      return { bad, anims: document.getAnimations().length };
    });
    assert.deepEqual(r, { bad: [], anims: 0 }, label);
  };
  await check('S0');
  await startAs(page, 'A');
  await check('S1');
  await answerWrong(page); await check('wrong');
  await page.click('.hintbtn'); await page.click('.hintbtn'); await page.click('.hintbtn'); await check('H3');
  await answerCorrect(page); await check('correct');
  await page.reload(); await page.waitForSelector('.s0');
  await startAs(page, 'B');
  await page.click('.hintbtn'); await page.click('.hintbtn'); await page.click('.hintbtn'); await check('make H3');
  await context.close();
});

test('基準24・25・26・27: 教師画面で記号A・Bを登録して別設定、結果に記号が残り、名前変更・削除しても過去結果は変わらない', async () => {
  const { context, page, errors } = await open();
  // 基準26：不正解ではT1に入れない。毎回ちがう問題。
  const keys = [];
  await page.click('.teacher-link'); keys.push(await passGate(page, false));
  await page.waitForSelector('.s0');
  assert.equal(await page.$('.t1'), null);
  for (let i = 0; i < 6; i++) {
    await page.click('.teacher-link');
    await page.waitForSelector('.t0');
    const k = (await page.textContent('#gateA')) + 'x' + (await page.textContent('#gateB'));
    assert.notEqual(k, keys[keys.length - 1]);
    keys.push(k);
    await page.click('[data-action="gateCancel"]');
  }
  await page.click('.teacher-link'); await passGate(page);
  await page.waitForSelector('.t1');
  // 注意書き
  assert.ok((await page.textContent('.addrow')).includes('児童の氏名・診断情報は入れないでください'));
  for (const code of ['A', 'B']) { await page.fill('#newCode', code); await page.click('[data-action="addProfile"]'); }
  // 5文字以上は入らない・同じ記号は不可
  assert.equal(await page.getAttribute('#newCode', 'maxlength'), '4');
  await page.fill('#newCode', 'A'); await page.click('[data-action="addProfile"]');
  assert.ok((await page.textContent('#t1msg')).includes('同じ記号'));
  // A：せいじをよむ、B：5ふん＋時計をつくる
  const editCode = async (code) => {
    const rows = await page.$$('.ptable tr');
    for (const r of rows) if ((await (await r.$('.pcode')).textContent()) === code) { await (await r.$('[data-action="editProfile"]')).click(); break; }
    await page.waitForSelector('.tedit');
  };
  await editCode('A');
  // 基準27：プリセットと hints
  const hintsFor = {};
  for (const p of ['miruAwaseru', 'mijikaiHari', 'seijiYomu', 'seijiTsukuru', 'zeroSanju', 'sanjuYomuTsukuru', 'gofun', 'seikatsu']) {
    await page.click(`[data-preset="${p}"]`);
    hintsFor[p] = await page.$eval('input[data-field="hints"]:checked', (x) => x.value);
  }
  assert.deepEqual(hintsFor, { miruAwaseru: 'autoAfterError', mijikaiHari: 'autoAfterError', seijiYomu: 'manual', seijiTsukuru: 'manual', zeroSanju: 'manual', sanjuYomuTsukuru: 'manual', gofun: 'manual', seikatsu: 'manual' });
  await page.click('[data-preset="seijiYomu"]');
  // 個別に変更：hints を off に
  await page.check('input[data-field="hints"][value="off"]');
  await page.click('[data-action="toT1"]');
  await editCode('B');
  await page.click('[data-preset="gofun"]');
  await page.selectOption('select[data-field="task"]', 'makeTime');
  assert.equal(await page.$eval('input[data-field="hints"]:checked', (x) => x.value), 'manual');
  await page.click('[data-action="toT1"]');
  await page.click('[data-action="toS0"]');
  // 基準24：選んだ記号の設定で出題
  await startAs(page, 'A');
  assert.ok(await page.$('.s1.task-readTime'));
  assert.equal(await page.$('.hintbtn'), null); // A は hints: off
  for (let i = 0; i < 5; i++) { await answerCorrect(page); await page.click('.btn.next'); }
  await page.click('[data-action="toS0"]');
  await startAs(page, 'B');
  assert.ok(await page.$('.s1.task-makeTime'));
  assert.ok(await page.$('.hand-select')); // 5分なので針選択ボタンあり
  assert.ok(await page.$('.hintbtn'));
  const st = await runState(page);
  await makeByTap(page, st.target); await page.click('.done-btn');
  await page.reload(); await page.waitForSelector('.s0');
  let ss = await sessions(page);
  assert.deepEqual(ss.map((x) => x.profileCodeSnapshot).sort(), ['A', 'B']);
  assert.equal(ss.find((x) => x.profileCodeSnapshot === 'A').settingsSnapshot.task, 'readTime');
  assert.equal(ss.find((x) => x.profileCodeSnapshot === 'B').settingsSnapshot.task, 'makeTime');
  // T3 で記号・日付の絞り込み
  await page.click('.teacher-link'); await passGate(page);
  await page.click('[data-action="toT3"]'); await page.waitForSelector('.rtable');
  const t3Before = await page.textContent('.rtable tbody');
  await page.selectOption('select[data-t3="code"]', 'A');
  await page.waitForFunction(() => document.querySelectorAll('.rtable tbody tr').length === 1);
  assert.equal(await page.textContent('.rtable tbody .pcode'), 'A');
  const today = await page.$$eval('select[data-t3="date"] option', (o) => o.map((x) => x.value).filter(Boolean));
  assert.equal(today.length, 1);
  await page.selectOption('select[data-t3="code"]', '');
  // 基準25：A を Z に名前変更、B を削除
  await page.click('[data-action="toT1"]');
  let dialogs = 0;
  page.removeAllListeners('dialog');
  page.on('dialog', (d) => { dialogs++; d.type() === 'prompt' ? d.accept('Z') : d.accept(); });
  const rowOf = async (code) => { for (const r of await page.$$('.ptable tr')) if ((await (await r.$('.pcode')).textContent()) === code) return r; };
  await (await (await rowOf('A')).$('[data-action="renameProfile"]')).click();
  await (await (await rowOf('B')).$('[data-action="deleteProfile"]')).click();
  assert.equal(dialogs, 2); // 削除は確認ダイアログを出す
  assert.deepEqual(await page.$$eval('.ptable .pcode', (x) => x.map((e) => e.textContent)), ['Z']);
  await page.click('[data-action="toT3"]'); await page.waitForSelector('.rtable');
  assert.equal(await page.textContent('.rtable tbody'), t3Before);
  ss = await sessions(page);
  assert.deepEqual(ss.map((x) => x.profileCodeSnapshot).sort(), ['A', 'B']);
  assert.deepEqual(errors, []);
  await context.close();
});

test('基準26: 教師入口の答えは数字キーで入力し、不正解では T1 に入れない（S1 からの入口も同じ）', async () => {
  const { context, page } = await open();
  await seed(page, [{ code: 'A' }]);
  await page.click('.teacher-link');
  await page.click('[data-action="gateKey"][data-k="1"]');
  await page.click('[data-action="gateOk"]');
  await page.waitForSelector('.s0');
  assert.equal(await page.$('.t1'), null);
  // S1 では「せんせい」ボタンを常時表示しない
  await startAs(page, 'A');
  assert.equal(await page.$('.teacher-link'), null);
  assert.equal(await page.$('.helpbtn'), null);
  await context.close();
});

test('13-8: 問題切替の前から触れていた指は、新しい問題の回答にならない', async () => {
  const { context, page } = await open();
  await seed(page, [{ code: 'A', over: { questionCount: 3, allowedHours: [3, 6, 9] } }]);
  await startAs(page, 'A');
  await answerCorrect(page);
  // 指を置いたまま（down）次の問題を表示し、その後に指を離す
  const box = await page.$eval('.btn.next', (b) => { const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.evaluate(() => document.querySelector('.btn.next').click());
  const st = await runState(page);
  assert.equal(st.idx, 1);
  // 新しい問題の選択肢の上で指を離しても回答にならない
  const opt = await page.$eval(`[data-opt="${st.correctOptionId}"]`, (b) => { const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.move(opt.x, opt.y);
  await page.mouse.up();
  await page.evaluate((id) => document.querySelector(`[data-opt="${id}"]`).click(), st.correctOptionId);
  assert.equal((await runState(page)).state, 'answering');
  // 指を離したあとの新しいタップは受け付ける
  await page.click(`[data-opt="${st.correctOptionId}"]`);
  assert.equal((await runState(page)).state, 'correct');
  await context.close();
});

test('13-7: 画像を登録すると縮小（長辺1024px以下）して保存し、児童画面に出る', async () => {
  const { context, page, errors } = await open();
  await seed(page, [{ code: 'A', over: { task: 'sceneToClock', questionCount: 3, sceneIds: ['sc-okiru', 'sc-gakkou', 'sc-kyushoku'] } }]);
  await page.click('.teacher-link'); await passGate(page);
  await page.click('[data-action="toT2"]'); await page.waitForSelector('.stable');
  // 2000x1500 の PNG をブラウザ内で作ってファイルとして渡す
  const pngB64 = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 2000; c.height = 1500;
    const x = c.getContext('2d'); x.fillStyle = '#4caf50'; x.fillRect(0, 0, 2000, 1500);
    return c.toDataURL('image/png').split(',')[1];
  });
  for (const id of ['sc-okiru', 'sc-gakkou', 'sc-kyushoku']) {
    await page.setInputFiles(`input[data-scene-file="${id}"]`, { name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(pngB64, 'base64') });
    await page.waitForSelector(`tr[data-scene="${id}"] .thumb img`);
  }
  const info = await page.evaluate(async () => {
    const imgs = await window.__tokei.idbGetAll('images');
    const out = [];
    for (const r of imgs) {
      const bmp = await createImageBitmap(r.blob);
      out.push({ w: bmp.width, h: bmp.height, size: r.blob.size, type: r.blob.type });
    }
    return out;
  });
  assert.equal(info.length, 3);
  info.forEach((i) => { assert.equal(Math.max(i.w, i.h), 1024); assert.ok(i.size < 1024 * 1024); assert.equal(i.type, 'image/jpeg'); });
  await page.click('[data-action="toT1"]'); await page.click('[data-action="toS0"]');
  await startAs(page, 'A');
  assert.ok(await page.$('.stimulus .scene-img img'));
  assert.deepEqual(errors, []);
  await context.close();
});
