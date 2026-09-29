import { generateBoardWithRandom } from "./board";
import { SeededRandom } from "./random";
import {
  addResources,
  BUILDING_COSTS,
  emptyResources,
  hasResources,
  subtractResources,
  totalResources,
  validateResourceBundle,
} from "./resources";
import {
  getCurrentPlayerId,
  getSettlementOwner,
  getVictoryPoints,
  recalculateAwards,
} from "./scoring";
import {
  RESOURCES,
  type Board,
  type CreateGameOptions,
  type DevelopmentCard,
  type DevelopmentCardType,
  type Edge,
  type GameAction,
  type GameState,
  type HeldDevelopmentCard,
  type PlayerState,
  type Resource,
  type ResourceBundle,
  type TradeOffer,
  type Vertex,
} from "./types";

const PLAYER_COLORS = ["#d94b3d", "#3c78c5", "#3f4249", "#8457a5"];
const MAX_ROADS = 15;
const MAX_SETTLEMENTS = 5;
const MAX_CITIES = 4;
const RESOURCE_BANK_SIZE = 19;

export type EngineErrorCode =
  | "INVALID_PLAYER"
  | "INVALID_PHASE"
  | "NOT_YOUR_TURN"
  | "GAME_FINISHED"
  | "INVALID_TARGET"
  | "ILLEGAL_PLACEMENT"
  | "NOT_ENOUGH_RESOURCES"
  | "PIECE_LIMIT"
  | "INVALID_DISCARD"
  | "INVALID_ROBBER_MOVE"
  | "CHOOSE_VICTIM"
  | "INVALID_CARD"
  | "CARD_PLAYED_THIS_TURN"
  | "CARD_TOO_NEW"
  | "EMPTY_DECK"
  | "INVALID_TRADE"
  | "TRADE_NOT_AFFORDABLE"
  | "INVALID_RESOURCE_BUNDLE"
  | "INVALID_RESOURCE"
  | "NO_BANK_RESOURCES";

export class EngineError extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.name = "EngineError";
    this.code = code;
  }
}

function fail(code: EngineErrorCode, message: string): never {
  throw new EngineError(code, message);
}

function createDevelopmentDeck(random: SeededRandom): DevelopmentCard[] {
  const cardTypes: DevelopmentCardType[] = [
    ...Array.from({ length: 14 }, () => "knight" as const),
    ...Array.from({ length: 5 }, () => "victory-point" as const),
    ...Array.from({ length: 2 }, () => "road-building" as const),
    ...Array.from({ length: 2 }, () => "year-of-plenty" as const),
    ...Array.from({ length: 2 }, () => "monopoly" as const),
  ];
  const cards = cardTypes.map((type, index) => ({
    id: `dev-${String(index + 1).padStart(2, "0")}`,
    type,
  }));
  return random.shuffle(cards);
}

function validatePlayerConfigs(options: CreateGameOptions): void {
  if (options.players.length < 3 || options.players.length > 4) {
    throw new Error("Una partida necesita entre 3 y 4 jugadores.");
  }

  const ids = new Set<string>();
  for (const player of options.players) {
    if (!player.id.trim()) throw new Error("Cada jugador necesita un id.");
    if (ids.has(player.id)) throw new Error(`El id ${player.id} está repetido.`);
    ids.add(player.id);
    if (!player.name.trim()) throw new Error(`El jugador ${player.id} necesita un nombre.`);
  }
}

export function createGame(options: CreateGameOptions): GameState {
  validatePlayerConfigs(options);
  const random = new SeededRandom(options.seed);
  const board = generateBoardWithRandom(random);
  const developmentDeck = createDevelopmentDeck(random);
  const desert = board.hexes.find((hex) => hex.terrain === "desert");
  if (!desert) throw new Error("El tablero generado no tiene desierto.");

  const players: PlayerState[] = options.players.map((config, index) => ({
    id: config.id,
    name: config.name,
    color: config.color ?? PLAYER_COLORS[index]!,
    resources: emptyResources(),
    developmentCards: [],
    boughtDevelopmentCards: [],
    roads: [],
    settlements: [],
    cities: [],
    playedKnights: 0,
  }));

  return {
    board,
    players,
    bank: Object.fromEntries(
      RESOURCES.map((resource) => [resource, RESOURCE_BANK_SIZE]),
    ) as ResourceBundle,
    developmentDeck,
    phase: "setup-settlement",
    currentPlayerIndex: 0,
    setupIndex: 0,
    setupRoadFromVertexId: null,
    turnNumber: 0,
    hasRolled: false,
    robberHexId: desert.id,
    pendingDiscards: {},
    pendingRobberVictim: null,
    activeTrade: null,
    longestRoadHolderId: null,
    largestArmyHolderId: null,
    playedDevelopmentCardThisTurn: false,
    lastRoll: null,
    rollHistory: [],
    winnerId: null,
    rngState: random.state,
    nextTradeId: 1,
  };
}

