import { useReducer } from 'react';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  provider?: string;
  routingMode?: string | null;
  tokensUsed?: number | null;
  isCompact?: boolean;
  sentAt?: string; // ISO timestamp
};

export type ChatState = {
  messages: ChatMessage[];
  conversationId: string | null;
  isSending: boolean;
  chatError: string;
};

type ChatAction =
  | { type: 'ADD_USER_MESSAGE'; content: string }
  | { type: 'ADD_ASSISTANT_PLACEHOLDER' }
  | { type: 'APPEND_ASSISTANT_CHUNK'; delta: string }
  | { type: 'FINALIZE_ASSISTANT'; content: string; model: string; provider: string; routingMode: string | null; tokensUsed: number; conversationId: string }
  | { type: 'SET_SENDING'; value: boolean }
  | { type: 'SET_ERROR'; message: string }
  | { type: 'CLEAR_ERROR' }
  | { type: 'ROLLBACK_OPTIMISTIC' }
  | { type: 'LOAD_HISTORY'; messages: ChatMessage[]; conversationId: string }
  | { type: 'COMPACT_HISTORY'; summary: string; keepLast: number }
  | { type: 'FORK_AT'; beforeIndex: number }
  | { type: 'RESET' };

const initialState: ChatState = {
  messages: [],
  conversationId: null,
  isSending: false,
  chatError: '',
};

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'ADD_USER_MESSAGE':
      return { ...state, messages: [...state.messages, { role: 'user', content: action.content, sentAt: new Date().toISOString() }], chatError: '' };

    case 'ADD_ASSISTANT_PLACEHOLDER':
      return { ...state, messages: [...state.messages, { role: 'assistant', content: '' }] };

    case 'APPEND_ASSISTANT_CHUNK': {
      const updated = [...state.messages];
      const last = updated[updated.length - 1];
      if (last?.role === 'assistant') {
        updated[updated.length - 1] = { ...last, content: last.content + action.delta };
      }
      return { ...state, messages: updated };
    }

    case 'FINALIZE_ASSISTANT': {
      const updated = [...state.messages];
      const last = updated[updated.length - 1];
      if (last?.role === 'assistant') {
        updated[updated.length - 1] = {
          ...last,
          content: action.content,
          model: action.model,
          provider: action.provider,
          routingMode: action.routingMode,
          tokensUsed: action.tokensUsed,
          sentAt: new Date().toISOString(),
        };
      }
      return { ...state, messages: updated, conversationId: action.conversationId };
    }

    case 'SET_SENDING':
      return { ...state, isSending: action.value };

    case 'SET_ERROR':
      return { ...state, chatError: action.message };

    case 'CLEAR_ERROR':
      return { ...state, chatError: '' };

    case 'ROLLBACK_OPTIMISTIC': {
      // Remove partial assistant bubble and the preceding user message
      const trimmed = [...state.messages];
      while (trimmed.length > 0 && trimmed[trimmed.length - 1].role === 'assistant' && !trimmed[trimmed.length - 1].model) {
        trimmed.pop();
      }
      if (trimmed.length > 0 && trimmed[trimmed.length - 1].role === 'user') {
        trimmed.pop();
      }
      return { ...state, messages: trimmed };
    }

    case 'LOAD_HISTORY':
      return { ...state, messages: action.messages, conversationId: action.conversationId };

    case 'COMPACT_HISTORY': {
      const kept = state.messages.slice(-action.keepLast);
      const summaryMessages: ChatMessage[] = [
        { role: 'user', content: `[Context from earlier in this conversation]: ${action.summary}`, isCompact: true },
        { role: 'assistant', content: 'Understood, continuing from the summary.', isCompact: true },
      ];
      return { ...state, messages: [...summaryMessages, ...kept] };
    }

    case 'FORK_AT':
      return { ...state, messages: state.messages.slice(0, action.beforeIndex), conversationId: null };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

export function useChatReducer() {
  return useReducer(chatReducer, initialState);
}
