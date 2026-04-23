import { useReducer } from 'react';
import type { AgentExecutorType, ToolDefinition } from '../../shared/agentDefinitions';
export type { ToolDefinition };

// ---------------------------------------------------------------------------
// New Skill form
// ---------------------------------------------------------------------------
export type SkillFormState = {
  title: string;
  description: string;
  command: string;
  useWhen: string;
  boundaries: string;
  systemPrompt: string;
};

const initialSkillFormState: SkillFormState = {
  title: '',
  description: '',
  command: '',
  useWhen: '',
  boundaries: '',
  systemPrompt: '',
};

type SkillFormAction =
  | { type: 'PATCH'; payload: Partial<SkillFormState> }
  | { type: 'RESET' };

function skillFormReducer(state: SkillFormState, action: SkillFormAction): SkillFormState {
  if (action.type === 'RESET') return initialSkillFormState;
  return { ...state, ...action.payload };
}

export function useSkillFormReducer() {
  const [state, dispatch] = useReducer(skillFormReducer, initialSkillFormState);
  const patch = (payload: Partial<SkillFormState>) => dispatch({ type: 'PATCH', payload });
  const reset = () => dispatch({ type: 'RESET' });
  return { state, patch, reset } as const;
}

// ---------------------------------------------------------------------------
// New / Edit Bot form (shared shape)
// ---------------------------------------------------------------------------
export type BotFormState = {
  id: string;
  title: string;
  description: string;
  command: string;
  useWhen: string;
  boundaries: string;
  provider: string;
  model: string;
  memoryMode: 'shared' | 'isolated' | 'none';
  executorType: AgentExecutorType;
  endpoint: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  maxTurns: string;
};

const initialBotFormState: BotFormState = {
  id: '',
  title: '',
  description: '',
  command: '',
  useWhen: '',
  boundaries: '',
  provider: '',
  model: '',
  memoryMode: 'shared',
  executorType: 'internal-llm',
  endpoint: '',
  systemPrompt: '',
  tools: [],
  maxTurns: '',
};

type BotFormAction =
  | { type: 'PATCH'; payload: Partial<BotFormState> }
  | { type: 'RESET' }
  | { type: 'LOAD'; payload: BotFormState };

function botFormReducer(state: BotFormState, action: BotFormAction): BotFormState {
  if (action.type === 'RESET') return initialBotFormState;
  if (action.type === 'LOAD') return { ...initialBotFormState, ...action.payload };
  return { ...state, ...action.payload };
}

export function useNewBotFormReducer() {
  const [state, dispatch] = useReducer(botFormReducer, initialBotFormState);
  const patch = (payload: Partial<BotFormState>) => dispatch({ type: 'PATCH', payload });
  const reset = () => dispatch({ type: 'RESET' });
  return { state, patch, reset } as const;
}

export function useBotEditorReducer() {
  const [state, dispatch] = useReducer(botFormReducer, initialBotFormState);
  const patch = (payload: Partial<BotFormState>) => dispatch({ type: 'PATCH', payload });
  const reset = () => dispatch({ type: 'RESET' });
  const load = (payload: BotFormState) => dispatch({ type: 'LOAD', payload });
  return { state, patch, reset, load } as const;
}
