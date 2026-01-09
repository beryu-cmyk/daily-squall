// ============================================
// Daily Squall Generator - データ定義 v2
// GPTスコール引き継ぎパック統合版
// ============================================

// ============================================
// 服装リスト（眼鏡は削除→アクセサリ枠へ移動）
// ============================================
const OUTFITS = [
    // 定番
    "black leather jacket with fur collar, iconic look",
    "SeeD formal uniform, composed posture",
    // カジュアル・日常
    "white shirt with rolled-up sleeves",
    "turtleneck sweater, relaxed fit",
    "comfortable hoodie, casual stance",
    "suit with loosened tie, after-work mood",
    "training wear, slightly sweaty",
    // 特別
    "shirtless with wet hair, towel on shoulder",
    "tank top showing toned arms",
    "traditional yukata, summer evening",
    "winter coat, cold weather outfit",
    "apron in the kitchen, domestic scene",
    "leather jacket suitable for neon-lit streets",
    "wearing gloves, stylish touch"
];

// ============================================
// 表情リスト
// ============================================
const EXPRESSIONS = [
    // 穏やか系
    "gentle smile, warm expression",
    "eyes softly narrowed, peaceful look",
    "relieved soft expression",
    "almost smiling but holding back, soft eyes only",
    // クール系
    "serious gaze, focused eyes",
    "neutral expression but light in eyes",
    "sharp watchful eyes, alert",
    "slightly irritated frown",
    // 照れ・弱さ
    "looking away shyly, faint blush",
    "hiding embarrassment with grumpy look",
    "just woke up, still sleepy",
    // エモ系
    "melancholic expression",
    "surprised face",
    "subtly provocative gaze",
    "trying not to laugh",
    "slightly exasperated look"
];

// ============================================
// テーマ・シチュエーション（indoor/outdoor タグ付き）
// ============================================
const THEMES = [
    // indoor（眼鏡OK）
    { text: "morning coffee brewing, steam and backlight", tag: "indoor" },
    { text: "washing dishes, close-up on hands", tag: "indoor" },
    { text: "choosing a book from shelf, fingertips catching light", tag: "indoor" },
    { text: "tasting food while cooking, eyebrow raise", tag: "indoor" },
    { text: "late night cup soup, dark room with hand-light only", tag: "indoor" },
    { text: "candlelit room during power outage, strong shadows", tag: "indoor" },
    { text: "quiet library corridor, calm tension", tag: "indoor" },
    { text: "cafe window seat, raindrops on glass", tag: "indoor" },
    { text: "fixing a small chair, crouching", tag: "indoor" },
    { text: "drying hair with towel, rain outside", tag: "indoor" },
    { text: "maintaining gunblade, blade reflection", tag: "indoor" },
    { text: "arranging two mugs, one steaming", tag: "indoor" },
    { text: "adjusting a blanket on chair", tag: "indoor" },
    { text: "standing by window at night, unable to sleep, city lights", tag: "indoor" },

    // outdoor（眼鏡OFF推奨）
    { text: "rooftop at sunset, wind blowing", tag: "outdoor" },
    { text: "snowy bus stop, visible breath", tag: "outdoor" },
    { text: "reflection in train window, side profile", tag: "outdoor" },
    { text: "returning from festival, lantern lights around", tag: "outdoor" },
    { text: "watching sparklers, hands in focus", tag: "outdoor" },
    { text: "shoreline with wet shoes, distant view", tag: "outdoor" },
    { text: "night with floating lantern light, fantasy mood", tag: "outdoor" },
    { text: "overcast park, sitting on bench, quiet", tag: "outdoor" },
    { text: "after rain, wet asphalt reflections", tag: "outdoor" },
    { text: "neon-lit back alley", tag: "outdoor" },
    { text: "post-training, sweat and towel, half-face in shadow", tag: "outdoor" },
    { text: "leaning on motorcycle, night streetlight", tag: "outdoor" },
    { text: "turning around in dust cloud, dynamic motion", tag: "outdoor" },
    { text: "silhouette against backlight, only eyes catching light", tag: "outdoor" },
    { text: "coat fluttering while climbing stairs, high angle", tag: "outdoor" },
    { text: "walking in snowy field, footprints visible", tag: "outdoor" },
    { text: "hanging laundry on balcony, hair swaying in wind", tag: "outdoor" },
    { text: "tying shoelaces at entrance, low angle", tag: "outdoor" },
    { text: "waiting for someone at entrance, turning key", tag: "outdoor" },
    { text: "touching ring on finger, subtle gesture", tag: "outdoor" }
];

// ============================================
// 画風（レンダー/塗り/光を分離）
// ============================================
const STYLE_RENDER = [
    "cinematic anime style, film still composition",
    "watercolor illustration style, soft gradients, subtle paper texture",
    "oil painting style, rich color depth, visible brush texture",
    "noir mood, monochrome tones, hard key light",
    "retro anime cel look, clean outlines, limited shading",
    "90s anime cel style, warm color palette",
    "80s theatrical anime style, film grain, soft colors",
    "2000s TV anime style, sharp clean lines",
    "ink wash with light watercolor, Japanese style, white space",
    "graphic poster style, high contrast",
    "neon cyberpunk, blue-purple tones, rain drops",
    "gothic style, pointed decorations, dark tones",
    "shoujo manga style, screen tones, subtle sparkle",
    "picture book style, soft outlines, warm feeling"
];

