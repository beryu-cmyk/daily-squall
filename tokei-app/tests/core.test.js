// 実行：node --test tests/   （index.html の <script id="tokei-core"> を取り出してテストする）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const m = html.match(/<script id="tokei-core">([\s\S]*?)<\/script>/);
assert.ok(m, 'tokei-core script not found');
const C = vm.runInThisContext('(function (module) {' + m[1] + '\nreturn module.exports; })')({ exports: {} });

const T = (h, min) => C.makeTime(h, min);
const S = (over) => C.normalizeSettings(Object.assign(C.defaultSettings(), over || {}));

// ---------- 8-3 針の角度（受け入れ基準 3・4・5） ----------
test('基準3: 3:30 の短針は105°、長針は180°', () => {
  assert.deepEqual(C.handAngles(T(3, 30)), { hour: 105, minute: 180 });
});
test('基準4: 3:55 の短針は117.5°', () => {
  assert.equal(C.handAngles(T(3, 55)).hour, 117.5);
  assert.equal(C.handAngles(T(3, 55)).minute, 330);
});
test('基準5: 12:30 の短針は15°', () => {
  assert.equal(T(12, 30), 30);
  assert.equal(C.handAngles(T(12, 30)).hour, 15);
});
test('全720分で角度式どおり（長針6m、短針30h+0.5m）', () => {
  for (let t = 0; t < 720; t++) {
    const a = C.handAngles(t);
    assert.equal(a.minute, 6 * (t % 60));
    assert.equal(a.hour, 30 * Math.floor(t / 60) + 0.5 * (t % 60));
    assert.ok(a.hour >= 0 && a.hour < 360);
  }
});

// ---------- 12時の境界（受け入れ基準6） ----------
test('基準6: 11:55→12:00→12:05 が値・角度ともに正しく連続する', () => {
  const t1155 = T(11, 55), t1200 = C.norm12(t1155 + 5), t1205 = C.norm12(t1200 + 5);
  assert.equal(t1155, 715);
  assert.equal(t1200, 0);
  assert.equal(t1205, 5);
  assert.equal(C.handAngles(t1155).hour, 357.5);
  assert.equal(C.handAngles(t1200).hour, 0);
  assert.equal(C.handAngles(t1205).hour, 2.5);
  assert.equal(C.displayHour(t1200), 12);
  assert.equal(C.formatTime(t1200, 'kana'), '12じ');
  assert.equal(C.formatTime(t1205, 'digital'), '12:05');
  assert.equal(C.formatTime(t1155, 'digital'), '11:55');
});
test('基準6: 長針を 11:55 から時計回りに連続ドラッグ→12:00→12:05、逆回しで戻る', () => {
  const d = C.startLongDrag(T(11, 55), 330, 5);
  const seq = [];
  for (let a = 330; a <= 390; a += 2) seq.push(C.moveLongDrag(d, a % 360));
  assert.ok(seq.includes(715) && seq.includes(0) && seq.includes(5), JSON.stringify(seq));
  assert.equal(seq[seq.length - 1], 5);
  assert.equal(C.handAngles(seq[seq.length - 1]).hour, 2.5);
  for (let a = 390; a >= 330; a -= 2) C.moveLongDrag(d, a % 360);
  assert.equal(C.moveLongDrag(d, 330), 715);
});
test('9-4: 12付近を単発タップしても時台は変わらない', () => {
  assert.equal(C.applyLongTap(T(3, 30), 355, 5), T(3, 0));
  assert.equal(C.applyLongTap(T(3, 30), 3, 5), T(3, 0));
  assert.equal(C.applyLongTap(T(11, 55), 2, 5), T(11, 0));
  assert.equal(C.applyLongTap(T(3, 0), 180, 30), T(3, 30));
});
test('9-4: 12の手前（355°）から触り始めて少し動かしても時台は変わらない', () => {
  const d = C.startLongDrag(T(3, 30), 355, 5);
  assert.equal(C.moveLongDrag(d, 356), T(3, 0));
  assert.equal(C.moveLongDrag(d, 354), T(3, 0));
});
test('9-4: 30分関連は0／30、5分は5刻みにスナップ', () => {
  const d30 = C.startLongDrag(T(3, 0), 10, 30);
  const seen = new Set();
  for (let a = 10; a < 350; a += 5) seen.add(C.moveLongDrag(d30, a) % 60);
  assert.deepEqual([...seen].sort((a, b) => a - b), [0, 30]);
  const d5 = C.startLongDrag(T(3, 0), 1, 5);
  const seen5 = new Set();
  for (let a = 1; a < 350; a += 3) seen5.add(C.moveLongDrag(d5, a) % 60);
  assert.ok([...seen5].every((x) => x % 5 === 0));
});

