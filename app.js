// ============================================
// Daily Squall Generator - メインロジック v3
// CANON / EXPERIMENT 2モード制
// ============================================

// ============================================
// ユーティリティ関数
// ============================================
function pickRandom(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function getTodayKey() {
    const now = new Date();
    return `${now.getMonth() + 1}/${now.getDate()}`;
}

// ============================================
// モード別選択関数
// ============================================
let currentMode = MODE.EXPERIMENT; // デフォルトはEXPERIMENT

function pickOutfit(mode) {
    return mode === MODE.CANON ? pickRandom(OUTFITS_CANON) : pickRandom(OUTFITS_EXPERIMENT);
}

function pickExpression(mode) {
    // CANONは完全にCANONから
    if (mode === MODE.CANON) return pickRandom(EXPRESSIONS_CANON);

    // EXPERIMENTは30%でCANONから刺さる目を引く
    return (Math.random() < 0.30) ? pickRandom(EXPRESSIONS_CANON) : pickRandom(EXPRESSIONS_EXPERIMENT);
}

function coreByMode(mode) {
    return mode === MODE.CANON ? CORE_CANON : CORE_EXPERIMENT;
}

// ============================================
// 事故防止：「柔×柔」なら圧を足す
// ============================================
function needsPressure(outfit, expression) {
    const softOutfit = /(turtleneck|hoodie|yukata|apron|suit)/i.test(outfit);
    const softExpr = /(gentle smile|peaceful|relieved|shy|sleepy|surprised)/i.test(expression);
    return softOutfit && softExpr;
}

function applyPressureFix(parts) {
    if (parts.mode === MODE.EXPERIMENT && needsPressure(parts.outfit, parts.expression)) {
        // コアを強める
        parts.coreLine = [
            parts.coreLine,
            "mouth held tight",
            "a sharp glint in the eyes"
        ].join(", ");
        parts.pressureApplied = true;
    }
    return parts;
}

// ============================================
// 祝日CSV読み込み（内閣府）
// ============================================
let holidayMap = {};
let isHolidayLoaded = false;

function parseHolidayCsvToMap(csvText, year) {
    const map = {};
    const lines = csvText.trim().split(/\r?\n/);
    for (const line of lines.slice(1)) {
        const [ymd, name] = line.split(",");
        if (!ymd || !name) continue;
        const [y, m, d] = ymd.split("/").map(Number);
        if (y !== year) continue;
        const key = `${m}/${d}`;
        const situation = HOLIDAY_SITUATIONS[name.trim()] || "cinematic calm atmosphere, seasonal light, quiet emotion";
        map[key] = { name: name.trim(), situation };
    }
    return map;
}

async function loadHolidayMap() {
    try {
        const year = new Date().getFullYear();
        const res = await fetch(HOLIDAY_CSV_URL);
        const text = await res.text();
        holidayMap = parseHolidayCsvToMap(text, year);
        isHolidayLoaded = true;
        console.log("祝日データ読み込み完了:", Object.keys(holidayMap).length, "件");
    } catch (e) {
        console.warn("祝日CSV読み込み失敗（通常モードで動作します）:", e);
        holidayMap = {};
        isHolidayLoaded = false;
    }
}

// ============================================
// 特別日判定（固定記念日 > 祝日）
// ============================================
function checkSpecialDay() {
    const todayKey = getTodayKey();

    // 固定記念日を優先
    if (FIXED_SPECIAL_DAYS && FIXED_SPECIAL_DAYS[todayKey]) {
        return FIXED_SPECIAL_DAYS[todayKey];
    }

    // 祝日を次にチェック
    if (isHolidayLoaded && holidayMap[todayKey]) {
        return { ...holidayMap[todayKey], isHoliday: true };
    }

    return null;
}

// ============================================
// 衝突対策用ヘルパー関数
// ============================================
function filterLightingByEnv(isIndoor) {
    const indoor = [
        "neutral daylight, balanced exposure",
        "single desk lamp indoors, dramatic chiaroscuro",
        "cold fluorescent light",
        "candlelight only"
    ];
    const outdoor = [
        "neutral daylight, balanced exposure",
        "warm sunset backlight, strong rim light",
        "cool moonlight, high contrast shadows",
        "neon signage lighting, wet road reflections",
        "morning backlight",
        "orange evening backlight"
    ];
    return isIndoor ? indoor : outdoor;
}

function filterVfxByEnv(isIndoor) {
    return isIndoor
        ? ["dust motes in light beam"]
        : ["rain droplet reflections", "snow particles in air"];
}

function themeMentionsLight(themeText) {
    return /(backlight|neon|candle|fluorescent|moonlight|sunset|evening|morning|lamp|city lights)/i.test(themeText);
}

// ============================================
// 自動修正関数（repairPromptParts）
// 光源二重指定、Env-VFX不整合、画風-陰影矛盾を自動検出・修正
// ============================================
function repairPromptParts(p) {
    const low = (s) => (s || "").toLowerCase();
    const has = (s, kw) => low(s).includes(kw);

    // p = { envTag, theme, styleRender, styleColoring, lighting, vfx, shadow, expression }

    // ---- 1) Lighting collision（ネオン×蝋燭、夕焼け×neutral 等）
    // neon & candle は共存させない
    if (has(p.lighting, "neon") && has(p.lighting, "candle")) {
        p.lighting = "neon signage lighting, wet road reflections";
    }

    // silhouette/backlight があるのに neutral daylight は弱いので置換
    const wantsBacklight =
        /(sunset|evening|dusk|backlight|silhouette|rim light)/i.test(p.theme + " " + p.expression);
    if (wantsBacklight && has(p.lighting, "neutral daylight")) {
        p.lighting = "warm sunset backlight, strong rim light";
    }

    // ---- 2) Env–VFX mismatch
    const isIndoor = p.envTag === "indoor";

    if (isIndoor && /(rain|snow)/i.test(p.vfx)) {
        p.vfx = "dust motes in light beam";
    }
    if (!isIndoor && /dust motes|blinds shadow/i.test(p.vfx + " " + (p.shadow || ""))) {
        p.vfx = "wet surface reflections";
        p.shadow = ""; // 屋外では基本オフ
    }

    // ---- 3) Style–Contrast mismatch（画風と陰影の矛盾）
    const softStyle = /(picture book|watercolor|soft pastel|dreamy)/i.test(p.styleRender);
    const hardContrast = /(high contrast|dramatic shadows|hard key|chiaroscuro)/i.test(p.styleColoring + " " + p.lighting);

    if (softStyle && hardContrast) {
        p.styleColoring = "soft painterly shading, smooth gradients";
        if (/candlelight only|hard key|chiaroscuro/i.test(p.lighting)) {
            p.lighting = "soft warm light, gentle shadows";
        }
    }

    return p;
}

// 修正ログ付きバージョン
function repairWithLog(p) {
    const log = [];
    const before = {
        lighting: p.lighting,
        vfx: p.vfx,
        styleColoring: p.styleColoring,
        shadow: p.shadow || ""
    };

    p = repairPromptParts(p);

    if (before.lighting !== p.lighting) log.push(`光: "${before.lighting}" → "${p.lighting}"`);
    if (before.vfx !== p.vfx) log.push(`VFX: "${before.vfx}" → "${p.vfx}"`);
    if (before.styleColoring !== p.styleColoring) log.push(`塗り: "${before.styleColoring}" → "${p.styleColoring}"`);
    if (before.shadow !== (p.shadow || "")) log.push(`影: "${before.shadow}" → "${p.shadow || "なし"}"`);

    return { parts: p, repairLog: log };
}


// ============================================
// プロンプト生成
// ============================================
function generatePrompt() {
    const specialDay = checkSpecialDay();

    // 特別日の場合
    if (specialDay) {
        const renderStyle = pickRandom(STYLE_RENDER);
        const colorStyle = pickRandom(STYLE_COLORING);
        const lighting = "neutral daylight, balanced exposure"; // 特別日はneutralで安定

        const prompt = [
            QUALITY_FIXED,
            "Squall Leonhart from Final Fantasy VIII, brown wavy hair, steel-blue eyes, diagonal forehead scar",
            specialDay.situation,
            renderStyle,
            colorStyle,
            lighting,
            "cinematic composition, depth of field",
            `Negative: ${NEGATIVE_FIXED}`
        ].filter(Boolean).join(", ");

        return {
            isSpecial: true,
            specialName: specialDay.name,
            prompt,
            details: {
                occasion: specialDay.name,
                situation: specialDay.situation,
                style: `${renderStyle} / ${colorStyle}`,
                light: lighting
            }
        };
    }

    // 通常のランダム生成（モード対応）
    const mode = currentMode;
    const themeObj = pickRandom(THEMES);
    const theme = themeObj.text;
    const isIndoor = themeObj.tag === "indoor";

    // モード別で服装・表情を選択
    const outfit = pickOutfit(mode);
    let expression = pickExpression(mode);
    let coreLine = coreByMode(mode);
    const renderStyle = pickRandom(STYLE_RENDER);
    const colorStyle = pickRandom(STYLE_COLORING);

    // 夕焼け補正：sunset/evening/duskテーマなら夕方ライティング優先
    function themeMentionsSunset(t) {
        return /(sunset|evening|dusk)/i.test(t);
    }

    // sleepy補正：outdoor + sleepyは「眠れなかった」に置換
    if (!isIndoor && /(just woke up|sleepy)/i.test(expression)) {
        expression = "couldn't sleep, tired eyes, quiet gaze";
    }

    // 光は環境で絞る + テーマに光ワードがあればneutralに退避
    // ただし夕焼け系は夕方ライティングを優先
    let lighting = "";
    if (themeMentionsSunset(theme)) {
        // 夕焼け系は夕方プリセット優先（70%/30%）
        lighting = Math.random() < 0.7
            ? "warm sunset backlight, strong rim light"
            : "orange evening backlight";
    } else if (themeMentionsLight(theme)) {
        lighting = "neutral daylight, balanced exposure";
    } else {
        const lightingPool = filterLightingByEnv(isIndoor);
        lighting = pickRandom(lightingPool);
    }

    // VFXは環境で絞る + 雨粒をsubtleに
    let vfx = pickRandom(filterVfxByEnv(isIndoor));
    // 雨粒はsubtle表現に
    if (vfx === "rain droplet reflections") {
        vfx = "subtle rain droplet reflections, wet surface";
    }

    // 互換ルール：candle + rain/snow は禁止
    if (lighting.includes("candlelight") || theme.toLowerCase().includes("candle")) {
        vfx = "dust motes in light beam";
    }

    // 影は室内のみ35%
    const shadow = isIndoor && Math.random() < 0.35 && SHADOW_PRESET.length > 0
        ? pickRandom(SHADOW_PRESET) : "";

    // アクセサリ
    const acc = [];
    if (isIndoor && Math.random() < 0.45 && ACCESSORIES_INDOOR.length > 0) {
        acc.push(pickRandom(ACCESSORIES_INDOOR));
    }
    if (Math.random() < 0.5 && ACCESSORIES_COMMON.length > 0) {
        acc.push(pickRandom(ACCESSORIES_COMMON));
    }

    // 眼鏡がある場合の追加ネガティブ
    const hasGlasses = acc.some(a => a.includes("glasses"));
    let extraNeg = hasGlasses ? NEGATIVE_GLASSES.join(", ") : "";

    // ============================================
    // 参照画像対策（常にON：画風はプロンプト優先）
    // ============================================
    const REF_NOTE = "Use reference image for character likeness only; follow the prompt's style, do NOT copy reference art style";
    const REF_NEG = "style transfer from reference, same shading as reference, same color grading as reference";
    extraNeg = extraNeg ? `${extraNeg}, ${REF_NEG}` : REF_NEG;

    // ============================================
    // 「柔×柔」事故防止（applyPressureFix）
    // ============================================
    let promptParts = {
        mode,
        outfit,
        expression,
        coreLine,
        pressureApplied: false
    };
    promptParts = applyPressureFix(promptParts);
    const finalCoreLine = promptParts.coreLine;

    const prompt = [
        QUALITY_FIXED,
        "Squall Leonhart from Final Fantasy VIII, brown wavy hair, steel-blue eyes, diagonal forehead scar",
        outfit,
        expression,
        finalCoreLine,  // スコールの核を追加
        theme,
        renderStyle,
        colorStyle,
        lighting,
        shadow,
        vfx,
        acc.length > 0 ? acc.join(", ") : null,
        REF_NOTE,
        "cinematic composition, depth of field",
        `Negative: ${NEGATIVE_FIXED}, ${extraNeg}`
    ].filter(Boolean).join(", ");

    // ============================================
    // 自動修正を適用（repairWithLog）
    // ============================================
    let parts = {
        envTag: isIndoor ? "indoor" : "outdoor",
        theme,
        expression,
        styleRender: renderStyle,
        styleColoring: colorStyle,
        lighting,
        vfx,
        shadow
    };

    const { parts: repairedParts, repairLog } = repairWithLog(parts);

    // 修正があった場合は修正後の値でプロンプトを再構築
    if (repairLog.length > 0) {
        const repairedPrompt = [
            QUALITY_FIXED,
            "Squall Leonhart from Final Fantasy VIII, brown wavy hair, steel-blue eyes, diagonal forehead scar",
            outfit,
            repairedParts.expression || expression,
            repairedParts.theme || theme,
            renderStyle,
            repairedParts.styleColoring,
            repairedParts.lighting,
            repairedParts.shadow || "",
            repairedParts.vfx,
            acc.length > 0 ? acc.join(", ") : null,
            REF_NOTE,
            "cinematic composition, depth of field",
            `Negative: ${NEGATIVE_FIXED}, ${extraNeg}`
        ].filter(Boolean).join(", ");

        return {
            isSpecial: false,
            prompt: repairedPrompt,
            details: {
                outfit,
                expression,
                theme: `${theme} (${isIndoor ? "indoor" : "outdoor"})`,
                style: `${renderStyle} / ${repairedParts.styleColoring}`,
                light: repairedParts.lighting,
                vfx: repairedParts.vfx,
                shadow: repairedParts.shadow || "なし",
                accessories: acc.length > 0 ? acc.join(", ") : "なし",
                core: finalCoreLine
            },
            repairLog,
            mode: mode === MODE.CANON ? "CANON" : "EXPERIMENT",
            pressureApplied: promptParts.pressureApplied
        };
    }

    return {
        isSpecial: false,
        prompt,
        details: {
            outfit,
            expression,
            theme: `${theme} (${isIndoor ? "indoor" : "outdoor"})`,
            style: `${renderStyle} / ${colorStyle}`,
            light: lighting,
            vfx: vfx,
            shadow: shadow || "なし",
            accessories: acc.length > 0 ? acc.join(", ") : "なし",
            core: finalCoreLine
        },
        repairLog: [],
        mode: mode === MODE.CANON ? "CANON" : "EXPERIMENT",
        pressureApplied: promptParts.pressureApplied
    };
}

// ============================================
// UI更新
// ============================================
function updateUI(result) {
    const specialBadge = document.getElementById('special-badge');
    const promptDisplay = document.getElementById('prompt-display');
    const detailsDisplay = document.getElementById('details-display');
    const copyBtn = document.getElementById('copy-btn');

    if (result.isSpecial) {
        specialBadge.textContent = `💍 ${result.specialName}`;
        specialBadge.classList.remove('hidden');
        detailsDisplay.innerHTML = `
      <p class="special-message">今日は特別な日だ……</p>
      <div class="detail-item"><span class="label">シチュ:</span> ${result.details.situation}</div>
      <div class="detail-item"><span class="label">スタイル:</span> ${result.details.style}</div>
      <div class="detail-item"><span class="label">光:</span> ${result.details.light}</div>
    `;
    } else {
        specialBadge.classList.add('hidden');
        let detailsHtml = `
      <div class="detail-item"><span class="label">服装:</span> ${result.details.outfit}</div>
      <div class="detail-item"><span class="label">表情:</span> ${result.details.expression}</div>
      <div class="detail-item"><span class="label">テーマ:</span> ${result.details.theme}</div>
      <div class="detail-item"><span class="label">スタイル:</span> ${result.details.style}</div>
      <div class="detail-item"><span class="label">光:</span> ${result.details.light}</div>
      <div class="detail-item"><span class="label">アクセ:</span> ${result.details.accessories}</div>
    `;

        // 修正ログがあれば表示
        if (result.repairLog && result.repairLog.length > 0) {
            detailsHtml += `
        <div class="repair-log">
          <div class="repair-header">🔧 スコールが直した:</div>
          ${result.repairLog.map(log => `<div class="repair-item">${log}</div>`).join('')}
        </div>
      `;
        }

        detailsDisplay.innerHTML = detailsHtml;
    }

    promptDisplay.textContent = result.prompt;
    copyBtn.classList.remove('hidden');

    // アニメーション
    promptDisplay.classList.add('fade-in');
    setTimeout(() => promptDisplay.classList.remove('fade-in'), 500);
}

// ============================================
// クリップボードコピー
// ============================================
async function copyToClipboard() {
    const promptText = document.getElementById('prompt-display').textContent;
    try {
        await navigator.clipboard.writeText(promptText);
        const copyBtn = document.getElementById('copy-btn');
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'コピーしました！';
        copyBtn.classList.add('copied');
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.classList.remove('copied');
        }, 2000);
    } catch (err) {
        console.error('コピーに失敗:', err);
    }
}

