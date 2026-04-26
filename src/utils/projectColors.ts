// ---------------------------------------------------------------------------
// Project color utilities — shared between App.tsx and panel components
// ---------------------------------------------------------------------------

export const PROJECT_COLOR_PRESETS = ['stone', 'red', 'amber', 'green', 'blue', 'violet', 'pink', 'cyan'] as const;
export type ProjectColor = typeof PROJECT_COLOR_PRESETS[number];

const PROJECT_DOT_CLASSES: Record<string, string> = {
  stone: 'bg-stone-400',
  red: 'bg-red-400',
  amber: 'bg-amber-400',
  green: 'bg-green-400',
  blue: 'bg-blue-400',
  violet: 'bg-violet-400',
  pink: 'bg-pink-400',
  cyan: 'bg-cyan-400',
};

const PROJECT_ACTIVE_PILL_DARK: Record<string, string> = {
  stone: 'bg-stone-500/20 text-stone-200 ring-1 ring-stone-400/40',
  red: 'bg-red-500/20 text-red-300 ring-1 ring-red-500/40',
  amber: 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40',
  green: 'bg-green-500/20 text-green-300 ring-1 ring-green-500/40',
  blue: 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/40',
  violet: 'bg-violet-500/20 text-violet-300 ring-1 ring-violet-500/40',
  pink: 'bg-pink-500/20 text-pink-300 ring-1 ring-pink-500/40',
  cyan: 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/40',
};

const PROJECT_ACTIVE_PILL_LIGHT: Record<string, string> = {
  stone: 'bg-stone-200 text-stone-800 ring-1 ring-stone-400',
  red: 'bg-red-100 text-red-800 ring-1 ring-red-300',
  amber: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  green: 'bg-green-100 text-green-800 ring-1 ring-green-300',
  blue: 'bg-blue-100 text-blue-800 ring-1 ring-blue-300',
  violet: 'bg-violet-100 text-violet-800 ring-1 ring-violet-300',
  pink: 'bg-pink-100 text-pink-800 ring-1 ring-pink-300',
  cyan: 'bg-cyan-100 text-cyan-800 ring-1 ring-cyan-300',
};

const PROJECT_BADGE_TEXT_DARK: Record<string, string> = {
  stone: 'text-stone-400',
  red: 'text-red-400',
  amber: 'text-amber-400',
  green: 'text-green-400',
  blue: 'text-blue-400',
  violet: 'text-violet-400',
  pink: 'text-pink-400',
  cyan: 'text-cyan-400',
};

const PROJECT_BADGE_TEXT_LIGHT: Record<string, string> = {
  stone: 'text-stone-600',
  red: 'text-red-700',
  amber: 'text-amber-700',
  green: 'text-green-700',
  blue: 'text-blue-700',
  violet: 'text-violet-700',
  pink: 'text-pink-700',
  cyan: 'text-cyan-700',
};

export function getProjectActivePill(color: string | null | undefined, dark: boolean) {
  const c = (color || 'stone') as ProjectColor;
  return (dark ? PROJECT_ACTIVE_PILL_DARK : PROJECT_ACTIVE_PILL_LIGHT)[c] ?? (dark ? PROJECT_ACTIVE_PILL_DARK.stone : PROJECT_ACTIVE_PILL_LIGHT.stone);
}

export function getProjectDotClass(color: string | null | undefined) {
  return PROJECT_DOT_CLASSES[(color || 'stone') as ProjectColor] ?? PROJECT_DOT_CLASSES.stone;
}

export function getProjectBadgeClass(color: string | null | undefined, dark: boolean) {
  const c = (color || 'stone') as ProjectColor;
  return (dark ? PROJECT_BADGE_TEXT_DARK : PROJECT_BADGE_TEXT_LIGHT)[c] ?? (dark ? PROJECT_BADGE_TEXT_DARK.stone : PROJECT_BADGE_TEXT_LIGHT.stone);
}
