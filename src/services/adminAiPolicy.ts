export type AdminAiActionType =
  | 'answer_question'
  | 'lock_conversation'
  | 'unlock_conversation'
  | 'ban_user'
  | 'approve_user'
  | 'game_approval'
  | 'dismiss_safety_flag';

/**
 * A model proposal is executable only when the administrator's latest message
 * contains an unambiguous positive instruction for that exact operation.
 * Any negation disables autonomous execution; false negatives are safer than
 * acting on ambiguous instructions.
 */
export function isAdminAiActionExplicitlyRequested(message: string, type: AdminAiActionType | string): boolean {
  const text = String(message || '').toLowerCase();
  if (!text.trim()) return false;
  if (/\b(don't|do not|never|without|avoid|not|no need to|don't want to)\b/.test(text)) return false;
  const has = (pattern: RegExp) => pattern.test(text);
  if (type === 'answer_question') {
    return has(/\b(answer|reply|respond|send)\b/) && has(/\b(question|request|message)\b/);
  }
  if (type === 'lock_conversation') {
    return has(/\b(lock|close)\b/) && has(/\b(conversation|thread|chat)\b/);
  }
  if (type === 'unlock_conversation') {
    return has(/\b(unlock|reopen)\b/) && has(/\b(conversation|thread|chat)\b/);
  }
  if (type === 'ban_user') {
    return has(/\b(suspend|ban|unban|unsuspend|reinstate)\b/) && has(/\b(user|member|account)\b|@[a-z0-9_.-]+/);
  }
  if (type === 'approve_user') {
    return has(/\b(approve|accept)\b/) && has(/\b(member|user|account|application)\b/);
  }
  if (type === 'game_approval') {
    return has(/\b(approve|unapprove|enable|disable|remove|revoke)\b/) && has(/\b(game|games|arcade|crossy|rhythm|playable)\b/);
  }
  if (type === 'dismiss_safety_flag') {
    return has(/\b(dismiss|clear|resolve|close)\b/) && has(/\b(flag|flags|safety)\b/);
  }
  return false;
}