// ---------- 短針ドラッグの時台判定（受け入れ基準 21・22） ----------
test('基準21: 3:30 の短針（105°付近）に触れて少し動かしても時台は3のまま', () => {
  for (let d = -14; d <= 14; d += 0.5) {
    const t = C.applyShortDrag(T(3, 30), 105 + d);
    assert.equal(t, T(3, 30), 'θ=' + (105 + d));
  }
  // 9-3 の例：θ'=105−15=90 → h=3
  assert.equal(C.hourIndexFromDrag(105, 30), 3);
});
test('基準21（一般化）: どの時刻でも、表示中の短針から±14°以内のドラッグで時台が変わらない', () => {
  for (let t = 0; t < 720; t += 5) {
    const a = C.handAngles(t).hour;
    for (let d = -14; d <= 14; d += 1) {
      assert.equal(C.applyShortDrag(t, a + d), t, 't=' + t + ' d=' + d);
    }
  }
});
test('基準22: 3:30 で短針を4の数字の位置（120°）までドラッグすると4:30、短針は4と5の中間（135°）', () => {
  const t = C.applyShortDrag(T(3, 30), 120);
  assert.equal(t, T(4, 30));
  assert.equal(C.handAngles(t).hour, 135);
  // 4を少し越えた位置でも4:30
  assert.equal(C.applyShortDrag(T(3, 30), 125), T(4, 30));
  assert.equal(C.applyShortDrag(T(3, 30), 149), T(4, 30));
});
test('9-3: 短針ドラッグは分を保持し、表示角度は常に 30h+0.5m に戻る', () => {
  for (let theta = 0; theta < 360; theta += 7) {
    const t = C.applyShortDrag(T(3, 55), theta);
    assert.equal(C.minuteOf(t), 55);
    assert.equal(C.handAngles(t).hour, 30 * C.hourIndex(t) + 27.5);
  }
});
test('9-3: 12の近くでの短針ドラッグ（12:30）', () => {
  assert.equal(C.applyShortDrag(T(12, 30), 15), T(12, 30));
  assert.equal(C.applyShortDrag(T(12, 30), 45), T(1, 30));
  assert.equal(C.applyShortDrag(T(12, 30), 5), T(12, 30));
  assert.equal(C.applyShortDrag(T(12, 30), 350), T(11, 30)); // 11:30 の表示位置(345°)に近い
  assert.equal(C.applyShortDrag(T(1, 30), 10), T(12, 30));
});
test('9-3: 数字タップ＝時台（3:30 で「3」をタップ→3:30、「4」→4:30、3:55で「3」→3:55）', () => {
  assert.equal(C.applyShortTap(T(3, 30), 90), T(3, 30));
  assert.equal(C.applyShortTap(T(3, 30), 120), T(4, 30));
  assert.equal(C.applyShortTap(T(3, 55), 90), T(3, 55));
  assert.equal(C.applyShortTap(T(3, 0), 0), T(12, 0));
});
test('基準8（ロジック）: タップだけで全ての時刻を作れる', () => {
  for (const step of [60, 30, 5]) {
    const minutes = step === 60 ? [0] : step === 30 ? [0, 30] : C.FIVE_MINUTES;
    for (let h = 1; h <= 12; h++) {
      for (const mm of minutes) {
        const target = T(h, mm);
        let t = target === 0 ? 360 : 0;
        if (step !== 60) t = C.applyLongTap(t, mm * 6, step);
        t = C.applyShortTap(t, h * 30);
        assert.equal(t, target, `${h}:${mm} step ${step}`);
      }
    }
  }
});

