import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, unique, index } from 'drizzle-orm/pg-core';

// Users table
export const users = pgTable('users', {
  id: text('id').primaryKey().notNull(),
  uid: varchar('uid', { length: 255 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull(),
  displayName: varchar('display_name', { length: 255 }),
  photoURL: text('photo_url'),
  lastLogin: timestamp('last_login'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// API Keys table
export const apiKeys = pgTable('api_keys', {
  id: text('id').primaryKey().notNull(),
  uid: varchar('uid', { length: 255 }).notNull(),
  provider: varchar('provider', { length: 100 }).notNull(),
  encryptedKey: text('encrypted_key').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  uidProviderUnique: unique().on(t.uid, t.provider),
}));

// Chat History table
export const history = pgTable('history', {
  id: text('id').primaryKey().notNull(),
  uid: varchar('uid', { length: 255 }).notNull(),
  prompt: text('prompt').notNull(),
  response: text('response').notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  provider: varchar('provider', { length: 100 }),
  tokensUsed: integer('tokens_used'),
  status: varchar('status', { length: 50 }).default('completed'),
  conversationId: text('conversation_id'),
  isArchived: boolean('is_archived').default(false),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

// Facts/Memory table
export const facts = pgTable('facts', {
  id: text('id').primaryKey().notNull(),
  uid: varchar('uid', { length: 255 }).notNull(),
  botId: text('bot_id'),
  content: text('content').notNull(),
  isSkill: boolean('is_skill').default(false),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
}, (t) => ({
  botIdIdx: index('facts_bot_id_idx').on(t.botId),
}));

// Memory Files table
export const memoryFiles = pgTable('memory_files', {
  id: text('id').primaryKey().notNull(),
  uid: varchar('uid', { length: 255 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  content: text('content').notNull(),
  type: varchar('type', { length: 50 }),
  size: integer('size'),
  isSkill: boolean('is_skill').default(false),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

// Memory URLs table
export const memoryUrls = pgTable('memory_urls', {
  id: text('id').primaryKey().notNull(),
  uid: varchar('uid', { length: 255 }).notNull(),
  url: text('url').notNull(),
  title: varchar('title', { length: 255 }),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

// Settings table
export const settings = pgTable('settings', {
  uid: varchar('uid', { length: 255 }).primaryKey().notNull(),
  localUrl: text('local_url'),
  useMemory: boolean('use_memory').default(true),
  autoMemory: boolean('auto_memory').default(true),
  sandboxMode: boolean('sandbox_mode').default(false),
  historyRetentionDays: integer('history_retention_days'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const appSettings = pgTable('app_settings', {
  id: varchar('id', { length: 64 }).primaryKey().notNull(),
  telegramBotToken: text('telegram_bot_token'),
  telegramBotEnabled: boolean('telegram_bot_enabled').default(true),
  telegramAllowedChatIds: text('telegram_allowed_chat_ids'),
  telegramProvider: varchar('telegram_provider', { length: 100 }),
  telegramModel: varchar('telegram_model', { length: 255 }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// User Settings table
export const userSettings = pgTable('user_settings', {
  uid: varchar('uid', { length: 255 }).primaryKey().notNull(),
  systemPrompt: text('system_prompt'),
  customSkills: jsonb('custom_skills'),
  customBots: jsonb('custom_bots'),
  conversationLabels: jsonb('conversation_labels'),
  conversationModels: jsonb('conversation_models'),
  pinnedConversations: jsonb('pinned_conversations'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const agentDefinitions = pgTable('agent_definitions', {
  id: text('id').primaryKey().notNull(),
  uid: varchar('uid', { length: 255 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description').notNull(),
  command: varchar('command', { length: 100 }).notNull(),
  useWhen: text('use_when').notNull(),
  boundaries: text('boundaries').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  starterPrompt: text('starter_prompt').notNull(),
  provider: varchar('provider', { length: 100 }),
  model: varchar('model', { length: 255 }),
  memoryMode: varchar('memory_mode', { length: 20 }).default('shared'),
  executorType: varchar('executor_type', { length: 64 }).default('internal-llm').notNull(),
  endpoint: text('endpoint'),
  config: jsonb('config'),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  uidCommandUnique: unique('agent_definitions_uid_command_unique').on(table.uid, table.command),
}));

// Daily Usage table
export const dailyUsage = pgTable('daily_usage', {
  id: text('id').primaryKey().notNull(),
  uid: varchar('uid', { length: 255 }).notNull(),
  date: timestamp('date').notNull(),
  tokens: integer('tokens').default(0),
  modelUsage: jsonb('model_usage'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
