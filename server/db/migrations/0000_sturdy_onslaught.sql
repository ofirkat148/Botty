CREATE TABLE IF NOT EXISTS "agent_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"uid" varchar(255) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"command" varchar(100) NOT NULL,
	"use_when" text NOT NULL,
	"boundaries" text NOT NULL,
	"system_prompt" text NOT NULL,
	"starter_prompt" text NOT NULL,
	"provider" varchar(100),
	"model" varchar(255),
	"memory_mode" varchar(20) DEFAULT 'shared',
	"executor_type" varchar(64) DEFAULT 'internal-llm' NOT NULL,
	"endpoint" text,
	"config" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_definitions_uid_command_unique" UNIQUE("uid","command")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"uid" varchar(255) NOT NULL,
	"provider" varchar(100) NOT NULL,
	"encrypted_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_uid_provider_unique" UNIQUE("uid","provider")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_settings" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"telegram_bot_token" text,
	"telegram_bot_enabled" boolean DEFAULT true,
	"telegram_allowed_chat_ids" text,
	"telegram_provider" varchar(100),
	"telegram_model" varchar(255),
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"uid" varchar(255) NOT NULL,
	"date" timestamp NOT NULL,
	"tokens" integer DEFAULT 0,
	"model_usage" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "facts" (
	"id" text PRIMARY KEY NOT NULL,
	"uid" varchar(255) NOT NULL,
	"bot_id" text,
	"content" text NOT NULL,
	"is_skill" boolean DEFAULT false,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "history" (
	"id" text PRIMARY KEY NOT NULL,
	"uid" varchar(255) NOT NULL,
	"prompt" text NOT NULL,
	"response" text NOT NULL,
	"model" varchar(100) NOT NULL,
	"tokens_used" integer,
	"status" varchar(50) DEFAULT 'completed',
	"conversation_id" text,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memory_files" (
	"id" text PRIMARY KEY NOT NULL,
	"uid" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"content" text NOT NULL,
	"type" varchar(50),
	"size" integer,
	"is_skill" boolean DEFAULT false,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memory_urls" (
	"id" text PRIMARY KEY NOT NULL,
	"uid" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"title" varchar(255),
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settings" (
	"uid" varchar(255) PRIMARY KEY NOT NULL,
	"local_url" text,
	"use_memory" boolean DEFAULT true,
	"auto_memory" boolean DEFAULT true,
	"sandbox_mode" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_settings" (
	"uid" varchar(255) PRIMARY KEY NOT NULL,
	"system_prompt" text,
	"custom_skills" jsonb,
	"custom_bots" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"uid" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"photo_url" text,
	"last_login" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "facts_bot_id_idx" ON "facts" ("bot_id");