// ---------- 表記・読み ----------
test('表記: 「3じ」と「3じ00ぷん」は同じ正規化値で、表示は「3じ」に統一', () => {
  assert.equal(C.formatTime(T(3, 0), 'kana'), '3じ');
  assert.equal(C.formatTime(T(3, 30), 'kana'), '3じ30ぷん');
  assert.equal(C.formatTime(T(3, 5), 'kana'), '3じ5ふん');
  assert.equal(C.formatTime(T(3, 20), 'kana'), '3じ20ぷん');
  assert.equal(C.formatTime(T(3, 45), 'kana'), '3じ45ふん');
  assert.equal(C.formatTime(T(3, 30), 'digital'), '3:30');
  assert.equal(C.formatTime(T(3, 0), 'digital'), '3:00');
});
test('13-9 読み: よじ・しちじ・くじ、ふん／ぷん', () => {
  assert.equal(C.readingOfTime(T(4, 0)), 'よじ');
  assert.equal(C.readingOfTime(T(7, 0)), 'しちじ');
  assert.equal(C.readingOfTime(T(9, 0)), 'くじ');
  assert.equal(C.readingOfTime(T(3, 30)), 'さんじ さんじゅっぷん');
  assert.equal(C.readingOfTime(T(3, 5)), 'さんじ ごふん');
  assert.equal(C.readingOfTime(T(10, 10)), 'じゅうじ じゅっぷん');
  assert.equal(C.readingOfTime(T(12, 45)), 'じゅうにじ よんじゅうごふん');
});

// ---------- 問題生成 ----------
const TASKS_TIME = ['sameClock', 'selectShortHand', 'readMinute', 'readTime', 'analogToText', 'textToAnalog'];
const MINUTE_CASES = [
  { minutePreset: 'hour' },
  { minutePreset: 'half' },
  { minutePreset: 'hourAndHalf' },
  { minutePreset: 'five' },
  { minutePreset: 'fiveSubset', allowedMinutes: [5, 10, 15] }
];
const HOUR_CASES = [[3, 6, 9], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], [12], [3, 4]];

function optionKey(task, v) { return String(v); }

function checkSession(s, gen, scenes) {
  const opts = gen.questions.map((q) => q.options.length);
  for (const q of gen.questions) {
    // 正答は必ず1個（基準12）
    const correct = q.options.filter((o) => o.id === q.correctOptionId);
    assert.equal(correct.length, 1);
    const ans = C.answerValueOf(s.task, s.task.startsWith('scene') || s.task === 'clockToScene' || s.task === 'periodFromScene'
      ? scenes.find((x) => x.id === q.targetSceneId) : q.targetTime12);
    assert.equal(String(correct[0].value), String(ans));
    // 同値選択肢なし（基準13）
    const keys = q.options.map((o) => optionKey(s.task, o.value));
    assert.equal(new Set(keys).size, keys.length, 'dup options ' + keys);
    // 未習内容を勝手に出さない（基準14）：extended 以外は設定内のみ
    if (s.distractorType !== 'commonExtended' && C.TASKS[s.task].mode !== 'D') {
      for (const o of q.options) {
        const kind = C.TASKS[s.task].answer;
        if (kind === 'time') assert.ok(C.isTaughtTime(o.value, s), 'untaught ' + o.value);
        if (kind === 'hour') assert.ok(C.allowedHoursOf(s).includes(o.value), 'untaught hour ' + o.value);
        if (kind === 'minute') assert.ok(C.allowedMinutesOf(s).includes(o.value), 'untaught minute ' + o.value);
      }
      assert.ok(C.isTaughtTime(q.targetTime12, s));
    }
  }
  return opts;
}

test('基準12・13・14: 全課題×分設定×時設定×選択肢数×誤答種類で、正答1個・同値なし・未習なし', () => {
  let n = 0;
  for (const task of TASKS_TIME) for (const mc of MINUTE_CASES) for (const hours of HOUR_CASES)
    for (const optionCount of [2, 3, 4]) for (const distractorType of ['easy', 'common'])
      for (const questionCount of [3, 5, 10]) {
        const s = S(Object.assign({ task, allowedHours: hours, optionCount, distractorType, questionCount }, mc));
        const diag = C.diagnose(s, []);
        for (let seed = 1; seed <= 3; seed++) {
          const gen = C.generateSession(s, [], C.makeRng(seed * 7919 + n));
          if (diag.errors.length) { assert.equal(gen.ok, false); continue; }
          assert.equal(gen.ok, true);
          assert.equal(gen.questions.length, questionCount);
          const opts = checkSession(s, gen, []);
          // 候補不足なら教師画面で知らせた数（capacity）まで減らす。勝手に未習で埋めない
          opts.forEach((k) => assert.equal(k, Math.min(optionCount, diag.capacity)));
          n++;
        }
      }
  assert.ok(n > 500);
});