function cloneBoard(board: Board): Board {
  return {
    hexes: board.hexes.map((hex) => ({
      ...hex,
      neighborHexIds: [...hex.neighborHexIds],
    })),
    vertices: board.vertices.map((vertex) => ({
      ...vertex,
      hexIds: [...vertex.hexIds],
      edgeIds: [...vertex.edgeIds],
      adjacentVertexIds: [...vertex.adjacentVertexIds],
    })),
    edges: board.edges.map((edge) => ({
      ...edge,
      vertexIds: [...edge.vertexIds] as [string, string],
      hexIds: [...edge.hexIds],
    })),
    ports: board.ports.map((port) => ({
      ...port,
      vertexIds: [...port.vertexIds] as [string, string],
    })),
  };
}

function cloneGameState(state: GameState): GameState {
  return {
    ...state,
    board: cloneBoard(state.board),
    players: state.players.map((player) => ({
      ...player,
      resources: { ...player.resources },
      developmentCards: player.developmentCards.map((card) => ({ ...card })),
      boughtDevelopmentCards: [...player.boughtDevelopmentCards],
      roads: [...player.roads],
      settlements: [...player.settlements],
      cities: [...player.cities],
    })),
    bank: { ...state.bank },
    developmentDeck: state.developmentDeck.map((card) => ({ ...card })),
    pendingDiscards: { ...state.pendingDiscards },
    pendingRobberVictim: state.pendingRobberVictim
      ? {
          hexId: state.pendingRobberVictim.hexId,
          victimIds: [...state.pendingRobberVictim.victimIds],
        }
      : null,
    activeTrade: state.activeTrade
      ? {
          ...state.activeTrade,
          give: { ...state.activeTrade.give },
          want: { ...state.activeTrade.want },
          acceptedBy: [...state.activeTrade.acceptedBy],
          rejectedBy: [...state.activeTrade.rejectedBy],
        }
      : null,
    lastRoll: state.lastRoll
      ? { dice: [...state.lastRoll.dice] as [number, number], total: state.lastRoll.total }
      : null,
    rollHistory: [...state.rollHistory],
  };
}

function getPlayer(state: GameState, playerId: string): PlayerState {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) fail("INVALID_PLAYER", `No existe el jugador ${playerId}.`);
  return player;
}

function requirePhase(state: GameState, ...phases: GameState["phase"][]): void {
  if (!phases.includes(state.phase)) {
    fail("INVALID_PHASE", `La acción no se permite durante la fase ${state.phase}.`);
  }
}

function requireCurrentPlayer(state: GameState, playerId: string): void {
  if (getCurrentPlayerId(state) !== playerId) {
    fail("NOT_YOUR_TURN", "La acción solo puede realizarla el jugador activo.");
  }
}

function requireActiveGame(state: GameState): void {
  if (state.phase === "finished" || state.winnerId !== null) {
    fail("GAME_FINISHED", "La partida ya terminó.");
  }
}

function getVertex(state: GameState, vertexId: string): Vertex {
  const vertex = state.board.vertices.find((candidate) => candidate.id === vertexId);
  if (!vertex) fail("INVALID_TARGET", `No existe el vértice ${vertexId}.`);
  return vertex;
}

function getEdge(state: GameState, edgeId: string): Edge {
  const edge = state.board.edges.find((candidate) => candidate.id === edgeId);
  if (!edge) fail("INVALID_TARGET", `No existe el camino ${edgeId}.`);
  return edge;
}

function getRoadOwner(state: GameState, edgeId: string): string | null {
  return state.players.find((player) => player.roads.includes(edgeId))?.id ?? null;
}

function getBuildingOwner(state: GameState, vertexId: string): string | null {
  return getSettlementOwner(state, vertexId);
}

function getCityOwner(state: GameState, vertexId: string): string | null {
  return state.players.find((player) => player.cities.includes(vertexId))?.id ?? null;
}

function canPlaceSettlementOnBoard(
  state: GameState,
  playerId: string,
  vertexId: string,
  requireRoad: boolean,
): boolean {
  const vertex = state.board.vertices.find((candidate) => candidate.id === vertexId);
  if (!vertex || getBuildingOwner(state, vertexId) !== null) return false;
  if (vertex.adjacentVertexIds.some((neighborId) => getBuildingOwner(state, neighborId) !== null)) {
    return false;
  }
  if (!requireRoad) return true;
  return vertex.edgeIds.some((edgeId) => getRoadOwner(state, edgeId) === playerId);
}