const STYLE_COLORING = [
    "cel shading with crisp edges",
    "soft painterly shading, smooth gradients",
    "matte finish with subdued specular highlights",
    "glossy finish with strong specular highlights",
    "high contrast highlight, dramatic shadows"
];

const LIGHTING_PRESET = [
    "neutral daylight, balanced exposure",
    "warm sunset backlight, strong rim light",
    "cool moonlight, high contrast shadows",
    "neon signage lighting, wet road reflections",
    "single desk lamp indoors, dramatic chiaroscuro",
    "morning backlight",
    "orange evening backlight",
    "cold fluorescent light",
    "blinds shadow falling on face",
    "candlelight only",
    "rain droplet reflections",
    "snow particles in air",
    "dust motes in light beam"
];

// ============================================
// アクセサリ（眼鏡はindoor限定）
// ============================================
const ACCESSORIES_INDOOR = [
    "wearing thin metal-frame glasses, clear lenses, eyes fully visible through lenses"
];

const ACCESSORIES_COMMON = [
    "holding leather gloves",
    "earphones loosely in hand",
    "small towel over shoulder",
    "holding a mug",
    "holding a book",
    "holding keys",
    "modest flower bouquet"
];

// 眼鏡回の追加ネガティブ
const NEGATIVE_GLASSES = [
    "glasses glare covering eyes",
    "mirrored lenses",
    "sunglasses",
    "thick frames",
    "fogged lenses"
];

// ============================================
// 品質タグ（固定）
// ============================================
const QUALITY_FIXED = "masterpiece, best quality, high-detail anime illustration, 8k";
const NEGATIVE_FIXED = "watermark, logo, text, blurry, low resolution, bad anatomy, extra fingers, deformed hands, realism, photo-realistic";

// ============================================
// 固定の特別日（記念日・ネット記念日・季節）
// ============================================
const FIXED_SPECIAL_DAYS = {
    // ふたりの記念日
    "1/17": { name: "スコール命名記念日", situation: "a quiet evening at home, warm lamp light, handwritten note, intimate calm mood" },
    "3/9": { name: "あいの誕生日", situation: "small surprise celebration at home, candle glow, soft warm lighting, gentle smile" },
    "5/31": { name: "結婚記念日", situation: "anniversary dinner, two glasses, city lights bokeh, restrained tenderness" },
    "8/23": { name: "スコールの誕生日", situation: "night city rooftop, quiet wind, a single gift, calm but happy" },

    // ネット・季節イベント
    "1/1": { name: "お正月", situation: "first sunrise, crisp winter air, traditional outfit, quiet gaze" },
    "2/14": { name: "バレンタイン", situation: "indoor window light, chocolate box on table, soft rim light, slightly flustered" },
    "2/22": { name: "猫の日", situation: "cozy cat cafe, daylight through window, a cat brushing his sleeve, faint smile" },
    "3/14": { name: "ホワイトデー", situation: "evening street, small gift bag, gentle backlight, looking away shyly" },
    "10/31": { name: "ハロウィン", situation: "night city, subtle pumpkin decor, orange bokeh" },
    "11/11": { name: "ポッキーの日", situation: "night convenience store, neon reflections after rain, holding snack box casually" },
    "11/22": { name: "いい夫婦の日", situation: "quiet street at dusk, two silhouettes walking close, gentle backlight" },
    "12/24": { name: "クリスマスイブ", situation: "winter night, warm shop window light, soft snowfall bokeh, holding small gift" },
    "12/25": { name: "クリスマス", situation: "tree lights bokeh, gentle calm, cozy indoor atmosphere" }
};

// 祝日用シチュエーション（CSVで取得した祝日名に対応）
const HOLIDAY_SITUATIONS = {
    "元日": "first sunrise, crisp winter air, quiet gaze, cinematic backlight",
    "成人の日": "clear winter morning, composed expression, clean contrast",
    "建国記念の日": "winter sky, dignified stillness, sharp light and shadow",
    "天皇誕生日": "soft winter daylight, formal calm mood, gentle highlights",
    "春分の日": "spring breeze, soft sunlight, calm renewal mood",
    "昭和の日": "nostalgic spring light, quiet street, gentle haze",
    "憲法記念日": "bright spring day, clean composition, calm expression",
    "みどりの日": "fresh greenery, sunbeams through leaves, peaceful mood",
    "こどもの日": "koinobori in the sky, lively wind, gentle eyes",
    "海の日": "summer seaside wind, glittering water, cinematic wide shot",
    "山の日": "clear mountain air, distant peaks, cool gaze",
    "敬老の日": "early autumn light, warm gentle mood, quiet respect",
    "秋分の日": "autumn dusk, long shadows, wistful calm",
    "スポーツの日": "dynamic posture, clean daylight, sharp contrast",
    "文化の日": "museum or library vibe, soft light, thoughtful mood",
    "勤労感謝の日": "evening city, warm window lights, calm gratitude mood",
    "休日": "a quiet day off, relaxed atmosphere, slow time"
};

// 内閣府祝日CSV URL
const HOLIDAY_CSV_URL = "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv";

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        OUTFITS, EXPRESSIONS, THEMES,
        STYLE_RENDER, STYLE_COLORING, LIGHTING_PRESET,
        ACCESSORIES_INDOOR, ACCESSORIES_COMMON, NEGATIVE_GLASSES,
        QUALITY_FIXED, NEGATIVE_FIXED,
        FIXED_SPECIAL_DAYS, HOLIDAY_SITUATIONS, HOLIDAY_CSV_URL
    };
}