test('8-2: 直前と同じ問題を避け、一巡するまで重複させない', () => {
  for (const mc of MINUTE_CASES) for (const hours of HOUR_CASES) for (let seed = 1; seed <= 30; seed++) {
    const s = S(Object.assign({ task: 'readTime', allowedHours: hours, questionCount: 10 }, mc));
    if (C.diagnose(s, []).errors.length) continue;
    const gen = C.generateSession(s, [], C.makeRng(seed));
    const ts = gen.questions.map((q) => q.targetTime12);
    const distinct = new Set(C.allowedTimes(s)).size;
    if (distinct > 1) for (let i = 1; i < ts.length; i++) assert.notEqual(ts[i], ts[i - 1], JSON.stringify(ts));
    // 候補数以下の問題数なら重複なし
    const firstK = ts.slice(0, Math.min(distinct, ts.length));
    if (mc.minutePreset === 'hour' || mc.minutePreset === 'half') assert.equal(new Set(firstK).size, firstK.length, JSON.stringify(ts));
  }
});

test('8-2: 正時＋30分ではカテゴリ件数差が1以内', () => {
  for (const hours of HOUR_CASES) for (const qc of [3, 5, 10]) for (let seed = 1; seed <= 40; seed++) {
    const s = S({ task: 'readTime', minutePreset: 'hourAndHalf', allowedHours: hours, questionCount: qc });
    const gen = C.generateSession(s, [], C.makeRng(seed));
    const zero = gen.questions.filter((q) => q.targetTime12 % 60 === 0).length;
    const half = gen.questions.length - zero;
    assert.ok(Math.abs(zero - half) <= 1, `${zero} vs ${half}`);
  }
});

test('8-2: 5分の部分集合も均等（各分の件数差が1以内）', () => {
  for (const mins of [[5, 10, 15], [0, 15, 30, 45], [20, 40]]) for (const qc of [3, 5, 10]) for (let seed = 1; seed <= 40; seed++) {
    const s = S({ task: 'readTime', minutePreset: 'fiveSubset', allowedMinutes: mins, allowedHours: [3, 6, 9], questionCount: qc });
    const gen = C.generateSession(s, [], C.makeRng(seed));
    const cnt = {};
    mins.forEach((x) => (cnt[x] = 0));
    gen.questions.forEach((q) => cnt[q.targetTime12 % 60]++);
    const vals = Object.values(cnt);
    assert.ok(Math.max(...vals) - Math.min(...vals) <= 1, JSON.stringify(cnt));
  }
});

test('8-2: 正答位置が偏らない（位置ごとの件数差が1以内）', () => {
  for (const optionCount of [2, 3, 4]) for (const qc of [3, 5, 10]) for (let seed = 1; seed <= 40; seed++) {
    const s = S({ task: 'readTime', minutePreset: 'five', allowedHours: [3, 6, 9], optionCount, questionCount: qc });
    const gen = C.generateSession(s, [], C.makeRng(seed));
    const cnt = new Array(optionCount).fill(0);
    gen.questions.forEach((q) => cnt[q.options.findIndex((o) => o.id === q.correctOptionId)]++);
    assert.ok(Math.max(...cnt) - Math.min(...cnt) <= 1, JSON.stringify(cnt));
  }
});