function canPlaceRoadOnBoard(
  state: GameState,
  playerId: string,
  edgeId: string,
  setupVertexId: string | null = null,
): boolean {
  const edge = state.board.edges.find((candidate) => candidate.id === edgeId);
  if (!edge || getRoadOwner(state, edgeId) !== null) return false;

  if (setupVertexId !== null) return edge.vertexIds.includes(setupVertexId);

  return edge.vertexIds.some((vertexId) => {
    const buildingOwner = getBuildingOwner(state, vertexId);
    if (buildingOwner === playerId) return true;
    if (buildingOwner !== null) return false;

    const vertex = getVertex(state, vertexId);
    return vertex.edgeIds.some(
      (connectedEdgeId) =>
        connectedEdgeId !== edgeId && getRoadOwner(state, connectedEdgeId) === playerId,
    );
  });
}

function canAfford(player: PlayerState, costName: keyof typeof BUILDING_COSTS): boolean {
  return hasResources(player.resources, BUILDING_COSTS[costName]);
}

export function getLegalSettlementPlacements(
  state: GameState,
  playerId: string,
): string[] {
  const player = getPlayer(state, playerId);
  const isSetup = state.phase === "setup-settlement";
  const isMainTurn = state.phase === "main" && getCurrentPlayerId(state) === playerId;
  if (isSetup && getCurrentPlayerId(state) !== playerId) return [];
  if (!isSetup && !isMainTurn) return [];
  if (isMainTurn && (player.settlements.length >= MAX_SETTLEMENTS || !canAfford(player, "settlement"))) {
    return [];
  }

  return state.board.vertices
    .filter((vertex) => canPlaceSettlementOnBoard(state, playerId, vertex.id, isMainTurn))
    .map((vertex) => vertex.id);
}

export function getLegalRoadPlacements(
  state: GameState,
  playerId: string,
  options: { free?: boolean } = {},
): string[] {
  const player = getPlayer(state, playerId);
  if (state.phase === "setup-road" && getCurrentPlayerId(state) === playerId) {
    if (state.setupRoadFromVertexId === null) return [];
    return state.board.edges
      .filter((edge) => canPlaceRoadOnBoard(state, playerId, edge.id, state.setupRoadFromVertexId))
      .map((edge) => edge.id);
  }

  if (
    state.phase !== "main" ||
    getCurrentPlayerId(state) !== playerId ||
    player.roads.length >= MAX_ROADS ||
    (!options.free && !canAfford(player, "road"))
  ) {
    return [];
  }
  return state.board.edges
    .filter((edge) => canPlaceRoadOnBoard(state, playerId, edge.id))
    .map((edge) => edge.id);
}

export function getLegalCityUpgrades(state: GameState, playerId: string): string[] {
  const player = getPlayer(state, playerId);
  if (
    state.phase !== "main" ||
    getCurrentPlayerId(state) !== playerId ||
    player.cities.length >= MAX_CITIES ||
    !canAfford(player, "city")
  ) {
    return [];
  }
  return [...player.settlements];
}

function validateBundle(resources: ResourceBundle): void {
  try {
    validateResourceBundle(resources);
  } catch (error) {
    fail(
      "INVALID_RESOURCE_BUNDLE",
      error instanceof Error ? error.message : "El intercambio contiene recursos inválidos.",
    );
  }
}

function spendResources(
  state: GameState,
  player: PlayerState,
  costName: keyof typeof BUILDING_COSTS,
): void {
  const cost = BUILDING_COSTS[costName];
  if (!hasResources(player.resources, cost)) {
    fail("NOT_ENOUGH_RESOURCES", `Faltan recursos para ${costName}.`);
  }
  subtractResources(player.resources, cost);
  addResources(state.bank, cost);
}

function distributeInitialResources(
  state: GameState,
  player: PlayerState,
  vertexId: string,
): void {
  const vertex = getVertex(state, vertexId);
  for (const hexId of vertex.hexIds) {
    const hex = state.board.hexes.find((candidate) => candidate.id === hexId)!;
    if (hex.terrain === "desert" || state.bank[hex.terrain] <= 0) continue;
    state.bank[hex.terrain] -= 1;
    player.resources[hex.terrain] += 1;
  }
}

function advanceSetup(state: GameState): void {
  state.setupIndex += 1;
  state.setupRoadFromVertexId = null;

  if (state.setupIndex >= state.players.length * 2) {
    state.phase = "awaiting-roll";
    state.currentPlayerIndex = 0;
    state.turnNumber = 1;
    return;
  }

  state.currentPlayerIndex =
    state.setupIndex < state.players.length
      ? state.setupIndex
      : state.players.length * 2 - state.setupIndex - 1;
  state.phase = "setup-settlement";
}

function getVictimsAtHex(
  state: GameState,
  hexId: string,
  currentPlayerId: string,
): PlayerState[] {
  const adjacentVertices = state.board.vertices.filter((vertex) => vertex.hexIds.includes(hexId));
  const victimIds = new Set<string>();
  for (const vertex of adjacentVertices) {
    const ownerId = getBuildingOwner(state, vertex.id);
    if (ownerId && ownerId !== currentPlayerId) victimIds.add(ownerId);
  }
  return state.players.filter(
    (player) => victimIds.has(player.id) && totalResources(player.resources) > 0,
  );
}

