export const TABLE_BACKGROUND =
  "[background-image:repeating-linear-gradient(90deg,#573924_0px,#573924_80px,#4e321f_80px,#4e321f_160px)]";

export const WOOD_BACKGROUND =
  "[background-image:repeating-linear-gradient(90deg,#573924_0px,#573924_80px,#4e321f_80px,#4e321f_160px),radial-gradient(ellipse_at_50%_-10%,rgba(255,214,140,0.16),transparent_55%)]";

export const CARD =
  "rounded-3xl border-2 border-[#c9a86a] bg-[#f7ecd4] shadow-[0_8px_0_rgba(74,44,18,0.35),0_16px_30px_rgba(0,0,0,0.22)]";

export const EYEBROW =
  "text-[11px] font-extrabold uppercase leading-[1.4] tracking-[0.18em] text-[#a9793a]";

export const BTN_PRIMARY =
  "inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border-2 border-[#8a5a1e] bg-gradient-to-b from-[#e8b25a] to-[#c98a34] px-5 py-2.5 font-display text-[15px] font-extrabold text-[#4a2c12] shadow-[0_4px_0_#8a5a1e] transition enabled:hover:brightness-105 enabled:active:translate-y-0.5 enabled:active:shadow-[0_2px_0_#8a5a1e] disabled:opacity-50";

export const BTN_SECONDARY =
  "inline-flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border-2 border-[#c9a86a] bg-[#fdf6e3] px-5 py-2.5 font-display text-[15px] font-extrabold text-[#7a5320] shadow-[0_4px_0_#c9a86a] transition enabled:hover:brightness-105 enabled:active:translate-y-0.5 enabled:active:shadow-[0_2px_0_#c9a86a] disabled:opacity-50";

export const BTN_LINK =
  "border-0 bg-transparent px-2 py-1 text-sm font-bold text-[#a9793a] underline decoration-dotted underline-offset-4 transition enabled:hover:text-[#7a5320] disabled:opacity-50";

export const FIELD =
  "min-h-[46px] w-full rounded-2xl border-2 border-[#c9a86a] bg-[#fffaf0] px-3.5 py-2 text-[15px] font-semibold text-[#4a2c12] shadow-[inset_0_2px_4px_rgba(122,83,32,0.12)] outline-none transition placeholder:text-[#c0a273] focus:border-[#a9793a]";

export const MODAL_BACKDROP =
  "fixed inset-0 z-[90] grid place-items-center bg-[#2a1708]/60 p-4";

export const MODAL =
  "max-h-[calc(100vh-40px)] w-[min(560px,100%)] overflow-y-auto rounded-3xl border-2 border-[#c9a86a] bg-[#f7ecd4] px-5 py-[18px] shadow-[0_8px_0_rgba(74,44,18,0.35),0_18px_40px_rgba(20,10,2,0.45)]";

export const MODAL_ACTIONS = "mt-4 flex justify-end gap-2";

const CG_BUTTON_BASE =
  "inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl border-2 px-3.5 py-1.5 font-display text-xs font-extrabold transition enabled:hover:brightness-105 enabled:active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50";

export const CG_BUTTON_NEUTRAL = `${CG_BUTTON_BASE} border-[#c9a86a] bg-[#fdf6e3] text-[#7a5320] shadow-[0_3px_0_#c9a86a] enabled:active:shadow-[0_1px_0_#c9a86a]`;

export const CG_BUTTON_ACCEPT = `${CG_BUTTON_BASE} border-[#8a5a1e] bg-gradient-to-b from-[#e8b25a] to-[#c98a34] text-[#4a2c12] shadow-[0_3px_0_#8a5a1e] enabled:active:shadow-[0_1px_0_#8a5a1e]`;

export const CG_BUTTON_REJECT = `${CG_BUTTON_BASE} border-[#a4462f] bg-[#e07a5f] text-[#4a1c10] shadow-[0_3px_0_#a4462f] enabled:active:shadow-[0_1px_0_#a4462f]`;
