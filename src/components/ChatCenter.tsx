import React, { useEffect, useState } from 'react';
import { Bot, MessageSquare, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ChatHub } from './ChatHub';
import { LegacyChatHub } from './LegacyChatHub';
import { AIStudio } from './AIStudio';
import { YouTubeSafetyReview } from './YouTubeSafetyReview';

type ChatPanel = 'messages' | 'assistant' | 'safety';

const tabClass = (active: boolean) => 'inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition ' +
  (active ? 'bg-cyan-200 text-slate-950 shadow-lg shadow-cyan-950/20' : 'border border-white/10 bg-white/[.04] text-slate-300 hover:bg-white/[.08] hover:text-white');

export const ChatCenter: React.FC<{ openAIRequestId?: number; onAIRequestHandled?: () => void }> = ({ openAIRequestId = 0, onAIRequestHandled }) => {
  const { currentUser, isAdmin } = useAuth();
  const [panel, setPanel] = useState<ChatPanel>('messages');
  const aiEnabled = isAdmin || currentUser?.aiBetaEnabled === true;
  const designBeta = isAdmin || currentUser?.redesignBetaEnabled === true;

  useEffect(() => {
    if (panel === 'assistant' && !aiEnabled) setPanel('messages');
    if (panel === 'safety' && !isAdmin) setPanel('messages');
  }, [panel, aiEnabled, isAdmin]);

  useEffect(() => {
    if (openAIRequestId > 0) {
      if (aiEnabled) setPanel('assistant');
      onAIRequestHandled?.();
    }
  }, [openAIRequestId, aiEnabled, onAIRequestHandled]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 pb-28">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/75 p-2 shadow-lg">
        <button type="button" className={tabClass(panel === 'messages')} onClick={() => setPanel('messages')} aria-pressed={panel === 'messages'}>
          <MessageSquare className="h-4 w-4" /> Messages
        </button>
        {aiEnabled && (
          <button type="button" className={tabClass(panel === 'assistant')} onClick={() => setPanel('assistant')} aria-pressed={panel === 'assistant'}>
            <Bot className="h-4 w-4" /> YouSound AI
          </button>
        )}
        {isAdmin && (
          <button type="button" className={tabClass(panel === 'safety')} onClick={() => setPanel('safety')} aria-pressed={panel === 'safety'}>
            <ShieldCheck className="h-4 w-4" /> YouTube safety
          </button>
        )}
      </div>

      {panel === 'messages' && (designBeta ? <ChatHub /> : <LegacyChatHub />)}
      {panel === 'assistant' && aiEnabled && <AIStudio />}
      {panel === 'safety' && isAdmin && <YouTubeSafetyReview />}
    </div>
  );
};