export function getRobberVictims(
  state: GameState,
  hexId: string,
  currentPlayerId: string,
): string[] {
  return getVictimsAtHex(state, hexId, currentPlayerId).map((player) => player.id);
}

function stealRandomResource(
  thief: PlayerState,
  victim: PlayerState,
  random: SeededRandom,
): void {
  const cardCount = totalResources(victim.resources);
  if (cardCount === 0) return;

  let selectedCard = random.nextInt(cardCount);
  for (const resource of RESOURCES) {
    if (selectedCard < victim.resources[resource]) {
      victim.resources[resource] -= 1;
      thief.resources[resource] += 1;
      return;
    }
    selectedCard -= victim.resources[resource];
  }
}

function moveRobber(
  state: GameState,
  playerId: string,
  hexId: string,
  victimId: string | null,
  random: SeededRandom,
): void {
  const hex = state.board.hexes.find((candidate) => candidate.id === hexId);
  if (!hex || hexId === state.robberHexId) {
    fail("INVALID_ROBBER_MOVE", "El ladrón debe moverse a otro hexágono del tablero.");
  }

  const victims = getVictimsAtHex(state, hexId, playerId);
  state.robberHexId = hexId;
  state.pendingRobberVictim = null;

  if (victimId !== null) {
    const victim = victims.find((candidate) => candidate.id === victimId);
    if (!victim) {
      fail("INVALID_ROBBER_MOVE", "El jugador elegido no tiene una construcción junto al hexágono.");
    }
    stealRandomResource(getPlayer(state, playerId), victim, random);
    return;
  }

  if (victims.length > 1) {
    state.pendingRobberVictim = {
      hexId,
      victimIds: victims.map((candidate) => candidate.id),
    };
    return;
  }

  const victim = victims[0];
  if (victim) stealRandomResource(getPlayer(state, playerId), victim, random);
}

function chooseRobberVictim(
  state: GameState,
  playerId: string,
  victimId: string,
  random: SeededRandom,
): void {
  requirePhase(state, "robber-victim");
  requireCurrentPlayer(state, playerId);
  const pending = state.pendingRobberVictim;
  if (!pending || !pending.victimIds.includes(victimId)) {
    fail("INVALID_ROBBER_MOVE", "Elegí a un jugador con construcciones junto al ladrón.");
  }
  stealRandomResource(getPlayer(state, playerId), getPlayer(state, victimId), random);
  state.pendingRobberVictim = null;
}

function produceResources(state: GameState, roll: number): void {
  const demandByPlayer = new Map<string, ResourceBundle>(
    state.players.map((player) => [player.id, emptyResources()]),
  );
  const demandByResource = emptyResources();

  for (const hex of state.board.hexes) {
    if (hex.number !== roll || hex.id === state.robberHexId || hex.terrain === "desert") {
      continue;
    }

    for (const vertex of state.board.vertices) {
      if (!vertex.hexIds.includes(hex.id)) continue;
      const ownerId = getBuildingOwner(state, vertex.id);
      if (!ownerId) continue;

      const amount = getCityOwner(state, vertex.id) === ownerId ? 2 : 1;
      demandByPlayer.get(ownerId)![hex.terrain] += amount;
      demandByResource[hex.terrain] += amount;
    }
  }

  for (const resource of RESOURCES) {
    if (state.bank[resource] < demandByResource[resource]) continue;
    state.bank[resource] -= demandByResource[resource];
    for (const player of state.players) {
      player.resources[resource] += demandByPlayer.get(player.id)![resource];
    }
  }
}

function requireMainTurn(state: GameState, playerId: string): PlayerState {
  requirePhase(state, "main");
  requireCurrentPlayer(state, playerId);
  return getPlayer(state, playerId);
}

function requirePlayableTurn(state: GameState, playerId: string): PlayerState {
  requirePhase(state, "awaiting-roll", "main");
  requireCurrentPlayer(state, playerId);
  return getPlayer(state, playerId);
}

function requireDevelopmentCard(
  state: GameState,
  player: PlayerState,
  cardId: string,
  expectedType: DevelopmentCardType,
): HeldDevelopmentCard {
  if (state.playedDevelopmentCardThisTurn) {
    fail("CARD_PLAYED_THIS_TURN", "Solo se puede jugar una carta de desarrollo por turno.");
  }

  const card = player.developmentCards.find((candidate) => candidate.id === cardId);
  if (!card || card.type !== expectedType || card.type === "victory-point") {
    fail("INVALID_CARD", "La carta elegida no está en tu mano o no corresponde a esta acción.");
  }
  if (card.boughtOnTurn >= state.turnNumber) {
    fail("CARD_TOO_NEW", "No se puede jugar una carta de desarrollo comprada este turno.");
  }
  return card;
}

function discardDevelopmentCard(player: PlayerState, cardId: string): void {
  player.developmentCards = player.developmentCards.filter((card) => card.id !== cardId);
}

