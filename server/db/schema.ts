import { sqliteTable, text, integer, unique, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Users table
export const users = sqliteTable('users', {
  id: text('id').primaryKey().notNull(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  photoURL: text('photo_url'),
  lastLogin: text('last_login'),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

// API Keys table
export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey().notNull(),
  uid: text('uid').notNull(),
  provider: text('provider').notNull(),
  encryptedKey: text('encrypted_key').notNull(),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
}, (t) => ({
  uidProviderUnique: unique().on(t.uid, t.provider),
}));

// Chat History table
export const history = sqliteTable('history', {
  id: text('id').primaryKey().notNull(),
  uid: text('uid').notNull(),
  prompt: text('prompt').notNull(),
  response: text('response').notNull(),
  model: text('model').notNull(),
  provider: text('provider'),
  tokensUsed: integer('tokens_used'),
  status: text('status').default('completed'),
  conversationId: text('conversation_id'),
  projectId: text('project_id'),
  isArchived: integer('is_archived', { mode: 'boolean' }).default(false),
  timestamp: text('timestamp').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
}, (t) => ({
  uidIdx: index('history_uid_idx').on(t.uid),
  uidTimestampIdx: index('history_uid_timestamp_idx').on(t.uid, t.timestamp),
}));

// Facts/Memory table
export const facts = sqliteTable('facts', {
  id: text('id').primaryKey().notNull(),
  uid: text('uid').notNull(),
  botId: text('bot_id'),
  content: text('content').notNull(),
  isSkill: integer('is_skill', { mode: 'boolean' }).default(false),
  timestamp: text('timestamp').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
}, (t) => ({
  botIdIdx: index('facts_bot_id_idx').on(t.botId),
}));

// Memory Files table
export const memoryFiles = sqliteTable('memory_files', {
  id: text('id').primaryKey().notNull(),
  uid: text('uid').notNull(),
  name: text('name').notNull(),
  content: text('content').notNull(),
  type: text('type'),
  size: integer('size'),
  isSkill: integer('is_skill', { mode: 'boolean' }).default(false),
  timestamp: text('timestamp').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

// Memory URLs table
export const memoryUrls = sqliteTable('memory_urls', {
  id: text('id').primaryKey().notNull(),
  uid: text('uid').notNull(),
  url: text('url').notNull(),
  title: text('title'),
  timestamp: text('timestamp').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

// Settings table
export const settings = sqliteTable('settings', {
  uid: text('uid').primaryKey().notNull(),
  localUrl: text('local_url'),
  useMemory: integer('use_memory', { mode: 'boolean' }).default(true),
  autoMemory: integer('auto_memory', { mode: 'boolean' }).default(true),
  sandboxMode: integer('sandbox_mode', { mode: 'boolean' }).default(false),
  historyRetentionDays: integer('history_retention_days'),
  updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const appSettings = sqliteTable('app_settings', {
  id: text('id').primaryKey().notNull(),
  telegramBotToken: text('telegram_bot_token'),
  telegramBotEnabled: integer('telegram_bot_enabled', { mode: 'boolean' }).default(true),
  telegramAllowedChatIds: text('telegram_allowed_chat_ids'),
  telegramProvider: text('telegram_provider'),
  telegramModel: text('telegram_model'),
  telegramDigestEnabled: integer('telegram_digest_enabled', { mode: 'boolean' }).default(false),
  telegramDigestHour: integer('telegram_digest_hour').default(9),
  telegramDigestLastSent: text('telegram_digest_last_sent'),
  updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

// User Settings table — JSON columns stored as text in SQLite
export const userSettings = sqliteTable('user_settings', {
  uid: text('uid').primaryKey().notNull(),
  systemPrompt: text('system_prompt'),
  customSkills: text('custom_skills'),             // JSON string
  customBots: text('custom_bots'),                 // JSON string
  conversationLabels: text('conversation_labels'), // JSON string
  conversationModels: text('conversation_models'), // JSON string
  pinnedConversations: text('pinned_conversations'), // JSON string
  promptTemplates: text('prompt_templates'),          // JSON string
  updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const agentDefinitions = sqliteTable('agent_definitions', {
  id: text('id').primaryKey().notNull(),
  uid: text('uid').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  command: text('command').notNull(),
  useWhen: text('use_when').notNull(),
  boundaries: text('boundaries').notNull(),
  systemPrompt: text('system_prompt').notNull(),
  starterPrompt: text('starter_prompt').notNull(),
  provider: text('provider'),
  model: text('model'),
  memoryMode: text('memory_mode').default('shared'),
  executorType: text('executor_type').notNull().default('internal-llm'),
  endpoint: text('endpoint'),
  config: text('config'),                          // JSON string
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
}, (table) => ({
  uidCommandUnique: unique('agent_definitions_uid_command_unique').on(table.uid, table.command),
}));

export const dailyUsage = sqliteTable('daily_usage', {
  id: text('id').primaryKey().notNull(),
  uid: text('uid').notNull(),
  date: text('date').notNull(),
  tokens: integer('tokens').default(0),
  modelUsage: text('model_usage').default('{}'), // JSON string
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

// Projects table
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey().notNull(),
  uid: text('uid').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  systemPrompt: text('system_prompt'),
  color: text('color').default('stone'),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
}, (t) => ({
  uidIdx: index('projects_uid_idx').on(t.uid),
}));

// Rate limit hits table (SQLite-backed persistent store)
export const rateLimitHits = sqliteTable('rate_limit_hits', {
  key: text('key').primaryKey().notNull(),
  hits: integer('hits').notNull().default(0),
  resetAt: text('reset_at').notNull(),
});

// RAG documents — uploaded files chunked and embedded for retrieval
export const ragDocuments = sqliteTable('rag_documents', {
  id: text('id').primaryKey().notNull(),
  uid: text('uid').notNull(),
  name: text('name').notNull(),
  chunkIndex: integer('chunk_index').notNull().default(0),
  chunkText: text('chunk_text').notNull(),
  embedding: text('embedding').notNull(), // JSON float array
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
}, (t) => ({
  uidIdx: index('rag_documents_uid_idx').on(t.uid),
}));

// Conversation shares — read-only public share links
export const conversationShares = sqliteTable('conversation_shares', {
  id: text('id').primaryKey().notNull(),
  uid: text('uid').notNull(),           // owner
  conversationId: text('conversation_id').notNull(),
  token: text('token').notNull().unique(),
  title: text('title'),                 // optional display title
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  expiresAt: text('expires_at'),        // null = no expiry
}, (t) => ({
  tokenIdx: index('shares_token_idx').on(t.token),
  uidIdx: index('shares_uid_idx').on(t.uid),
}));

