export const CARD =
  "rounded-[22px] border border-white/85 bg-[#fffdf7]/95 shadow-[0_12px_35px_rgba(39,58,44,0.08),0_2px_6px_rgba(39,58,44,0.05)]";

export const EYEBROW =
  "text-[10px] font-extrabold uppercase leading-[1.4] tracking-[0.15em] text-[#929080]";

export const BTN_PRIMARY =
  "inline-flex min-h-[42px] items-center justify-center gap-[7px] rounded-xl border border-transparent bg-[#2d6544] px-4 py-2.5 text-[13px] font-extrabold text-[#fffdf5] shadow-[0_4px_10px_rgba(44,98,65,0.15)] transition enabled:hover:-translate-y-px enabled:hover:bg-[#24563a] enabled:hover:shadow-[0_6px_14px_rgba(44,98,65,0.2)] disabled:opacity-50";

export const BTN_SECONDARY =
  "inline-flex min-h-[42px] items-center justify-center gap-[7px] rounded-xl border border-[#ddd8c9] bg-[#fffdf7] px-4 py-2.5 text-[13px] font-extrabold text-[#52624f] transition enabled:hover:border-[#c9c7b8] enabled:hover:bg-[#f8f5eb] disabled:opacity-50";

export const BTN_LINK =
  "border-0 bg-transparent px-1.5 py-1 text-[11px] font-extrabold text-[#4b7550] transition enabled:hover:text-[#25492e] enabled:hover:underline disabled:opacity-50";

export const FIELD =
  "min-h-[42px] rounded-xl border border-[#dedbcf] bg-[#fffefa] px-3 py-2 text-[#334337] outline-none transition placeholder:text-[#b0afa3] focus:border-[#a5b68b] focus:ring-[3px] focus:ring-[#83a16c]/15";

export const MODAL_BACKDROP =
  "fixed inset-0 z-[90] grid place-items-center bg-[#061a28]/60 p-4";

export const MODAL =
  "max-h-[calc(100vh-40px)] w-[min(560px,100%)] overflow-y-auto rounded-2xl border border-line bg-paper-soft px-5 py-[18px] shadow-[0_20px_60px_rgba(4,20,32,0.5)]";

export const MODAL_ACTIONS = "mt-4 flex justify-end gap-2";

export const CG_BUTTON =
  "rounded-[9px] border-0 bg-[#5b6b78] px-[13px] py-[7px] text-xs font-extrabold text-white shadow-[0_2px_0_rgba(0,0,0,0.18)] enabled:hover:brightness-105 disabled:opacity-50";

export const CG_BUTTON_ACCEPT = `${CG_BUTTON} bg-catan-green`;

export const CG_BUTTON_REJECT = `${CG_BUTTON} bg-catan-red`;

export const CG_BUTTON_NEUTRAL = `${CG_BUTTON} bg-[#f0e8d6] text-[#594f3d]`;