// ============================================
// イベントハンドラ
// ============================================
function onGenerate() {
    const result = generatePrompt();
    updateUI(result);
}

// ============================================
// 初期化
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // 祝日データを非同期で読み込み
    loadHolidayMap();

    document.getElementById('generate-btn').addEventListener('click', onGenerate);
    document.getElementById('copy-btn').addEventListener('click', copyToClipboard);

    // モード切替イベント
    const canonBtn = document.getElementById('mode-canon');
    const experimentBtn = document.getElementById('mode-experiment');

    canonBtn.addEventListener('click', () => {
        currentMode = MODE.CANON;
        canonBtn.classList.add('active');
        experimentBtn.classList.remove('active');
    });

    experimentBtn.addEventListener('click', () => {
        currentMode = MODE.EXPERIMENT;
        experimentBtn.classList.add('active');
        canonBtn.classList.remove('active');
    });

    // 記念日チェック（固定のみ、祝日は非同期後）
    const todayKey = getTodayKey();
    if (FIXED_SPECIAL_DAYS && FIXED_SPECIAL_DAYS[todayKey]) {
        const special = FIXED_SPECIAL_DAYS[todayKey];
        document.getElementById('special-notice').textContent = `✨ 今日は${special.name}です ✨`;
        document.getElementById('special-notice').classList.remove('hidden');
    }
});
