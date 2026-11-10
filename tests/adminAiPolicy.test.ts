import assert from 'node:assert/strict';
import test from 'node:test';
import { isAdminAiActionExplicitlyRequested } from '../src/services/adminAiPolicy.ts';

test('routine operations require an explicit positive instruction', () => {
  assert.equal(isAdminAiActionExplicitlyRequested('Answer the pending user question.', 'answer_question'), true);
  assert.equal(isAdminAiActionExplicitlyRequested('Lock this conversation.', 'lock_conversation'), true);
  assert.equal(isAdminAiActionExplicitlyRequested('Approve this song for Crossy Road games.', 'game_approval'), true);
  assert.equal(isAdminAiActionExplicitlyRequested('Dismiss safety flag chatflag_123.', 'dismiss_safety_flag'), true);
});

test('high-impact actions are recognized for the approval queue', () => {
  assert.equal(isAdminAiActionExplicitlyRequested('Approve this member account.', 'approve_user'), true);
  assert.equal(isAdminAiActionExplicitlyRequested('Suspend this user account.', 'ban_user'), true);
  assert.equal(isAdminAiActionExplicitlyRequested('Unlock this conversation.', 'unlock_conversation'), true);
});

test('inspection or general discussion does not authorize an action', () => {
  assert.equal(isAdminAiActionExplicitlyRequested('Show me the open user questions.', 'answer_question'), false);
  assert.equal(isAdminAiActionExplicitlyRequested('What is wrong with this conversation?', 'lock_conversation'), false);
  assert.equal(isAdminAiActionExplicitlyRequested('Tell me about the game approval process.', 'game_approval'), false);
});

test('negative instructions never execute an action', () => {
  assert.equal(isAdminAiActionExplicitlyRequested('Do not answer the question.', 'answer_question'), false);
  assert.equal(isAdminAiActionExplicitlyRequested('Do not lock this conversation.', 'lock_conversation'), false);
  assert.equal(isAdminAiActionExplicitlyRequested('Never dismiss safety flags.', 'dismiss_safety_flag'), false);
  assert.equal(isAdminAiActionExplicitlyRequested('Do not suspend this user.', 'ban_user'), false);
  assert.equal(isAdminAiActionExplicitlyRequested("I won't lock this conversation.", 'lock_conversation'), false);
  assert.equal(isAdminAiActionExplicitlyRequested("You must not dismiss this flag.", 'dismiss_safety_flag'), false);
});

test('unknown action types are never considered explicitly authorized', () => {
  assert.equal(isAdminAiActionExplicitlyRequested('Do the thing.', 'delete_database'), false);
  assert.equal(isAdminAiActionExplicitlyRequested('', 'lock_conversation'), false);
});