function declareWinnerIfReady(state: GameState, playerId: string): void {
  if (getVictoryPoints(state, playerId) < 10) return;
  state.winnerId = playerId;
  state.phase = "finished";
  state.activeTrade = null;
}

function getPortRatio(state: GameState, playerId: string, resource: Resource): number {
  assertResourceType(resource);
  getPlayer(state, playerId);
  let bestRatio = 4;
  for (const port of state.board.ports) {
    if (!port.vertexIds.some((vertexId) => getBuildingOwner(state, vertexId) === playerId)) {
      continue;
    }
    if (port.type === resource) bestRatio = Math.min(bestRatio, 2);
    else if (port.type === "generic") bestRatio = Math.min(bestRatio, 3);
  }
  return bestRatio;
}

function assertResourceType(value: unknown): asserts value is Resource {
  if (!(RESOURCES as readonly unknown[]).includes(value)) {
    fail("INVALID_RESOURCE", "El recurso elegido no existe.");
  }
}

export function getMaritimeTradeRatio(
  state: GameState,
  playerId: string,
  resource: Resource,
): number {
  return getPortRatio(state, playerId, resource);
}

function assertTradeBundles(give: ResourceBundle, want: ResourceBundle): void {
  validateBundle(give);
  validateBundle(want);
  if (totalResources(give) === 0 || totalResources(want) === 0) {
    fail("INVALID_TRADE", "Una oferta debe incluir recursos en ambos lados.");
  }
}

function createTradeOffer(
  state: GameState,
  fromPlayerId: string,
  give: ResourceBundle,
  want: ResourceBundle,
): void {
  const fromPlayer = getPlayer(state, fromPlayerId);
  assertTradeBundles(give, want);
  if (!hasResources(fromPlayer.resources, give)) {
    fail("TRADE_NOT_AFFORDABLE", "No tenés los recursos ofrecidos.");
  }

  state.activeTrade = {
    id: `trade-${state.nextTradeId}`,
    fromPlayerId: fromPlayer.id,
    give: { ...give },
    want: { ...want },
    acceptedBy: [],
    rejectedBy: [],
  };
  state.nextTradeId += 1;
  state.phase = "trade";
}

function requireOpenOffer(state: GameState): TradeOffer {
  const offer = state.activeTrade;
  if (!offer) fail("INVALID_TRADE", "No hay una oferta de comercio abierta.");
  return offer;
}

function respondToOffer(state: GameState, playerId: string, accepted: boolean): void {
  requirePhase(state, "trade");
  const offer = requireOpenOffer(state);
  if (offer.fromPlayerId === playerId) {
    fail("INVALID_TRADE", "No podés responder a tu propia oferta.");
  }
  const player = getPlayer(state, playerId);
  if (accepted && !hasResources(player.resources, offer.want)) {
    fail("TRADE_NOT_AFFORDABLE", "No tenés los recursos que pide la oferta.");
  }

  if (accepted) {
    if (!offer.acceptedBy.includes(playerId)) offer.acceptedBy.push(playerId);
    offer.rejectedBy = offer.rejectedBy.filter((candidate) => candidate !== playerId);
  } else {
    if (!offer.rejectedBy.includes(playerId)) offer.rejectedBy.push(playerId);
    offer.acceptedBy = offer.acceptedBy.filter((candidate) => candidate !== playerId);
  }
}

function confirmTradeOffer(state: GameState, playerId: string, partnerId: string): void {
  requirePhase(state, "trade");
  const offer = requireOpenOffer(state);
  if (offer.fromPlayerId !== playerId) {
    fail("INVALID_TRADE", "Solo quien ofertó puede cerrar el intercambio.");
  }
  if (!offer.acceptedBy.includes(partnerId)) {
    fail("INVALID_TRADE", "Ese jugador no aceptó la oferta.");
  }

  const fromPlayer = getPlayer(state, offer.fromPlayerId);
  const partner = getPlayer(state, partnerId);
  if (!hasResources(fromPlayer.resources, offer.give) || !hasResources(partner.resources, offer.want)) {
    fail("TRADE_NOT_AFFORDABLE", "Uno de los jugadores ya no tiene los recursos acordados.");
  }

  subtractResources(fromPlayer.resources, offer.give);
  addResources(partner.resources, offer.give);
  subtractResources(partner.resources, offer.want);
  addResources(fromPlayer.resources, offer.want);
  state.activeTrade = null;
  state.phase = "main";
}

function cancelTradeOffer(state: GameState, playerId: string): void {
  requirePhase(state, "trade");
  const offer = requireOpenOffer(state);
  if (offer.fromPlayerId !== playerId) {
    fail("INVALID_TRADE", "Solo quien ofertó puede cancelar el intercambio.");
  }
  state.activeTrade = null;
  state.phase = "main";
}

