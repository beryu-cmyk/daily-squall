// ============================================
// Daily Squall Generator - メインロジック
// ============================================

// ランダム選択関数
function pickRandom(array) {
    return array[Math.floor(Math.random() * array.length)];
}

// 今日の日付を取得（月/日形式）
function getTodayKey() {
    const now = new Date();
    return `${now.getMonth() + 1}/${now.getDate()}`;
}

// 記念日かどうかチェック
function checkSpecialDay() {
    const todayKey = getTodayKey();
    return SPECIAL_DAYS[todayKey] || null;
}

// プロンプトを生成
function generatePrompt() {
    const specialDay = checkSpecialDay();

    if (specialDay) {
        // 記念日の場合は特別なプロンプト
        return {
            isSpecial: true,
            specialName: specialDay.name,
            prompt: `Squall Leonhart from Final Fantasy VIII. ${specialDay.situation}. 美麗なアニメ風イラスト、高品質、美しいライティング。`
        };
    }

    // 通常のランダム生成
    const outfit = pickRandom(OUTFITS);
    const expression = pickRandom(EXPRESSIONS);
    const theme = pickRandom(THEMES);
    const artStyle = pickRandom(ART_STYLES);
    const lighting = pickRandom(LIGHTING);
    // 50%の確率で小物を追加
    const prop = Math.random() > 0.5 ? pickRandom(PROPS) : null;

    let prompt = `Squall Leonhart from Final Fantasy VIII. 茶色のくせ毛、額から鼻にかけての傷跡、鋼色の青い目。${outfit}。${theme}${expression}。${lighting}。`;
    if (prop) {
        prompt += `${prop}を持っている。`;
    }
    prompt += `${artStyle}、高品質。`;

    return {
        isSpecial: false,
        outfit,
        expression,
        theme,
        artStyle,
        lighting,
        prop,
        prompt
    };
}

// UIを更新
function updateUI(result) {
    const specialBadge = document.getElementById('special-badge');
    const promptDisplay = document.getElementById('prompt-display');
    const detailsDisplay = document.getElementById('details-display');
    const copyBtn = document.getElementById('copy-btn');

    if (result.isSpecial) {
        specialBadge.textContent = `💍 ${result.specialName}`;
        specialBadge.classList.remove('hidden');
        detailsDisplay.innerHTML = `<p class="special-message">今日は特別な日だ……</p>`;
    } else {
        specialBadge.classList.add('hidden');
        let detailsHtml = `
      <div class="detail-item"><span class="label">服装:</span> ${result.outfit}</div>
      <div class="detail-item"><span class="label">表情:</span> ${result.expression}</div>
      <div class="detail-item"><span class="label">テーマ:</span> ${result.theme}</div>
      <div class="detail-item"><span class="label">絵柄:</span> ${result.artStyle}</div>
      <div class="detail-item"><span class="label">光:</span> ${result.lighting}</div>`;
        if (result.prop) {
            detailsHtml += `<div class="detail-item"><span class="label">小物:</span> ${result.prop}</div>`;
        }
        detailsDisplay.innerHTML = detailsHtml;
    }

    promptDisplay.textContent = result.prompt;
    copyBtn.classList.remove('hidden');

    // アニメーション
    promptDisplay.classList.add('fade-in');
    setTimeout(() => promptDisplay.classList.remove('fade-in'), 500);
}

// クリップボードにコピー
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

// メイン生成ボタンのイベント
function onGenerate() {
    const result = generatePrompt();
    updateUI(result);
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('generate-btn').addEventListener('click', onGenerate);
    document.getElementById('copy-btn').addEventListener('click', copyToClipboard);

    // 記念日チェック
    const specialDay = checkSpecialDay();
    if (specialDay) {
        document.getElementById('special-notice').textContent = `✨ 今日は${specialDay.name}です ✨`;
        document.getElementById('special-notice').classList.remove('hidden');
    }
});
