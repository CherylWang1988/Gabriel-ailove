export interface Sticker {
  id: string;
  url: string;
  label: string;
}

export interface StickerCategory {
  key: string;
  label: string;
  stickers: Sticker[];
}

// Apple emoji PNG images from jsDelivr CDN (64px, high quality)
// Each sticker is a single emoji rendered as a large image,
// sent as a media message (not inline text emoji)
function e(code: string): string {
  return `https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.0.0/img/apple/64/${code}.png`;
}

export const STICKER_CATEGORIES: StickerCategory[] = [
  {
    key: "love",
    label: "爱心",
    stickers: [
      { id: "love-red", url: e("2764-fe0f"), label: "红心" },
      { id: "love-pink", url: e("1f497"), label: "粉心" },
      { id: "love-sparkle", url: e("1f496"), label: "闪心" },
      { id: "love-arrow", url: e("1f498"), label: "爱心箭" },
      { id: "love-letter", url: e("1f48c"), label: "情书" },
      { id: "love-rose", url: e("1f339"), label: "玫瑰" },
      { id: "love-kiss", url: e("1f618"), label: "飞吻" },
      { id: "love-hug", url: e("1f917"), label: "抱抱" },
    ],
  },
  {
    key: "cute",
    label: "可爱",
    stickers: [
      { id: "cute-bunny", url: e("1f430"), label: "兔兔" },
      { id: "cute-cat", url: e("1f431"), label: "猫咪" },
      { id: "cute-dog", url: e("1f436"), label: "狗狗" },
      { id: "cute-bear", url: e("1f43b"), label: "熊熊" },
      { id: "cute-panda", url: e("1f43c"), label: "熊猫" },
      { id: "cute-chick", url: e("1f424"), label: "小鸡" },
      { id: "cute-pig", url: e("1f437"), label: "猪猪" },
      { id: "cute-frog", url: e("1f438"), label: "青蛙" },
    ],
  },
  {
    key: "funny",
    label: "搞怪",
    stickers: [
      { id: "funny-laugh", url: e("1f602"), label: "笑哭" },
      { id: "funny-wink", url: e("1f61c"), label: "眨眼" },
      { id: "funny-cool", url: e("1f60e"), label: "酷酷" },
      { id: "funny-silly", url: e("1f61d"), label: "吐舌" },
      { id: "funny-rolling", url: e("1f644"), label: "翻白眼" },
      { id: "funny-thinking", url: e("1f914"), label: "思考" },
      { id: "funny-zany", url: e("1f92a"), label: "疯狂" },
      { id: "funny-party", url: e("1f973"), label: "派对" },
    ],
  },
  {
    key: "daily",
    label: "日常",
    stickers: [
      { id: "daily-thumbsup", url: e("1f44d"), label: "点赞" },
      { id: "daily-clap", url: e("1f44f"), label: "鼓掌" },
      { id: "daily-pray", url: e("1f64f"), label: "感谢" },
      { id: "daily-ok", url: e("1f44c"), label: "OK" },
      { id: "daily-fire", url: e("1f525"), label: "火了" },
      { id: "daily-star", url: e("2b50"), label: "星星" },
      { id: "daily-100", url: e("1f4af"), label: "满分" },
      { id: "daily-gift", url: e("1f381"), label: "礼物" },
    ],
  },
];

// Flatten all stickers for grid display
export const ALL_STICKERS: Sticker[] = STICKER_CATEGORIES.flatMap((c) => c.stickers);