function checkWinnerAfterAction(state: GameState, actorId: string): void {
  if (state.phase === "finished") return;
  if (getCurrentPlayerId(state) === actorId) declareWinnerIfReady(state, actorId);
}

function placeSetupSettlement(state: GameState, playerId: string, vertexId: string): void {
  requirePhase(state, "setup-settlement");
  requireCurrentPlayer(state, playerId);
  const player = getPlayer(state, playerId);
  if (!canPlaceSettlementOnBoard(state, playerId, vertexId, false)) {
    fail("ILLEGAL_PLACEMENT", "El poblado debe respetar la regla de distancia y estar libre.");
  }
  if (player.settlements.length >= MAX_SETTLEMENTS) {
    fail("PIECE_LIMIT", "No quedan poblados disponibles.");
  }

  player.settlements.push(vertexId);
  state.setupRoadFromVertexId = vertexId;
  state.phase = "setup-road";
  recalculateAwards(state);

  if (state.setupIndex >= state.players.length) {
    distributeInitialResources(state, player, vertexId);
  }
}

function placeSetupRoad(state: GameState, playerId: string, edgeId: string): void {
  requirePhase(state, "setup-road");
  requireCurrentPlayer(state, playerId);
  const player = getPlayer(state, playerId);
  if (state.setupRoadFromVertexId === null || !canPlaceRoadOnBoard(state, playerId, edgeId, state.setupRoadFromVertexId)) {
    fail("ILLEGAL_PLACEMENT", "El camino inicial debe salir del poblado recién colocado.");
  }
  if (player.roads.length >= MAX_ROADS) fail("PIECE_LIMIT", "No quedan caminos disponibles.");

  player.roads.push(edgeId);
  recalculateAwards(state);
  advanceSetup(state);
}

function resolveDiscard(
  state: GameState,
  playerId: string,
  resources: ResourceBundle,
): void {
  requirePhase(state, "discard");
  const required = state.pendingDiscards[playerId];
  if (required === undefined) fail("INVALID_DISCARD", "Este jugador no tiene que descartar.");
  validateBundle(resources);
  if (totalResources(resources) !== required) {
    fail("INVALID_DISCARD", `Tenés que descartar exactamente ${required} cartas.`);
  }

  const player = getPlayer(state, playerId);
  if (!hasResources(player.resources, resources)) {
    fail("INVALID_DISCARD", "No podés descartar recursos que no tenés.");
  }
  subtractResources(player.resources, resources);
  addResources(state.bank, resources);
  delete state.pendingDiscards[playerId];
  if (Object.keys(state.pendingDiscards).length === 0) state.phase = "robber";
}

function rollDice(state: GameState, playerId: string, random: SeededRandom): void {
  requirePhase(state, "awaiting-roll");
  requireCurrentPlayer(state, playerId);
  const dice: [number, number] = [random.nextInt(6) + 1, random.nextInt(6) + 1];
  const total = dice[0] + dice[1];
  state.lastRoll = { dice, total };
  state.rollHistory.push(total);
  state.hasRolled = true;

  if (total !== 7) {
    produceResources(state, total);
    state.phase = "main";
    return;
  }

  state.pendingDiscards = {};
  for (const player of state.players) {
    const cardCount = totalResources(player.resources);
    if (cardCount > 7) state.pendingDiscards[player.id] = Math.floor(cardCount / 2);
  }
  state.phase = Object.keys(state.pendingDiscards).length > 0 ? "discard" : "robber";
}

function buildRoad(state: GameState, playerId: string, edgeId: string): void {
  const player = requireMainTurn(state, playerId);
  getEdge(state, edgeId);
  if (player.roads.length >= MAX_ROADS) fail("PIECE_LIMIT", "No quedan caminos disponibles.");
  if (!canAfford(player, "road")) fail("NOT_ENOUGH_RESOURCES", "Faltan recursos para construir un camino.");
  if (!canPlaceRoadOnBoard(state, playerId, edgeId)) {
    fail("ILLEGAL_PLACEMENT", "El camino debe conectarse a tu red y no puede estar ocupado.");
  }

  spendResources(state, player, "road");
  player.roads.push(edgeId);
  recalculateAwards(state);
}

function buildSettlement(state: GameState, playerId: string, vertexId: string): void {
  const player = requireMainTurn(state, playerId);
  getVertex(state, vertexId);
  if (player.settlements.length >= MAX_SETTLEMENTS) {
    fail("PIECE_LIMIT", "No quedan poblados disponibles.");
  }
  if (!canAfford(player, "settlement")) {
    fail("NOT_ENOUGH_RESOURCES", "Faltan recursos para construir un poblado.");
  }
  if (!canPlaceSettlementOnBoard(state, playerId, vertexId, true)) {
    fail("ILLEGAL_PLACEMENT", "El poblado debe conectarse a un camino y respetar la distancia.");
  }

  spendResources(state, player, "settlement");
  player.settlements.push(vertexId);
  recalculateAwards(state);
}

