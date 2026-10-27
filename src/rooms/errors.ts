// Network/gateway errors can lose a committed response. Preserve the request ID
// unless a database/API rejection confirms that this call was rejected.
export function isDefinitiveFailure(error: unknown): boolean {
  if (
    !error ||
    typeof error !== "object" ||
    !("code" in error) ||
    typeof error.code !== "string"
  )
    return false;
  return /^[0-9A-Z]{5}$/.test(error.code) || /^PGRST\d{3}$/.test(error.code);
}

export function friendlyError(
  error: unknown,
  online = typeof navigator === "undefined" || navigator.onLine !== false,
): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : String(error);
  if (message.includes("ROOM_NOT_FOUND"))
    return "That room code was not found. Check the six-character code with your host.";
  if (message.includes("COMPETITION_MIGRATION_REQUIRED"))
    return "Apply the Phase IV migration (202610270003_competition.sql) in Supabase SQL Editor, then retry.";
  if (message.includes("PENDING_COMPETITION_ACTION"))
    return "Resolve the saved action with “Retry saved action” before making another change. It will not be counted twice.";
  if (message.includes("WAIT_FOR_SYNC"))
    return "Wait for the live room to finish updating, then try again.";
  if (message.includes("MATCH_ENDED"))
    return "This match has ended. Final scores are read-only. The host can start a new match.";
  if (message.includes("MATCH_STILL_ACTIVE"))
    return "End the active match before starting another.";
  if (message.includes("STALE_MATCH"))
    return "The match changed. Your action was not applied to the new match. Review the current dashboard.";
  if (message.includes("TEAM_NAME_TAKEN"))
    return "That team name is already in use in this room.";
  if (message.includes("INVALID_TEAM_NAME"))
    return "Enter a team name between 1 and 32 characters.";
  if (message.includes("TEAM_NOT_EMPTY"))
    return "Reassign every player on this team before removing it.";
  if (message.includes("TEAM_HAS_SCORE"))
    return "A team with points cannot be removed during this match. Keep it for the final standings.";
  if (
    message.includes("TEAM_NOT_FOUND") ||
    message.includes("PLAYER_NOT_FOUND")
  )
    return "That team or player is no longer available. Refresh the room and try again.";
  if (message.includes("INVALID_SCORE"))
    return "Use a nonzero whole-number adjustment between −10,000 and +10,000.";
  if (message.includes("SCORE_LIMIT"))
    return "This adjustment would exceed the supported score range (−1 billion to +1 billion).";
  if (message.includes("REQUEST_CONFLICT"))
    return "This saved request does not match the original action. Refresh the room before continuing.";
  if (message.includes("INVALID_COMPETITION_INPUT"))
    return "Check the team, player, and whole-number values, then try again.";
  if (message.includes("ROOM_CLOSED"))
    return "This room is not accepting new players. Ask your host to reopen joining.";
  if (message.includes("BUZZER_MIGRATION_REQUIRED"))
    return "The Phase III buzzer migration is required. Apply supabase/migrations/202610270002_quiz_buzzer.sql in the Supabase SQL Editor, then retry.";
  if (message.includes("STALE_ROUND"))
    return "The round changed before this action arrived. The latest state is being refreshed; review it before trying again.";
  if (message.includes("ROUND_LOCKED"))
    return "A player has already buzzed first. Start the next question to clear the winner.";
  if (message.includes("HOST_UNAUTHORIZED"))
    return "Host authorization failed. Only the original host session can change this room.";
  if (
    message.includes("NOT_A_MEMBER") ||
    message.includes("AUTH_REQUIRED") ||
    /JWT|refresh.token|session.*expired/i.test(message)
  )
    return "Your room session is no longer authorized. Return to the overview to join again. Host access requires the original browser session.";
  if (message.includes("INVALID_INPUT"))
    return "Enter a six-character room code, a name (1–40 characters), and a team name (1–32 characters).";
  if (/rate.limit|too many requests/i.test(message))
    return "Too many new sessions from this network. Wait a little and try again, or ask your host for help.";
  if (/anonymous.*(disabled|not allowed)/i.test(message))
    return "Guest sessions are disabled in Supabase. Enable Anonymous Sign-Ins in the project Auth settings.";
  if (
    /function.*(not find|not exist)|schema cache|relation.*not exist/i.test(
      message,
    )
  )
    return "The Supabase room migration is missing or unavailable. Apply the SQL migration in supabase/migrations, then retry.";
  if (
    message.includes("Live rooms need") ||
    message.includes("Supabase configuration")
  )
    return message;
  if (!online || /fetch|network|timeout|abort|load failed/i.test(message))
    return "Connection interrupted. Check your internet connection and retry. Your saved room session will be reused.";
  return "We could not complete that room request. Please retry. If it continues, ask the host to check the Supabase setup.";
}
