import { pgTable, text, varchar, integer, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';

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
});

// Chat History table
export const history = pgTable('history', {
  id: text('id').primaryKey().notNull(),
  uid: varchar('uid', { length: 255 }).notNull(),
  prompt: text('prompt').notNull(),
  response: text('response').notNull(),
  model: varchar('model', { length: 100 }).notNull(),
  tokensUsed: integer('tokens_used'),
  status: varchar('status', { length: 50 }).default('completed'),
  conversationId: text('conversation_id'),
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
});

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
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Daily Usage table
export const dailyUsage = pgTable('daily_usage', {
  id: text('id').primaryKey().notNull(),
  uid: varchar('uid', { length: 255 }).notNull(),
  date: timestamp('date').notNull(),
  tokens: integer('tokens').default(0),
  modelUsage: jsonb('model_usage'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