function buildCity(state: GameState, playerId: string, vertexId: string): void {
  const player = requireMainTurn(state, playerId);
  getVertex(state, vertexId);
  if (!player.settlements.includes(vertexId)) {
    fail("ILLEGAL_PLACEMENT", "Solo se puede mejorar uno de tus poblados.");
  }
  if (player.cities.length >= MAX_CITIES) fail("PIECE_LIMIT", "No quedan ciudades disponibles.");
  if (!canAfford(player, "city")) fail("NOT_ENOUGH_RESOURCES", "Faltan recursos para construir una ciudad.");

  spendResources(state, player, "city");
  player.settlements = player.settlements.filter((candidate) => candidate !== vertexId);
  player.cities.push(vertexId);
  recalculateAwards(state);
}

function buyDevelopmentCard(state: GameState, playerId: string): void {
  const player = requireMainTurn(state, playerId);
  if (state.developmentDeck.length === 0) fail("EMPTY_DECK", "No quedan cartas de desarrollo.");
  if (!canAfford(player, "development-card")) {
    fail("NOT_ENOUGH_RESOURCES", "Faltan recursos para comprar una carta de desarrollo.");
  }

  spendResources(state, player, "development-card");
  const card = state.developmentDeck.shift()!;
  player.developmentCards.push({ ...card, boughtOnTurn: state.turnNumber });
  player.boughtDevelopmentCards.push(card.type);
}

function playKnight(state: GameState, playerId: string, cardId: string): void {
  const player = requirePlayableTurn(state, playerId);
  const card = requireDevelopmentCard(state, player, cardId, "knight");
  discardDevelopmentCard(player, card.id);
  player.playedKnights += 1;
  state.playedDevelopmentCardThisTurn = true;
  state.activeTrade = null;
  state.pendingRobberVictim = null;
  state.phase = "robber";
  recalculateAwards(state);
}

function playMonopoly(
  state: GameState,
  playerId: string,
  cardId: string,
  resource: Resource,
): void {
  const player = requirePlayableTurn(state, playerId);
  const card = requireDevelopmentCard(state, player, cardId, "monopoly");
  assertResourceType(resource);
  for (const otherPlayer of state.players) {
    if (otherPlayer.id === playerId) continue;
    player.resources[resource] += otherPlayer.resources[resource];
    otherPlayer.resources[resource] = 0;
  }
  discardDevelopmentCard(player, card.id);
  state.playedDevelopmentCardThisTurn = true;
}

function playYearOfPlenty(
  state: GameState,
  playerId: string,
  cardId: string,
  resources: Resource[],
): void {
  const player = requirePlayableTurn(state, playerId);
  const card = requireDevelopmentCard(state, player, cardId, "year-of-plenty");
  const cardsAvailable = totalResources(state.bank);
  const expectedCards = Math.min(2, cardsAvailable);
  if (!Array.isArray(resources) || resources.length !== expectedCards || expectedCards === 0) {
    fail(
      "INVALID_CARD",
      "Año de la abundancia toma dos cartas, o todas las que queden si hay menos.",
    );
  }

  const requested = emptyResources();
  for (const resource of resources) {
    assertResourceType(resource);
    requested[resource] += 1;
  }
  if (!hasResources(state.bank, requested)) {
    fail("NO_BANK_RESOURCES", "El banco no tiene los recursos elegidos.");
  }

  subtractResources(state.bank, requested);
  addResources(player.resources, requested);
  discardDevelopmentCard(player, card.id);
  state.playedDevelopmentCardThisTurn = true;
}

function playRoadBuilding(
  state: GameState,
  playerId: string,
  cardId: string,
  edgeIds: string[],
): void {
  const player = requirePlayableTurn(state, playerId);
  const card = requireDevelopmentCard(state, player, cardId, "road-building");
  if (
    !Array.isArray(edgeIds) ||
    edgeIds.length < 1 ||
    edgeIds.length > 2 ||
    new Set(edgeIds).size !== edgeIds.length
  ) {
    fail("INVALID_CARD", "Construcción de caminos permite colocar uno o dos caminos distintos.");
  }
  if (player.roads.length + edgeIds.length > MAX_ROADS) {
    fail("PIECE_LIMIT", "No hay suficientes piezas de camino para esta carta.");
  }

  for (const edgeId of edgeIds) {
    getEdge(state, edgeId);
    if (!canPlaceRoadOnBoard(state, playerId, edgeId)) {
      fail("ILLEGAL_PLACEMENT", "Cada camino gratis debe conectarse a tu red.");
    }
    player.roads.push(edgeId);
  }

  discardDevelopmentCard(player, card.id);
  state.playedDevelopmentCardThisTurn = true;
  recalculateAwards(state);
}