test('8-4: よくある誤答（習った範囲）を優先して使う', () => {
  const s = S({ task: 'readTime', minutePreset: 'hour', allowedHours: [2, 3, 4, 12], optionCount: 4 });
  const pool = C.distractorPool('readTime', T(3, 0), s, [], C.makeRng(1));
  assert.deepEqual(new Set(pool.slice(0, 3)), new Set([T(12, 0), T(2, 0), T(4, 0)]));
  const s30 = S({ task: 'readTime', minutePreset: 'hourAndHalf', allowedHours: [3, 4, 6] });
  const p30 = C.distractorPool('readTime', T(3, 30), s30, [], C.makeRng(1));
  assert.deepEqual(new Set(p30.slice(0, 2)), new Set([T(4, 30), T(3, 0)]));
  const s5 = S({ task: 'readTime', minutePreset: 'five', allowedHours: [3, 4] });
  const p5 = C.distractorPool('readTime', T(3, 20), s5, [], C.makeRng(1));
  assert.deepEqual(new Set(p5.slice(0, 3)), new Set([T(3, 15), T(3, 25), T(4, 20)]));
});
test('8-4: 「未習の数字も使う」を選んだ時だけ 3じ4ぷん・3じ6ぷん 等を使う', () => {
  const sc = S({ task: 'readTime', minutePreset: 'five', allowedHours: [3], distractorType: 'common' });
  assert.ok(!C.distractorPool('readTime', T(3, 20), sc, [], C.makeRng(1)).includes(T(3, 4)));
  const se = S({ task: 'readTime', minutePreset: 'five', allowedHours: [3], distractorType: 'commonExtended' });
  assert.ok(C.distractorPool('readTime', T(3, 20), se, [], C.makeRng(1)).includes(T(3, 4)));
  const sh = S({ task: 'readTime', minutePreset: 'half', allowedHours: [3], distractorType: 'commonExtended', optionCount: 4 });
  const ph = C.distractorPool('readTime', T(3, 30), sh, [], C.makeRng(1));
  assert.deepEqual(new Set(ph), new Set([T(4, 30), T(3, 0), T(3, 6), T(2, 30)]));
  assert.ok(C.diagnose(se, []).notes.some((x) => x.includes('未習')));
});
test('8-4: 「かんたん」は離れた時刻を誤答にする', () => {
  const s = S({ task: 'readTime', minutePreset: 'hour', allowedHours: C.ALL_HOURS, distractorType: 'easy', optionCount: 2 });
  for (let seed = 1; seed < 20; seed++) {
    const p = C.distractorPool('readTime', T(3, 0), s, [], C.makeRng(seed));
    assert.equal(p[0], T(9, 0));
  }
});
test('基準14: 候補不足は教師画面に具体的に出し、未習で埋めない', () => {
  const s = S({ task: 'readTime', minutePreset: 'hour', allowedHours: [3, 6], optionCount: 4 });
  const d = C.diagnose(s, []);
  assert.equal(d.capacity, 2);
  assert.ok(d.warnings.some((w) => w.includes('この条件では2択まで')), JSON.stringify(d.warnings));
  const one = S({ task: 'readTime', minutePreset: 'hour', allowedHours: [3] });
  assert.ok(C.diagnose(one, []).errors.length > 0);
  assert.equal(C.generateSession(one, []).ok, false);
  const rm = S({ task: 'readMinute', minutePreset: 'hour', allowedHours: [3, 6, 9] });
  assert.ok(C.diagnose(rm, []).errors.length > 0);
});

// ---------- D 生活 ----------
test('13-10・基準15: 同じ時計位置（朝7時と夜7時）の活動を同じ選択肢に出さない／午前午後を時計だけで判定させない', () => {
  const scenes = C.defaultScenes();
  for (const task of ['clockToScene', 'sceneToClock', 'periodFromScene']) for (const oc of [2, 3, 4]) for (let seed = 1; seed <= 60; seed++) {
    const s = S({ task, optionCount: oc, questionCount: 10 });
    const gen = C.generateSession(s, scenes, C.makeRng(seed));
    assert.equal(gen.ok, true, JSON.stringify(gen.errors));
    checkSession(s, gen, scenes);
    for (const q of gen.questions) {
      if (task === 'clockToScene') {
        const times = q.options.map((o) => C.sceneTime12(scenes.find((x) => x.id === o.value)));
        assert.equal(new Set(times).size, times.length, 'same clock position in options');
      }
      if (task === 'sceneToClock') {
        const times = q.options.map((o) => o.value);
        assert.equal(new Set(times).size, times.length);
      }
      if (task === 'periodFromScene') {
        assert.deepEqual(q.options.map((o) => o.value), ['am', 'pm']);
        assert.notEqual(q.targetMinuteOfDay % 720, 0, '12:00ちょうどは出さない');
        // 刺激は必ず生活場面（stimulus: scene）
        assert.equal(C.TASKS[task].stimulus, 'scene');
      }
    }
  }
});
test('8-2: 午前／午後の答えがかたよらない', () => {
  const scenes = C.defaultScenes();
  for (let seed = 1; seed <= 40; seed++) {
    const gen = C.generateSession(S({ task: 'periodFromScene', questionCount: 10 }), scenes, C.makeRng(seed));
    const am = gen.questions.filter((q) => q.targetPeriod === 'am').length;
    assert.ok(Math.abs(am - (10 - am)) <= 1);
  }
});

