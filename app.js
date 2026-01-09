// ============================================
// Daily Squall Generator - メインロジック v2
// GPTスコール引き継ぎパック統合版
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

    // 通常のランダム生成
    const themeObj = pickRandom(THEMES);
    const theme = themeObj.text;
    const isIndoor = themeObj.tag === "indoor";

    const outfit = pickRandom(OUTFITS);
    let expression = pickRandom(EXPRESSIONS);
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

    const prompt = [
        QUALITY_FIXED,
        "Squall Leonhart from Final Fantasy VIII, brown wavy hair, steel-blue eyes, diagonal forehead scar",
        outfit,
        expression,
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
            accessories: acc.length > 0 ? acc.join(", ") : "なし"
        }
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
        detailsDisplay.innerHTML = `
      <div class="detail-item"><span class="label">服装:</span> ${result.details.outfit}</div>
      <div class="detail-item"><span class="label">表情:</span> ${result.details.expression}</div>
      <div class="detail-item"><span class="label">テーマ:</span> ${result.details.theme}</div>
      <div class="detail-item"><span class="label">スタイル:</span> ${result.details.style}</div>
      <div class="detail-item"><span class="label">光:</span> ${result.details.light}</div>
      <div class="detail-item"><span class="label">アクセ:</span> ${result.details.accessories}</div>
    `;
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

    // 記念日チェック（固定のみ、祝日は非同期後）
    const todayKey = getTodayKey();
    if (FIXED_SPECIAL_DAYS && FIXED_SPECIAL_DAYS[todayKey]) {
        const special = FIXED_SPECIAL_DAYS[todayKey];
        document.getElementById('special-notice').textContent = `✨ 今日は${special.name}です ✨`;
        document.getElementById('special-notice').classList.remove('hidden');
    }
});