export function applyAction(state: GameState, action: GameAction): GameState {
  requireActiveGame(state);
  const next = cloneGameState(state);
  const random = SeededRandom.fromState(next.rngState);
  getPlayer(next, action.playerId);

  switch (action.type) {
    case "place-setup-settlement":
      placeSetupSettlement(next, action.playerId, action.vertexId);
      break;

    case "place-setup-road":
      placeSetupRoad(next, action.playerId, action.edgeId);
      break;

    case "roll":
      rollDice(next, action.playerId, random);
      break;

    case "discard":
      resolveDiscard(next, action.playerId, action.resources);
      break;

    case "move-robber":
      requirePhase(next, "robber");
      requireCurrentPlayer(next, action.playerId);
      moveRobber(next, action.playerId, action.hexId, action.victimId, random);
      next.phase = next.pendingRobberVictim
        ? "robber-victim"
        : next.hasRolled
          ? "main"
          : "awaiting-roll";
      break;

    case "choose-robber-victim":
      chooseRobberVictim(next, action.playerId, action.victimId, random);
      next.phase = next.hasRolled ? "main" : "awaiting-roll";
      break;

    case "build-road":
      buildRoad(next, action.playerId, action.edgeId);
      break;

    case "build-settlement":
      buildSettlement(next, action.playerId, action.vertexId);
      break;

    case "build-city":
      buildCity(next, action.playerId, action.vertexId);
      break;

    case "buy-development-card":
      buyDevelopmentCard(next, action.playerId);
      break;

    case "play-knight":
      playKnight(next, action.playerId, action.cardId);
      break;

    case "play-monopoly":
      playMonopoly(next, action.playerId, action.cardId, action.resource);
      break;

    case "play-year-of-plenty":
      playYearOfPlenty(next, action.playerId, action.cardId, action.resources);
      break;

    case "play-road-building":
      playRoadBuilding(next, action.playerId, action.cardId, action.edgeIds);
      break;

    case "make-offer":
      requireMainTurn(next, action.playerId);
      createTradeOffer(next, action.playerId, action.give, action.want);
      break;

    case "counter-offer": {
      requirePhase(next, "trade");
      const previousOffer = next.activeTrade;
      if (!previousOffer) fail("INVALID_TRADE", "No hay una oferta de comercio abierta.");
      if (previousOffer.fromPlayerId === action.playerId) {
        fail("INVALID_TRADE", "No podés contraofertar tu propia oferta.");
      }
      createTradeOffer(next, action.playerId, action.give, action.want);
      break;
    }

    case "accept-offer":
      respondToOffer(next, action.playerId, true);
      break;

    case "reject-offer":
      respondToOffer(next, action.playerId, false);
      break;

    case "confirm-offer":
      confirmTradeOffer(next, action.playerId, action.partnerId);
      break;

    case "cancel-offer":
      cancelTradeOffer(next, action.playerId);
      break;

    case "maritime-trade": {
      const player = requireMainTurn(next, action.playerId);
      assertResourceType(action.giveResource);
      assertResourceType(action.receiveResource);
      if (action.giveResource === action.receiveResource) {
        fail("INVALID_TRADE", "El intercambio marítimo necesita dos recursos distintos.");
      }
      if (!Number.isInteger(action.giveAmount) || action.giveAmount <= 0) {
        fail("INVALID_TRADE", "La cantidad ofrecida debe ser un entero positivo.");
      }
      const ratio = getPortRatio(next, action.playerId, action.giveResource);
      if (action.giveAmount % ratio !== 0) {
        fail("INVALID_TRADE", `La cantidad debe ser múltiplo de ${ratio}:1.`);
      }
      const receiveAmount = action.giveAmount / ratio;
      if (player.resources[action.giveResource] < action.giveAmount) {
        fail("NOT_ENOUGH_RESOURCES", "No tenés suficientes recursos para el intercambio.");
      }
      if (next.bank[action.receiveResource] < receiveAmount) {
        fail("NO_BANK_RESOURCES", "El banco no tiene suficientes recursos para el intercambio.");
      }
      player.resources[action.giveResource] -= action.giveAmount;
      next.bank[action.giveResource] += action.giveAmount;
      next.bank[action.receiveResource] -= receiveAmount;
      player.resources[action.receiveResource] += receiveAmount;
      break;
    }

    case "end-turn": {
      requirePhase(next, "main", "trade");
      requireCurrentPlayer(next, action.playerId);
      declareWinnerIfReady(next, action.playerId);
      if (next.winnerId) break;
      next.currentPlayerIndex = (next.currentPlayerIndex + 1) % next.players.length;
      next.turnNumber += 1;
      next.phase = "awaiting-roll";
      next.hasRolled = false;
      next.playedDevelopmentCardThisTurn = false;
      next.activeTrade = null;
      next.pendingRobberVictim = null;
      break;
    }

    default: {
      const exhaustiveCheck: never = action;
      return exhaustiveCheck;
    }
  }

  next.rngState = random.state;
  checkWinnerAfterAction(next, action.playerId);
  return next;
}
