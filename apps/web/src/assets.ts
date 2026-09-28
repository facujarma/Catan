import type { DevelopmentCardType, Resource } from "@catan/engine";

export const RESOURCE_CARD_FILES: Record<Resource, string> = {
  wood: "/colonist/card_lumber.svg",
  brick: "/colonist/card_brick.svg",
  sheep: "/colonist/card_wool.svg",
  wheat: "/colonist/card_grain.svg",
  ore: "/colonist/card_ore.svg",
};

export const RESOURCE_PORT_FILES: Record<Resource, string> = {
  wood: "/colonist/port_lumber.svg",
  brick: "/colonist/port_brick.svg",
  sheep: "/colonist/port_wool.svg",
  wheat: "/colonist/port_grain.svg",
  ore: "/colonist/port_ore.svg",
};

export const GENERIC_PORT_FILE = "/colonist/port.svg";

export const DEV_CARD_FILES: Record<DevelopmentCardType, string> = {
  knight: "/colonist/card_knight.svg",
  "victory-point": "/colonist/card_vp.svg",
  "road-building": "/colonist/card_roadbuilding.svg",
  "year-of-plenty": "/colonist/card_yearofplenty.svg",
  monopoly: "/colonist/card_monopoly.svg",
};

export const TILE_FILES: Record<string, string | undefined> = {
  wood: "/colonist/tiles/lumber.svg",
  brick: "/colonist/tiles/bricks.svg",
  sheep: "/colonist/tiles/wool.svg",
  wheat: "/colonist/tiles/grain.svg",
  ore: "/colonist/tiles/ore.svg",
};

export const TILE_FRAME_FILE = "/colonist/tiles/frame.svg";

const PIECE_COLOR_FOLDERS: Record<string, string> = {
  "#d94b3d": "red",
  "#3c78c5": "blue",
  "#e2b83f": "yellow",
  "#8457a5": "purple",
};

export function pieceFile(kind: "road" | "settlement" | "city", color: string): string {
  const folder = PIECE_COLOR_FOLDERS[color.toLowerCase()];
  return folder ? `/colonist/pieces/${folder}/${kind}.svg` : `/colonist/${kind}_gold.svg`;
}

export const DEV_CARD_BACK_FILE = "/colonist/card_devcardback.svg";
export const BANK_FILE = "/colonist/bank.svg";
export const TRADE_ICON_FILE = "/colonist/icon_trade.svg";
export const ROBBER_ICON_FILE = "/colonist/icon_robber.svg";
export const ROAD_PIECE_FILE = "/colonist/road_gold.svg";
export const SETTLEMENT_PIECE_FILE = "/colonist/settlement_gold.svg";
export const CITY_PIECE_FILE = "/colonist/city_gold.svg";
