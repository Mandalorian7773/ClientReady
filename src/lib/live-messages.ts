/** Why live calls are unavailable. Shared by the server gate and the UI so both say the same, true thing. */
export type LiveReason = "paused" | "daily_limit" | "visitor_limit";

export function liveBlockedMessage(reason: LiveReason, perVisitor?: number): string {
  switch (reason) {
    case "paused":
      return "Live calls are paused for today to protect API credits. You can still hear the full sample call.";
    case "daily_limit":
      return "Today's live calls are used up, to protect API credits. They reset at midnight IST. You can still hear the full sample call.";
    case "visitor_limit":
      return `You've used today's ${perVisitor ? `${perVisitor} ` : ""}live calls. They reset at midnight IST. You can still hear the full sample call.`;
  }
}
