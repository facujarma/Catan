import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "limpiar presencia inactiva",
  { seconds: 15 },
  internal.rooms.cleanupPresence,
  {},
);

export default crons;