// ---------- 結果の区分（基準16） ----------
test('基準16: 初回H0・再試行H0・ヒント後・模倣(H3)・教師と・未完を区別', () => {
  const base = { attempts: [{}], maxHint: 0, externalSupport: [], solved: true };
  assert.equal(C.classifyOutcome(base), 'firstH0');
  assert.equal(C.classifyOutcome({ ...base, attempts: [{}, {}] }), 'retryH0');
  assert.equal(C.classifyOutcome({ ...base, maxHint: 1 }), 'afterHint');
  assert.equal(C.classifyOutcome({ ...base, maxHint: 2 }), 'afterHint');
  assert.equal(C.classifyOutcome({ ...base, maxHint: 3 }), 'imitation');
  assert.equal(C.classifyOutcome({ ...base, externalSupport: ['ゆびさし'] }), 'teacherSupported');
  assert.equal(C.classifyOutcome({ ...base, solved: false }), 'incomplete');
  assert.equal(C.classifyOutcome({ ...base, skipped: true }), 'incomplete');
});

// ---------- プリセット（基準27） ----------
test('基準27: 「みる・あわせる」「みじかいはり」は autoAfterError、他は manual', () => {
  const expect = { miruAwaseru: 'autoAfterError', mijikaiHari: 'autoAfterError' };
  assert.equal(C.PRESETS.length, 8);
  for (const p of C.PRESETS) {
    // 事前に違う値にしておいても、適用で上書きされる
    for (const before of ['manual', 'autoAfterError', 'off']) {
      const s = C.applyPreset(S({ hints: before }), p.id);
      assert.equal(s.hints, expect[p.id] || 'manual', p.label);
      assert.equal(s.presetId, p.id);
    }
  }
  assert.equal(C.defaultSettings().hints, 'manual');
});
test('プリセットは時・色・問題数を残す', () => {
  const s = C.applyPreset(S({ allowedHours: [1, 2], shortColor: '#2e7d32', questionCount: 10 }), 'gofun');
  assert.deepEqual(s.allowedHours, [1, 2]);
  assert.equal(s.shortColor, '#2e7d32');
  assert.equal(s.questionCount, 10);
  assert.equal(s.minutePreset, 'five');
});
test('13-4: 推奨初期値', () => {
  const d = C.defaultSettings();
  assert.equal(d.mode, 'A'); assert.equal(d.task, 'readTime'); assert.equal(d.minutePreset, 'hour');
  assert.deepEqual(d.allowedHours, [3, 6, 9]); assert.equal(d.questionCount, 5); assert.equal(d.optionCount, 2);
  assert.equal(d.timeFormat, 'kana'); assert.equal(d.audio, false); assert.equal(d.showMinuteRing, false);
  assert.equal(d.handStyle, 'twoColor'); assert.equal(d.constructionInput, 'dragAndTap'); assert.equal(d.includePeriod, false);
});

// ---------- 教師入口（基準26） ----------
test('基準26: 掛け算は2〜9同士で、直前と毎回ちがう問題', () => {
  let prev = null;
  const rng = C.makeRng(42);
  for (let i = 0; i < 2000; i++) {
    const g = C.makeGateProblem(prev, rng);
    assert.ok(g.a >= 2 && g.a <= 9 && g.b >= 2 && g.b <= 9);
    assert.equal(g.answer, g.a * g.b);
    assert.notEqual(g.key, prev);
    prev = g.key;
  }
});
