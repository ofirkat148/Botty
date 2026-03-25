import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, decimal } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

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
  telegramToken: text('telegram_token'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// User Settings table
export const userSettings = pgTable('user_settings', {
  uid: varchar('uid', { length: 255 }).primaryKey().notNull(),
  systemPrompt: text('system_prompt'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// User Tokens table (Google OAuth)
export const userTokens = pgTable('user_tokens', {
  uid: varchar('uid', { length: 255 }).primaryKey().notNull(),
  googleAccessToken: text('google_access_token'),
  expiresAt: timestamp('expires_at'),
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

// Telegram Links table
export const telegramLinks = pgTable('telegram_links', {
  chatId: text('chat_id').primaryKey().notNull(),
  uid: varchar('uid', { length: 255 }).notNull(),
  username: varchar('username', { length: 255 }),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

// Telegram Model Selection table
export const tgModelSelection = pgTable('tg_model_selection', {
  chatId: text('chat_id').primaryKey().notNull(),
  model: varchar('model', { length: 100 }).notNull(),
});

// Telegram System Prompts table
export const tgSystemPrompts = pgTable('tg_system_prompts', {
  chatId: text('chat_id').primaryKey().notNull(),
  systemPrompt: text('system_prompt').notNull(),
});

// Telegram Sandbox table
export const tgSandbox = pgTable('tg_sandbox', {
  chatId: text('chat_id').primaryKey().notNull(),
  enabled: boolean('enabled').default(false),
});

// Telegram Sessions table
export const tgSessions = pgTable('tg_sessions', {
  chatId: text('chat_id').primaryKey().notNull(),
  lastSeen: timestamp('last_seen').defaultNow().notNull(),
});
