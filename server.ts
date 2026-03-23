import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import admin from "firebase-admin";
import { getFirestore, FieldValue as AdminFieldValue, Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { initializeApp, getApps, applicationDefault } from "firebase-admin/app";
import { initializeApp as initializeClientApp, getApps as getClientApps } from 'firebase/app';
import { 
  getFirestore as getClientFirestore, 
  collection as clientCollection, 
  doc as clientDoc, 
  getDoc as getClientDoc, 
  getDocs as getClientDocs,
  setDoc as clientSetDoc, 
  updateDoc as clientUpdateDoc, 
  deleteDoc as clientDeleteDoc, 
  query as clientQuery, 
  where as clientWhere, 
  orderBy as clientOrderBy,
  limit as clientLimit,
  serverTimestamp as clientServerTimestamp,
  Timestamp as clientTimestamp,
  writeBatch as clientWriteBatch,
  increment as clientIncrement,
  arrayUnion as clientArrayUnion,
  arrayRemove as clientArrayRemove
} from 'firebase/firestore';
import { getAuth as getClientAuth, signInAnonymously } from 'firebase/auth';
import fs from "fs";

const logFile = "server-debug.log";
const log = (msg: string) => {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${msg}\n`;
  try {
    fs.appendFileSync(logFile, entry);
  } catch (e) {
    console.error(`Failed to write to log file: ${e instanceof Error ? e.message : String(e)}`);
  }
  console.log(msg);
};

log("Server script starting...");

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let firebaseConfig: any = null;
try {
  log("Loading firebase-applet-config.json...");
  firebaseConfig = require("./firebase-applet-config.json");
  log("Firebase config loaded.");
} catch (e: any) {
  log(`CRITICAL: Failed to load firebase-applet-config.json: ${e.message}. Firestore will be unavailable.`);
}

// Initialize Firebase Admin for backend
log("Initializing Firebase Admin...");
let db: any = null;
let FieldValue: any = AdminFieldValue;
let Timestamp: any = AdminTimestamp;

async function initFirebase() {
  if (!firebaseConfig) {
    log("[INIT] Skipping Firebase initialization: config missing.");
    return;
  }
  try {
    const projectId = firebaseConfig.projectId;
    const databaseId = firebaseConfig.firestoreDatabaseId;
    const apiKey = firebaseConfig.apiKey;

    log(`[INIT] Starting Firebase initialization...`);
    log(`[INIT] Project ID: ${projectId}`);
    log(`[INIT] Database ID: ${databaseId}`);
    
    // Force project ID in environment
    process.env.GOOGLE_CLOUD_PROJECT = projectId;
    process.env.GCLOUD_PROJECT = projectId;

    // Try Admin SDK first
    try {
      log(`[INIT] Attempting Admin SDK initialization for project: ${projectId}...`);
      if (getApps().length === 0) {
        initializeApp({
          projectId: projectId
        });
      }
      const adminApp = getApps()[0];
      log(`[INIT] Admin SDK initialized.`);
      
      // If databaseId is (default), we can omit it or use it as is
      // But some environments prefer it as an argument to getFirestore
      db = getFirestore(adminApp, databaseId);
      log(`[INIT] Connecting to database: ${databaseId}`);
      
      log("[INIT] Admin SDK assigned. Testing connection...");
      // Use a timeout for the health check to avoid hanging
      const healthCheck = db.collection("health").doc("check").get();
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000));
      
      await Promise.race([healthCheck, timeout]);
      log("[INIT] Admin SDK connection successful.");
      return;
    } catch (adminErr: any) {
      // Use a more neutral log for expected fallback
      log(`[INIT] Admin SDK connection test failed (expected in some environments): ${adminErr.message}`);
      log(`[INIT] Falling back to Client SDK...`);
    }

    // Fallback to Client SDK on server
    log(`[INIT] Attempting Client SDK fallback...`);
    const clientAppName = 'llm-router-client';
    let clientApp = getClientApps().find(app => app.name === clientAppName);
    if (!clientApp) {
      clientApp = initializeClientApp({
        apiKey: apiKey,
        authDomain: firebaseConfig.authDomain,
        projectId: projectId,
        appId: firebaseConfig.appId
      }, clientAppName);
    }
    
    const clientDb = getClientFirestore(clientApp, databaseId);
    const clientAuth = getClientAuth(clientApp);
    
    log("[INIT] Client SDK initialized. Testing connection...");
    
    try {
      log("[INIT] Signing in anonymously for Client SDK...");
      await signInAnonymously(clientAuth);
      log("[INIT] Anonymous sign-in successful.");
    } catch (authErr: any) {
      if (authErr.code === 'auth/admin-restricted-operation') {
        log(`[INIT] Note: Anonymous sign-in is disabled in Firebase Console. This is normal if your rules allow public access.`);
      } else {
        log(`[INIT] Anonymous sign-in failed: ${authErr.message}`);
      }
    }
    
    // Test client connection
    await getClientDoc(clientDoc(clientDb, "health", "check"));
    log("[INIT] Client SDK connection successful.");
    
    // Wrap clientDb to look like admin db for basic operations
    FieldValue = {
      serverTimestamp: () => clientServerTimestamp(),
      delete: () => { throw new Error("FieldValue.delete() not implemented in fallback"); },
      increment: (n: number) => clientIncrement(n),
      arrayUnion: (...args: any[]) => clientArrayUnion(...args),
      arrayRemove: (...args: any[]) => clientArrayRemove(...args)
    };
    Timestamp = clientTimestamp;

    const wrapQuery = (q: any) => ({
      where: (field: string, op: any, value: any) => wrapQuery(clientQuery(q, clientWhere(field, op, value))),
      orderBy: (field: string, dir: any) => wrapQuery(clientQuery(q, clientOrderBy(field, dir))),
      limit: (n: number) => wrapQuery(clientQuery(q, clientLimit(n))),
      get: async () => {
        const snap = await getClientDocs(q);
        return {
          docs: snap.docs.map(d => ({
            id: d.id,
            data: () => d.data(),
            exists: () => d.exists(),
            ref: d.ref
          })),
          size: snap.size,
          empty: snap.empty
        };
      }
    });

    db = {
      collection: (colName: string) => {
        const colRef = clientCollection(clientDb, colName);
        return {
          doc: (docId?: string) => {
            const dRef = docId ? clientDoc(clientDb, colName, docId) : clientDoc(colRef);
            return {
              id: dRef.id,
              ref: dRef,
              get: () => getClientDoc(dRef).then(snap => ({
                exists: () => snap.exists(),
                data: () => snap.data(),
                id: snap.id,
                ref: snap.ref
              })),
              set: (data: any, options?: any) => clientSetDoc(dRef, data, options),
              update: (data: any) => clientUpdateDoc(dRef, data),
              delete: () => clientDeleteDoc(dRef)
            };
          },
          where: (field: string, op: any, value: any) => wrapQuery(clientQuery(colRef, clientWhere(field, op, value))),
          orderBy: (field: string, dir: any) => wrapQuery(clientQuery(colRef, clientOrderBy(field, dir))),
          limit: (n: number) => wrapQuery(clientQuery(colRef, clientLimit(n))),
          get: async () => {
            const snap = await getClientDocs(colRef);
            return {
              docs: snap.docs.map(d => ({
                id: d.id,
                data: () => d.data(),
                exists: () => d.exists(),
                ref: d.ref
              })),
              size: snap.size,
              empty: snap.empty
            };
          },
          add: async (data: any) => {
            const dRef = clientDoc(colRef);
            await clientSetDoc(dRef, data);
            return { id: dRef.id };
          }
        };
      },
      batch: () => {
        const batch = clientWriteBatch(clientDb);
        return {
          set: (ref: any, data: any, options?: any) => batch.set(ref.ref || ref, data, options),
          update: (ref: any, data: any) => batch.update(ref.ref || ref, data),
          delete: (ref: any) => batch.delete(ref.ref || ref),
          commit: () => batch.commit()
        };
      }
    };

    // Override FieldValue for client SDK
    FieldValue = {
      serverTimestamp: () => clientServerTimestamp(),
      increment: (n: number) => clientIncrement(n),
      arrayUnion: (...args: any[]) => clientArrayUnion(...args),
      arrayRemove: (...args: any[]) => clientArrayRemove(...args)
    };
    Timestamp = clientTimestamp;
    
    (admin.firestore as any).FieldValue = FieldValue;
    (admin.firestore as any).Timestamp = Timestamp;

    log("[INIT] Client SDK shim assigned.");

  } catch (e: any) {
    log(`[INIT] FATAL: All Firebase initialization attempts failed: ${e.message}`);
    if (e.stack) log(`[INIT] STACK: ${e.stack}`);
  }
}

await initFirebase();

let sqliteDb: any;
/*
try {
  const Database = require("better-sqlite3");
  sqliteDb = new Database("history.db");
} catch (e: any) {
  log(`Failed to load or open better-sqlite3/history.db: ${e.message}`);
}
*/

async function getAvailableProviders(uid: string) {
  const providers = new Set<string>();
  
  // Check environment variables
  if (process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY) providers.add('google');
  if (process.env.OPENAI_API_KEY) providers.add('openai');
  if (process.env.ANTHROPIC_API_KEY) providers.add('anthropic');
  if (process.env.GROQ_API_KEY) providers.add('groq');
  if (process.env.DEEPSEEK_API_KEY) providers.add('deepseek');
  if (process.env.MISTRAL_API_KEY) providers.add('mistral');
  if (process.env.XAI_API_KEY) providers.add('xai');
  if (process.env.HYPEREAL_API_KEY) providers.add('hypereal');
  if (process.env.GITHUB_API_KEY || process.env.GITHUB_TOKEN) providers.add('github');

  // Check Firestore keys
  try {
    const keysSnap = await db.collection("apiKeys").where("uid", "==", uid).get();
    keysSnap.docs.forEach((doc: any) => {
      const data = doc.data();
      if (data.key && data.key.trim()) {
        providers.add(data.provider);
      }
    });
    
    // Check if local URL is set
    const settingsDoc = await db.collection("settings").doc(uid).get();
    if (settingsDoc.exists() && settingsDoc.data()?.localUrl) {
      providers.add('local');
    }
  } catch (e: any) {
    log(`Error fetching available providers from Firestore: ${e.message}`);
  }

  const result = Array.from(providers);
  console.log(`[AUTH] Available providers for ${uid}:`, result);
  return result;
}

// Smart Routing Logic
interface ModelMetrics {
  id: string;
  provider: string;
  costWeight: number; // 1-10 (1 is cheapest)
  reasoningScore: number; // 1-10
  speedScore: number; // 1-10
  creativeScore: number; // 1-10
  codingScore: number; // 1-10
  visionScore: number; // 1-10
}

const MODEL_REGISTRY: ModelMetrics[] = [
  { id: 'gemini-3-flash-preview', provider: 'google', costWeight: 1, reasoningScore: 6, speedScore: 10, creativeScore: 6, codingScore: 6, visionScore: 8 },
  { id: 'gemini-3.1-pro-preview', provider: 'google', costWeight: 3, reasoningScore: 9, speedScore: 7, creativeScore: 8, codingScore: 8, visionScore: 9 },
  { id: 'gemini-3.1-flash-lite-preview', provider: 'google', costWeight: 0.5, reasoningScore: 5, speedScore: 10, creativeScore: 5, codingScore: 4, visionScore: 7 },
  { id: 'gemini-flash-latest', provider: 'google', costWeight: 1, reasoningScore: 6, speedScore: 10, creativeScore: 6, codingScore: 6, visionScore: 8 },
  { id: 'gpt-4o', provider: 'openai', costWeight: 8, reasoningScore: 9, speedScore: 8, creativeScore: 9, codingScore: 8, visionScore: 9 },
  { id: 'gpt-4o-mini', provider: 'openai', costWeight: 1, reasoningScore: 7, speedScore: 9, creativeScore: 7, codingScore: 7, visionScore: 8 },
  { id: 'claude-3-5-sonnet-20240620', provider: 'anthropic', costWeight: 8, reasoningScore: 9, speedScore: 6, creativeScore: 9, codingScore: 10, visionScore: 9 },
  { id: 'claude-3-5-haiku-20241022', provider: 'anthropic', costWeight: 2, reasoningScore: 7, speedScore: 9, creativeScore: 7, codingScore: 7, visionScore: 8 },
  { id: 'llama-3.3-70b-versatile', provider: 'groq', costWeight: 1, reasoningScore: 8, speedScore: 10, creativeScore: 7, codingScore: 8, visionScore: 5 },
  { id: 'deepseek-chat', provider: 'deepseek', costWeight: 1, reasoningScore: 9, speedScore: 8, creativeScore: 8, codingScore: 9, visionScore: 5 },
  { id: 'mistral-large-latest', provider: 'mistral', costWeight: 6, reasoningScore: 9, speedScore: 7, creativeScore: 8, codingScore: 8, visionScore: 8 },
  { id: 'grok-beta', provider: 'xai', costWeight: 6, reasoningScore: 8, speedScore: 8, creativeScore: 7, codingScore: 7, visionScore: 7 },
  { id: 'hypereal', provider: 'hypereal', costWeight: 1, reasoningScore: 8, speedScore: 10, creativeScore: 9, codingScore: 7, visionScore: 5 },
  { id: 'gpt-4o', provider: 'github', costWeight: 1, reasoningScore: 9, speedScore: 8, creativeScore: 8, codingScore: 9, visionScore: 8 },
  { id: 'claude-3-5-sonnet', provider: 'github', costWeight: 1, reasoningScore: 9, speedScore: 7, creativeScore: 9, codingScore: 10, visionScore: 9 },
  { id: 'ollama', provider: 'local', costWeight: 0, reasoningScore: 5, speedScore: 5, creativeScore: 5, codingScore: 5, visionScore: 5 },
];

async function getLLMContext(uid: string) {
  let context = "";
  try {
    // Limit memory context to avoid token limits
    const factsSnapshot = await db.collection("facts").where("uid", "==", uid).limit(20).get();
    const filesSnapshot = await db.collection("memoryFiles").where("uid", "==", uid).limit(5).get();
    const urlsSnapshot = await db.collection("memoryUrls").where("uid", "==", uid).limit(5).get();
    
    const facts = factsSnapshot.docs.map((d: any) => d.data());
    const files = filesSnapshot.docs.map((d: any) => d.data());
    const urls = urlsSnapshot.docs.map((d: any) => d.data());
    
    if (facts.length > 0) {
      log(`[MEMORY] Found ${facts.length} facts for user ${uid}`);
      context += `\n\n[USER PERSONALIZATION DATA]\nHere are some facts about the user to help you provide better responses:\n${facts.map((f: any) => `- ${f.content}`).join('\n')}`;
    }
    if (files.length > 0) {
      log(`[MEMORY] Found ${files.length} files for user ${uid}`);
      const skills = files.filter((f: any) => f.isSkill);
      const regularFiles = files.filter((f: any) => !f.isSkill);
      
      if (skills.length > 0) {
        context += `\n\n[USER SKILLS/INSTRUCTIONS]\n${skills.map((s: any) => `--- SKILL: ${s.name} ---\n${(s.content || '').substring(0, 4000)}`).join('\n\n')}`;
      }
      if (regularFiles.length > 0) {
        context += `\n\n[USER FILES]\n${regularFiles.map((f: any) => `--- FILE: ${f.name} ---\n${(f.content || '').substring(0, 4000)}`).join('\n\n')}`;
      }
    }
    if (urls.length > 0) {
      log(`[MEMORY] Found ${urls.length} URLs for user ${uid}`);
      context += `\n\n[USER SAVED URLS]\n${urls.map((u: any) => `--- URL: ${u.url} ---\n${(u.content || '').substring(0, 4000)}`).join('\n\n')}`;
    }
  } catch (e: any) {
    log(`[CONTEXT] Error fetching context: ${e.message}`);
  }
  return context;
}

async function getAPIKey(uid: string, provider: string) {
  const keyDoc = await db.collection("apiKeys").doc(`${uid}_${provider}`).get();
  let apiKey = keyDoc.data()?.key?.trim();
  let keySource = "firestore";

  if (!apiKey) {
    apiKey = process.env[`${provider.toUpperCase()}_API_KEY`]?.trim();
    keySource = "environment variable";
  }

  if (provider === 'google' && (!apiKey || apiKey.startsWith("MY_"))) {
    const systemKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
    if (systemKey && (!apiKey || apiKey === systemKey)) {
      apiKey = systemKey;
      keySource = "system default/env";
    }
  }
  
  return { apiKey, keySource };
}

async function callLLM(params: {
  prompt: string;
  provider: string;
  model: string;
  messages?: any[];
  apiKey: string;
  systemPrompt: string;
  media?: any[];
  localUrl?: string;
  maxTokens?: number;
}) {
  const { prompt, provider, model, messages, systemPrompt, media, localUrl, maxTokens = 2048 } = params;
  const apiKey = params.apiKey?.trim();
  if (!apiKey && provider !== 'local') throw new Error(`${provider.toUpperCase()} API Key is required.`);
  
  const history = messages || [];
  let responseText = "";
  let tokensUsed = 0;

  log(`[LLM] Calling ${provider}:${model} (Prompt length: ${prompt.length}, History: ${history.length})`);

  try {
    if (provider === 'google') {
      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });
      
      // Ensure alternating roles for Gemini (user -> model -> user)
      const contents: any[] = [];
      let lastRole: string | null = null;

      history.forEach((m: any) => {
        const role = m.role === 'assistant' ? 'model' : 'user';
        if (role === lastRole && contents.length > 0) {
          // Merge consecutive messages with the same role
          const lastPart = contents[contents.length - 1].parts[0];
          if (lastPart && typeof lastPart.text === 'string') {
            lastPart.text += `\n\n${m.content}`;
          } else if (lastPart && !lastPart.text) {
            // If the last part was media, add a new text part
            contents[contents.length - 1].parts.push({ text: m.content });
          }
        } else {
          contents.push({
            role,
            parts: [{ text: m.content }]
          });
          lastRole = role;
        }
      });

      // Prepare current prompt and media
      const currentParts: any[] = [{ text: prompt }];
      if (media && Array.isArray(media)) {
        media.forEach((m: any) => {
          if (m.inlineData) {
            currentParts.push({
              inlineData: {
                mimeType: m.inlineData.mimeType,
                data: m.inlineData.data
              }
            });
          }
        });
      }

      // Add current prompt to contents, merging if necessary
      if (lastRole === 'user' && contents.length > 0) {
        contents[contents.length - 1].parts.push(...currentParts);
      } else {
        contents.push({
          role: 'user',
          parts: currentParts
        });
      }

      const result = await ai.models.generateContent({
        model: model,
        contents: contents,
        config: {
          systemInstruction: systemPrompt || "You are a helpful assistant.",
          maxOutputTokens: maxTokens
        }
      });

      // Safety check for response
      if (!result.candidates || result.candidates.length === 0) {
        throw new Error("Gemini returned no candidates. The response might have been blocked by safety filters.");
      }

      responseText = result.text || "";
      
      // Accurate token count from usageMetadata
      if (result.usageMetadata) {
        tokensUsed = result.usageMetadata.totalTokenCount || 0;
      }
    } else if (['openai', 'xai', 'groq', 'deepseek', 'mistral', 'hypereal', 'github'].includes(provider)) {
      let baseUrl = "";
      if (provider === 'openai') baseUrl = "https://api.openai.com/v1/chat/completions";
      else if (provider === 'xai') baseUrl = "https://api.x.ai/v1/chat/completions";
      else if (provider === 'groq') baseUrl = "https://api.groq.com/openai/v1/chat/completions";
      else if (provider === 'deepseek') baseUrl = "https://api.deepseek.com/chat/completions";
      else if (provider === 'mistral') baseUrl = "https://api.mistral.ai/v1/chat/completions";
      else if (provider === 'hypereal') baseUrl = "https://api.hypereal.tech/api/v1/chat/completions";
      else if (provider === 'github') baseUrl = "https://models.inference.ai.azure.com/chat/completions";
      
      const apiMessages: any[] = [
        { role: "system", content: systemPrompt || "You are a helpful assistant." },
        ...history.map((m: any) => ({ 
          role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user', 
          content: m.content 
        }))
      ];

      if (media && Array.isArray(media) && media.length > 0) {
        const content: any[] = [{ type: "text", text: prompt }];
        media.forEach((m: any) => {
          if (m.inlineData) {
            content.push({
              type: "image_url",
              image_url: {
                url: `data:${m.inlineData.mimeType};base64,${m.inlineData.data}`
              }
            });
          }
        });
        apiMessages.push({ role: "user", content });
      } else {
        apiMessages.push({ role: "user", content: prompt });
      }

      const response = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({ 
          model, 
          messages: apiMessages,
          temperature: 0.7,
          max_tokens: maxTokens
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.error?.message || response.statusText;
        if (response.status === 429) throw new Error(`QUOTA_EXCEEDED: ${provider.toUpperCase()} API quota exceeded.`);
        throw new Error(`${provider.toUpperCase()} API Error: ${message}`);
      }

      const data = await response.json();
      if (!data.choices || data.choices.length === 0) {
        throw new Error(`${provider.toUpperCase()} returned no choices.`);
      }
      responseText = data.choices[0].message.content || "";
      tokensUsed = data.usage?.total_tokens || 0;
    } else if (provider === 'anthropic') {
      // Anthropic requires alternating roles and starting with user
      const apiMessages: any[] = [];
      let lastRole: string | null = null;
      
      history.forEach((m: any) => {
        const role = m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user';
        if (role === lastRole && apiMessages.length > 0) {
          const lastMsg = apiMessages[apiMessages.length - 1];
          if (typeof lastMsg.content === 'string') {
            lastMsg.content += `\n\n${m.content}`;
          }
        } else {
          apiMessages.push({ role, content: m.content });
          lastRole = role;
        }
      });

      // Ensure first message is user
      if (apiMessages.length > 0 && apiMessages[0].role === 'assistant') {
        apiMessages.shift();
      }

      // Handle current prompt and media
      if (media && Array.isArray(media) && media.length > 0) {
        const content: any[] = [];
        media.forEach((m: any) => {
          if (m.inlineData) {
            content.push({
              type: "image",
              source: {
                type: "base64",
                media_type: m.inlineData.mimeType,
                data: m.inlineData.data
              }
            });
          }
        });
        content.push({ type: "text", text: prompt });
        
        if (lastRole === 'user' && apiMessages.length > 0) {
          // If last was user, we can't just append media easily in some versions, 
          // but usually we just push a new user message if roles were alternating.
          // For simplicity, we'll just push a new user message if the last was assistant.
          apiMessages.push({ role: 'user', content });
        } else {
          apiMessages.push({ role: 'user', content });
        }
      } else {
        if (lastRole === 'user' && apiMessages.length > 0) {
          const lastMsg = apiMessages[apiMessages.length - 1];
          if (typeof lastMsg.content === 'string') {
            lastMsg.content += `\n\n${prompt}`;
          }
        } else {
          apiMessages.push({ role: 'user', content: prompt });
        }
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: systemPrompt || "You are a helpful assistant.",
          messages: apiMessages
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.error?.message || response.statusText;
        if (response.status === 429) throw new Error("QUOTA_EXCEEDED: Anthropic API quota exceeded.");
        throw new Error(`Anthropic API Error: ${message}`);
      }

      const data = await response.json();
      if (!data.content || data.content.length === 0) {
        throw new Error("Anthropic returned no content.");
      }
      responseText = data.content[0].text || "";
      tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
    } else if (provider === 'local') {
      const endpoint = `${(localUrl || "http://localhost:11434").replace(/\/$/, '')}/v1/chat/completions`;
      const apiMessages: any[] = [
        { role: "system", content: systemPrompt || "You are a helpful assistant." },
        ...history.map((m: any) => ({ 
          role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user', 
          content: m.content 
        }))
      ];

      if (media && Array.isArray(media) && media.length > 0) {
        const content: any[] = [{ type: "text", text: prompt }];
        media.forEach((m: any) => {
          if (m.inlineData) {
            content.push({
              type: "image_url",
              image_url: {
                url: `data:${m.inlineData.mimeType};base64,${m.inlineData.data}`
              }
            });
          }
        });
        apiMessages.push({ role: "user", content });
      } else {
        apiMessages.push({ role: "user", content: prompt });
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          model: "local-model", 
          messages: apiMessages, 
          stream: false,
          temperature: 0.7,
          max_tokens: maxTokens
        })
      });

      if (!response.ok) throw new Error(`Local LLM Error (${response.status}): ${response.statusText}`);
      const data = await response.json();
      if (!data.choices || data.choices.length === 0) {
        throw new Error("Local LLM returned no choices.");
      }
      responseText = data.choices[0].message.content || "";
      tokensUsed = data.usage?.total_tokens || 0;
    }

    // Final fallback for tokensUsed if still 0
    if (!tokensUsed && responseText) {
      // Rough estimation: 1 token ≈ 4 characters
      const estimatedInput = Math.ceil((prompt.length + (systemPrompt?.length || 0) + history.reduce((acc: number, m: any) => acc + (m.content?.length || 0), 0)) / 4);
      const estimatedOutput = Math.ceil(responseText.length / 4);
      tokensUsed = estimatedInput + estimatedOutput;
      log(`[LLM] Estimated tokens used: ${tokensUsed}`);
    }

    return { responseText, tokensUsed };
  } catch (err: any) {
    let message = err.message || String(err || 'Unknown error');
    
    // Try to parse JSON error from SDKs (common in Gemini/OpenAI)
    try {
      if (message.startsWith('{') || message.includes('{"error":')) {
        const jsonStart = message.indexOf('{');
        const jsonStr = message.substring(jsonStart);
        const parsed = JSON.parse(jsonStr);
        if (parsed.error && parsed.error.message) {
          message = parsed.error.message;
        } else if (parsed.message) {
          message = parsed.message;
        }
      }
    } catch (e) {
      // Not JSON or parse failed, keep original message
    }

    log(`[LLM] Error in callLLM: ${message}`);
    throw new Error(message);
  }
}

function getSmartRoute(prompt: string, currentUsagePercent: number, hasMedia: boolean = false, excludeModels: string[] = [], availableProviders: string[] = []) {
  const lower = prompt.toLowerCase();
  
  // 1. Detect Intent
  const codingKeywords = ['code', 'program', 'function', 'class', 'interface', 'variable', 'api', 'database', 'sql', 'react', 'typescript', 'javascript', 'python', 'java', 'c++', 'rust', 'golang', 'css', 'html', 'json', 'yaml'];
  const isCoding = codingKeywords.some(k => lower.includes(k)) || /[{}[\];]/.test(prompt) && prompt.length > 50;
  
  const creativeKeywords = ['story', 'poem', 'creative', 'imagine', 'fiction', 'lyrics', 'song', 'script', 'novel', 'describe', 'paint', 'art'];
  const isCreative = creativeKeywords.some(k => lower.includes(k));
  
  const reasoningKeywords = ['solve', 'math', 'logic', 'calculate', 'proof', 'theorem', 'physics', 'chemistry', 'complex', 'analyze', 'deep dive', 'explain in detail', 'why', 'how does', 'compare'];
  const isReasoning = reasoningKeywords.some(k => lower.includes(k)) || /\d+[\+\-\*\/]\d+/.test(prompt);

  // 2. Calculate Scores for each model
  const scoredModels = MODEL_REGISTRY
    .filter(m => !excludeModels.includes(m.id))
    .filter(m => availableProviders.length === 0 || availableProviders.includes(m.provider)) // Filter by available providers
    .map(model => {
      let score = 0;
      
      // Base reasoning score
      score += model.reasoningScore * 2;
      
      // Domain specific boosts
      if (isCoding) score += model.codingScore * 5;
      if (isCreative) score += model.creativeScore * 4;
      if (isReasoning) score += model.reasoningScore * 5;
      if (hasMedia) score += model.visionScore * 10; // High boost for vision
      
      // Speed boost for short prompts
      if (prompt.length < 200) score += model.speedScore * 2;
      
      // Cost penalty (increases as usage increases)
      // If usage is high, penalize expensive models more
      const costPenaltyMultiplier = currentUsagePercent > 80 ? 3 : 1;
      score -= model.costWeight * costPenaltyMultiplier * 2;
      
      // Context length constraints
      if (prompt.length > 10000 && model.id === 'gemini-3-flash-preview') {
        score -= 50; // Flash is worse at very long context
      }

      return { ...model, score };
    });

  // 3. Sort and pick best
  scoredModels.sort((a, b) => b.score - a.score);
  
  // If all models are excluded, pick a safe fallback from the registry
  let winner: any = scoredModels[0];
  
  if (!winner && availableProviders.length > 0) {
    // Try to find ANY available model if the filtered list was empty
    const found = MODEL_REGISTRY.find(m => availableProviders.includes(m.provider));
    if (found) winner = { ...found, score: 0 };
  }

  if (!winner) winner = { ...MODEL_REGISTRY[0], score: 0 };
  
  log(`[ROUTER] Prompt: "${prompt.substring(0, 30)}..." | Usage: ${currentUsagePercent.toFixed(1)}% | Winner: ${winner.id} (Score: ${winner.score || 0})`);
  
  return {
    model: winner.id,
    provider: winner.provider,
    reason: `Optimized for ${isCoding ? 'Coding' : isReasoning ? 'Reasoning' : isCreative ? 'Creativity' : 'General Task'} with ${currentUsagePercent > 80 ? 'Cost-Saving' : 'Performance'} priority.`
  };
}

async function startServer() {
  log("startServer() called.");
  // await initSqlite();
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Middleware to check if Firestore is initialized
  app.use("/api", (req: any, res: any, next: any) => {
    // Skip check for health and debug endpoints
    if (req.path === "/health" || req.path === "/debug-logs" || req.path === "/keep-alive") {
      return next();
    }
    if (!db) {
      return res.status(503).json({ 
        error: "Database not initialized. This usually means firebase-applet-config.json is missing or invalid. Please check server logs." 
      });
    }
    next();
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", uptime: process.uptime(), bot: !!tgBot });
  });

  app.get("/api/keep-alive", (req, res) => {
    res.json({ status: "alive", timestamp: Date.now() });
  });

  app.get("/api/debug-logs", (req, res) => {
    try {
      const logs = fs.readFileSync(logFile, "utf-8");
      res.send(`<pre>${logs}</pre>`);
    } catch (e) {
      res.send("No logs found.");
    }
  });

  app.post("/api/migrate", async (req, res) => {
    const { uid, email } = req.body;
    if (email !== "kofir2007@gmail.com") return res.status(403).json({ error: "Forbidden" });

    try {
      // Migrate History
      const history = sqliteDb.prepare("SELECT * FROM requests").all() as any[];
      const existingHistorySnap = await db.collection("history").where("uid", "==", uid).get();
      const existingHistoryKeys = new Set(existingHistorySnap.docs.map((d: any) => `${d.data().prompt}_${d.data().response}`));
      
      let migratedHistory = 0;
      for (const item of history) {
        const key = `${item.prompt}_${item.response}`;
        if (!existingHistoryKeys.has(key)) {
          await db.collection("history").add({
            uid,
            prompt: item.prompt,
            response: item.response,
            model: item.model,
            tokens_used: item.tokens_used,
            status: item.status,
            timestamp: item.timestamp ? Timestamp.fromDate(new Date(item.timestamp)) : FieldValue.serverTimestamp()
          });
          migratedHistory++;
          existingHistoryKeys.add(key);
        }
      }

      // Migrate Facts
      const facts = sqliteDb.prepare("SELECT * FROM facts").all() as any[];
      const existingFactsSnap = await db.collection("facts").where("uid", "==", uid).get();
      const existingFactContents = new Set(existingFactsSnap.docs.map((d: any) => d.data().content.toLowerCase().trim()));
      
      let migratedFacts = 0;
      for (const item of facts) {
        if (!existingFactContents.has(item.content.toLowerCase().trim())) {
          await db.collection("facts").add({
            uid,
            content: item.content,
            timestamp: item.timestamp ? Timestamp.fromDate(new Date(item.timestamp)) : FieldValue.serverTimestamp()
          });
          migratedFacts++;
          existingFactContents.add(item.content.toLowerCase().trim());
        }
      }

      // Migrate Keys
      const keys = sqliteDb.prepare("SELECT * FROM api_keys").all() as any[];
      for (const item of keys) {
        await db.collection("apiKeys").doc(`${uid}_${item.provider}`).set({
          uid,
          provider: item.provider,
          key: item.key
        }, { merge: true });
      }

      // Migrate Files
      const files = sqliteDb.prepare("SELECT * FROM memory_files").all() as any[];
      for (const item of files) {
        await db.collection("memoryFiles").add({
          uid,
          name: item.name,
          content: item.content,
          type: item.type,
          size: item.size,
          timestamp: item.timestamp ? Timestamp.fromDate(new Date(item.timestamp)) : FieldValue.serverTimestamp()
        });
      }

      res.json({ success: true, migrated: { history: migratedHistory, facts: migratedFacts, keys: keys.length, files: files.length } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const multer = await import("multer");
  const upload = multer.default({ storage: multer.memoryStorage() });

  app.get("/api/memory-files", async (req, res) => {
    const uid = req.query.uid as string;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    try {
      const snapshot = await db.collection("memoryFiles")
        .where("uid", "==", uid)
        .orderBy("timestamp", "desc")
        .get();
      const files = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(files);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/memory-files", upload.single("file"), async (req, res) => {
    const uid = req.body.uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    
    const { originalname, mimetype, size, buffer } = req.file;
    const content = buffer.toString("utf-8");
    const isSkill = req.body.isSkill === 'true';
    
    try {
      const docRef = await db.collection("memoryFiles").add({
        uid,
        name: originalname,
        content,
        type: mimetype,
        size,
        isSkill,
        timestamp: FieldValue.serverTimestamp()
      });
      res.json({ id: docRef.id, name: originalname });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/memory-files/:id", async (req, res) => {
    try {
      await db.collection("memoryFiles").doc(req.params.id).delete();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/memory-files/:id", async (req, res) => {
    const { isSkill } = req.body;
    try {
      await db.collection("memoryFiles").doc(req.params.id).update({ isSkill });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/memory-urls", async (req, res) => {
    const uid = req.query.uid as string;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    try {
      const snapshot = await db.collection("memoryUrls")
        .where("uid", "==", uid)
        .orderBy("timestamp", "desc")
        .get();
      const urls = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(urls);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/memory-urls", async (req, res) => {
    const { uid, url } = req.body;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      log(`[MEMORY-URL] Fetching content for: ${url}`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch URL: ${response.statusText}`);
      const html = await response.text();

      const TurndownService = (await import("turndown")).default;
      const turndownService = new TurndownService();
      const markdown = turndownService.turndown(html);

      // Extract title if possible
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1] : url;

      const docRef = await db.collection("memoryUrls").add({
        uid,
        url,
        title,
        content: markdown,
        timestamp: FieldValue.serverTimestamp()
      });
      res.json({ id: docRef.id, url, title });
    } catch (err: any) {
      log(`[MEMORY-URL] Error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/memory-urls/:id", async (req, res) => {
    try {
      await db.collection("memoryUrls").doc(req.params.id).delete();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Telegram Bot Logic
  let tgBot: any = null;
  let tgBotInfo: any = null;
  let isTgInitializing = false;
  
  const initTelegram = async (force = false) => {
    if (isTgInitializing) return;
    if (tgBot && !force) {
      try {
        const me = await tgBot.getMe();
        if (me) return; // Already running and healthy
      } catch (e) {
        log("Telegram bot health check failed, restarting...");
      }
    }

    isTgInitializing = true;
    
    log("initTelegram() called.");
    try {
      log("Fetching settings for Telegram token...");
      const settingsDoc = await db.collection("settings").doc("global").get();
      const settingsData = settingsDoc.data();
      const token = settingsData?.telegram_token || process.env.TELEGRAM_BOT_TOKEN;

      if (token) {
        log("Telegram token found, initializing bot...");
        if (tgBot) {
          try {
            await tgBot.stopPolling();
            log("Stopped old Telegram Bot polling");
          } catch (e) {
            log(`Error stopping Telegram Bot: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        // Add a delay to allow old instance to disconnect
        await new Promise(resolve => setTimeout(resolve, 5000));

        try {
          const TelegramBot = require("node-telegram-bot-api");
          tgBot = new TelegramBot(token, { polling: true });
          
          tgBotInfo = await tgBot.getMe();
          log(`Telegram Bot initialized: ${tgBotInfo.username}`);

          // Register commands for auto-complete
          try {
            await tgBot.setMyCommands([
              { command: 'start', description: 'Start the bot and see help' },
              { command: 'new', description: 'Start a new chat session' },
              { command: 'link', description: 'Link to your web account (/link [UID])' },
              { command: 'status', description: 'Check your link and authorization status' },
              { command: 'model', description: 'Select a specific model or use auto' },
              { command: 'system', description: 'Set or view your custom system prompt' },
              { command: 'sandbox', description: 'Toggle Sandboxed Mode' },
              { command: 'email', description: 'Send current chat history to your email' }
            ]);
            log("Telegram bot commands registered successfully");
          } catch (cmdErr) {
            log(`Error registering Telegram commands: ${cmdErr instanceof Error ? cmdErr.message : String(cmdErr)}`);
          }

          tgBot.on("polling_error", (error: any) => {
            // Ignore 409 Conflict errors as they are common during restarts or multiple instances
            if (error.message && error.message.includes("409 Conflict")) {
              return;
            }
            console.error("Telegram Polling Error:", error.code || 'UNKNOWN', error.message);
            
            // If 401, the token is likely invalid
            if (error.code === 'ETELEGRAM' && error.message && error.message.includes('401')) {
               console.error("Invalid Telegram Token detected in polling");
            }
          });

          tgBot.on("error", (error: any) => {
            console.error("Telegram General Error:", error.message);
            // On fatal error, clear tgBot so health check can restart it
            tgBot = null;
          });

          tgBot.on("message", async (msg: any) => {
            const chatId = msg.chat.id;
            const text = msg.text;

            if (!text) return;
            if (text === "/start") {
              tgBot.sendMessage(chatId, "🤖 LLM Router Bot is Active!\n\nI run 24/7 in the background, so you can message me anytime even if the web app is closed.\n\nCommands:\n/new - Start a new chat session\n/link [UID] - Link to your web account\n/status - Check your link and authorization status\n/model - Select a specific model or use 'auto'\n/sandbox - Toggle Sandboxed Mode (NotebookLM style)\n/email - Send current chat history to your email\n\nSend me any prompt to get started!");
              return;
            }

            if (text.startsWith("/model")) {
              const parts = text.split(" ");
              if (parts.length === 1) {
                try {
                  const linkDoc = await db.collection("telegram_links").doc(chatId.toString()).get();
                  let availableModels = MODEL_REGISTRY;
                  
                  if (linkDoc.exists()) {
                    const uid = linkDoc.data().uid;
                    const providers = await getAvailableProviders(uid);
                    availableModels = MODEL_REGISTRY.filter(m => providers.includes(m.provider) || m.provider === 'auto');
                  } else {
                    // If not linked, only show models with environment keys (default behavior of getAvailableProviders with empty UID)
                    const providers = await getAvailableProviders("");
                    availableModels = MODEL_REGISTRY.filter(m => providers.includes(m.provider) || m.provider === 'auto');
                  }

                  const modelButtons = availableModels.map(m => ([{
                    text: `🤖 ${m.id} (${m.provider})`,
                    callback_data: `set_model:${m.id}`
                  }]));
                  
                  modelButtons.push([{
                    text: "✨ Smart Router (Auto)",
                    callback_data: "set_model:auto"
                  }]);

                  tgBot.sendMessage(chatId, 
                    `🎯 <b>Model Selection</b>\n\n` +
                    `Choose a model from the list below or use the Smart Router to automatically pick the best one for your prompt.\n\n` +
                    (linkDoc.exists() ? "<i>Showing models available for your linked account.</i>" : "<i>Account not linked. Showing default available models. Use /link [UID] to see more.</i>"),
                    { 
                      parse_mode: 'HTML',
                      reply_markup: {
                        inline_keyboard: modelButtons
                      }
                    }
                  );
                } catch (e: any) {
                  tgBot.sendMessage(chatId, "❌ Error fetching available models: " + e.message);
                }
              } else {
                const selectedId = parts[1].toLowerCase();
                if (selectedId === 'auto') {
                  await db.collection("tg_model_selection").doc(chatId.toString()).delete();
                  tgBot.sendMessage(chatId, "✅ Smart Router enabled (Auto-selection).");
                } else {
                  const model = MODEL_REGISTRY.find(m => m.id.toLowerCase() === selectedId);
                  if (model) {
                    await db.collection("tg_model_selection").doc(chatId.toString()).set({ 
                      modelId: model.id,
                      provider: model.provider,
                      timestamp: Date.now()
                    });
                    tgBot.sendMessage(chatId, `✅ Model set to: <b>${model.id}</b>`, { parse_mode: 'HTML' });
                  } else {
                    tgBot.sendMessage(chatId, "❌ Invalid model ID. Use `/model` to see the list of available models.", { parse_mode: 'HTML' });
                  }
                }
              }
              return;
            }

            if (text.startsWith("/system")) {
              const parts = text.split(" ");
              if (parts.length === 1) {
                try {
                  const tgSystemDoc = await db.collection("tg_system_prompts").doc(chatId.toString()).get();
                  let currentPrompt = tgSystemDoc.exists() ? tgSystemDoc.data()?.prompt : null;
                  let source = "Telegram-specific";

                  if (!currentPrompt) {
                    const linkDoc = await db.collection("telegram_links").doc(chatId.toString()).get();
                    if (linkDoc.exists()) {
                      const userSettingsDoc = await db.collection("user_settings").doc(linkDoc.data().uid).get();
                      if (userSettingsDoc.exists() && userSettingsDoc.data()?.systemPrompt) {
                        currentPrompt = userSettingsDoc.data().systemPrompt;
                        source = "Web GUI (Linked Account)";
                      }
                    }
                  }

                  if (!currentPrompt) {
                    currentPrompt = "Default (Helpful AI Assistant)";
                    source = "Default";
                  }

                  tgBot.sendMessage(chatId, 
                    `🧠 <b>System Prompt</b>\n\n` +
                    `Source: <b>${source}</b>\n` +
                    `Current prompt:\n<i>${currentPrompt}</i>\n\n` +
                    `To set a new prompt for Telegram ONLY, use:\n<code>/system [your prompt]</code>\n\n` +
                    `To reset to default (or use web GUI prompt), use:\n<code>/system reset</code>`,
                    { parse_mode: 'HTML' }
                  );
                } catch (e: any) {
                  tgBot.sendMessage(chatId, "❌ Error fetching system prompt: " + e.message);
                }
              } else {
                const newPrompt = text.substring(8).trim();
                try {
                  if (newPrompt.toLowerCase() === 'reset') {
                    await db.collection("tg_system_prompts").doc(chatId.toString()).delete();
                    tgBot.sendMessage(chatId, "✅ System prompt reset to default.");
                  } else {
                    await db.collection("tg_system_prompts").doc(chatId.toString()).set({ 
                      prompt: newPrompt,
                      timestamp: Date.now()
                    });
                    tgBot.sendMessage(chatId, `✅ System prompt updated to:\n<i>${newPrompt}</i>`, { parse_mode: 'HTML' });
                  }
                } catch (e: any) {
                  tgBot.sendMessage(chatId, "❌ Error updating system prompt: " + e.message);
                }
              }
              return;
            }

            if (text === "/sandbox") {
              try {
                const sandboxDoc = await db.collection("tg_sandbox").doc(chatId.toString()).get();
                const isCurrentlySandboxed = sandboxDoc.exists() ? sandboxDoc.data()?.enabled : false;
                
                tgBot.sendMessage(chatId, 
                  `🛡️ <b>Sandboxed Mode</b>\n\n` +
                  `Current status: <b>${isCurrentlySandboxed ? 'ENABLED' : 'DISABLED'}</b>\n\n` +
                  `In Sandboxed Mode, I will ONLY answer based on your provided facts and files (NotebookLM style).`,
                  {
                    parse_mode: 'HTML',
                    reply_markup: {
                      inline_keyboard: [[
                        { 
                          text: isCurrentlySandboxed ? "🔓 Disable Sandbox" : "🛡️ Enable Sandbox", 
                          callback_data: "toggle_sandbox" 
                        }
                      ]]
                    }
                  }
                );
              } catch (e: any) {
                tgBot.sendMessage(chatId, "❌ Error checking sandbox status: " + e.message);
              }
              return;
            }

            if (text === "/status") {
              try {
                const linkDoc = await db.collection("telegram_links").doc(chatId.toString()).get();
                if (!linkDoc.exists()) {
                  tgBot.sendMessage(chatId, "❌ Your Telegram account is not linked to a web account. Use /link [UID] to connect.");
                  return;
                }
                const uid = linkDoc.data().uid;
                const tokenDoc = await db.collection("user_tokens").doc(uid).get();
                const hasToken = tokenDoc.exists() && !!tokenDoc.data()?.google_access_token;
                const userDoc = await db.collection("users").doc(uid).get();
                const email = userDoc.data()?.email || "Unknown";

                tgBot.sendMessage(chatId, 
                  `✅ <b>Status Report</b>\n\n` +
                  `👤 <b>Linked UID:</b> <code>${uid}</code>\n` +
                  `📧 <b>Email:</b> ${email}\n` +
                  `🔑 <b>Google Auth:</b> ${hasToken ? '✅ Authorized' : '❌ Missing'}\n\n` +
                  `${!hasToken ? 'To fix Google Auth, open the web app, go to Settings, and click "Authorize Google".' : ''}`,
                  { parse_mode: 'HTML' }
                );
              } catch (e: any) {
                tgBot.sendMessage(chatId, "❌ Error checking status: " + e.message);
              }
              return;
            }

            if (text === "/email") {
              // Get linked UID
              let linkedUid = null;
              try {
                const linkDoc = await db.collection("telegram_links").doc(chatId.toString()).get();
                if (linkDoc.exists()) {
                  linkedUid = linkDoc.data().uid;
                }
              } catch (e) {}

              if (!linkedUid) {
                tgBot.sendMessage(chatId, "❌ Please link your account first using /link [UID]");
                return;
              }

              try {
                // Get Google token
                const tokenDoc = await db.collection("user_tokens").doc(linkedUid).get();
                const googleToken = tokenDoc.data()?.google_access_token;
                
                // Get user email
                const userDoc = await db.collection("users").doc(linkedUid).get();
                const userEmail = userDoc.data()?.email;

                if (!googleToken) {
                  tgBot.sendMessage(chatId, `❌ Google authorization token missing for account ${linkedUid}. Please open the web app, go to Settings, and click "Authorize Google".`);
                  return;
                }
                
                if (!userEmail) {
                  tgBot.sendMessage(chatId, "❌ User email not found. Please open the web app to sync your profile.");
                  return;
                }

                // Get current session history
                const sessionDoc = await db.collection("tg_sessions").doc(chatId.toString()).get();
                const sessionId = sessionDoc.exists() ? sessionDoc.data()?.id : null;
                const conversationId = sessionId ? `tg_${chatId}_${sessionId}` : `tg_${chatId}`;

                const historySnapshot = await db.collection("history")
                  .where("conversationId", "==", conversationId)
                  .orderBy("timestamp", "asc")
                  .get();

                const messages = historySnapshot.docs.map(d => d.data());
                if (messages.length === 0) {
                  tgBot.sendMessage(chatId, "❌ No messages in the current session to email.");
                  return;
                }

                tgBot.sendMessage(chatId, "📧 Sending chat summary to " + userEmail + "...");

                const chatContent = messages.map(m => `<b>${m.prompt ? 'USER' : 'AI'}:</b><br/>${(m.prompt || m.response).replace(/\n/g, '<br/>')}`).join('<br/><br/><hr/><br/>');
                const body = `
                  <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #333;">Telegram Chat Summary</h2>
                    <p style="color: #666; font-size: 14px;">Sent from LLM Router Bot on ${new Date().toLocaleString()}</p>
                    <div style="margin-top: 20px;">
                      ${chatContent}
                    </div>
                  </div>
                `;

                const utf8Subject = `=?utf-8?B?${Buffer.from(`Telegram Chat Summary: ${messages[0].prompt?.substring(0, 30)}...`).toString('base64')}?=`;
                const messageParts = [
                  `To: ${userEmail}`,
                  'Content-Type: text/html; charset=utf-8',
                  'MIME-Version: 1.0',
                  `Subject: ${utf8Subject}`,
                  '',
                  body,
                ];
                const rawMessage = Buffer.from(messageParts.join('\n'))
                  .toString('base64')
                  .replace(/\+/g, '-')
                  .replace(/\//g, '_')
                  .replace(/=+$/, '');

                const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${googleToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ raw: rawMessage }),
                });

                if (!gmailRes.ok) {
                  const errData = await gmailRes.json().catch(() => ({}));
                  if (gmailRes.status === 401) {
                    throw new Error("Google authorization expired. Please sign out and sign in again on the web app.");
                  }
                  throw new Error(errData.error?.message || "Gmail API failed");
                }

                tgBot.sendMessage(chatId, "✅ Email sent successfully!");
              } catch (e: any) {
                tgBot.sendMessage(chatId, "❌ Error sending email: " + e.message);
              }
              return;
            }

            if (text === "/new") {
              try {
                const sessionId = Math.random().toString(36).substring(2, 10);
                const now = Date.now();
                await db.collection("tg_sessions").doc(chatId.toString()).set({ id: sessionId, lastSeen: now });
                tgBot.sendMessage(chatId, "✨ New chat session started! Your messages will now be grouped separately in the history.");
              } catch (e: any) {
                tgBot.sendMessage(chatId, "❌ Error starting new session: " + e.message);
              }
              return;
            }

            if (text.startsWith("/link ")) {
              const uid = text.split(" ")[1];
              if (uid) {
                try {
                  await db.collection("telegram_links").doc(chatId.toString()).set({ 
                    uid, 
                    chatId: chatId.toString(),
                    username: msg.from?.username || "unknown",
                    timestamp: FieldValue.serverTimestamp() 
                  });
                  tgBot.sendMessage(chatId, "✅ Telegram account linked successfully! Your conversations will now show up in the web app history.");
                } catch (linkErr: any) {
                  console.error("Link Error:", linkErr);
                  tgBot.sendMessage(chatId, "❌ Error linking account: " + linkErr.message);
                }
                return;
              }
            }

            console.log(`Telegram message from ${chatId}: ${text.substring(0, 50)}...`);
            
            // Get linked UID if any
            let linkedUid = 'telegram_bot';
            try {
              const linkDoc = await db.collection("telegram_links").doc(chatId.toString()).get();
              if (linkDoc.exists()) {
                linkedUid = linkDoc.data().uid;
              }
            } catch (linkFetchErr) {
              console.error("Error fetching link:", linkFetchErr);
            }
            
            // Show typing indicator
            try {
              await tgBot.sendChatAction(chatId, 'typing');
            } catch (e) {
              console.error("Error sending chat action:", e);
            }

            // Manage Telegram session
            let conversationId = `tg_${chatId}`;
            try {
              log(`[TG_SESSION] Managing session for chatId: ${chatId}`);
              const sessionDoc = await db.collection("tg_sessions").doc(chatId.toString()).get();
              const now = Date.now();
              let sessionData = sessionDoc.exists() ? sessionDoc.data() : null;
              
              let lastSeen = 0;
              if (sessionData?.lastSeen) {
                if (typeof sessionData.lastSeen === 'number') {
                  lastSeen = sessionData.lastSeen;
                } else if (typeof sessionData.lastSeen === 'object' && sessionData.lastSeen.toMillis) {
                  lastSeen = sessionData.lastSeen.toMillis();
                } else if (typeof sessionData.lastSeen === 'object' && sessionData.lastSeen._seconds) {
                  lastSeen = sessionData.lastSeen._seconds * 1000;
                }
              }

              if (!sessionData || (now - lastSeen > 3600000)) { // 1 hour session
                const sessionId = Math.random().toString(36).substring(2, 10);
                log(`[TG_SESSION] Creating new session: ${sessionId} (Reason: ${!sessionData ? 'No session' : 'Expired, last seen ' + new Date(lastSeen).toISOString()})`);
                sessionData = { id: sessionId, lastSeen: now };
                await db.collection("tg_sessions").doc(chatId.toString()).set(sessionData);
              } else {
                log(`[TG_SESSION] Continuing session: ${sessionData.id} (Last seen ${new Date(lastSeen).toISOString()})`);
                sessionData.lastSeen = now;
                await db.collection("tg_sessions").doc(chatId.toString()).update({ lastSeen: now });
              }
              conversationId = `tg_${chatId}_${sessionData.id}`;
            } catch (sessionErr) {
              console.error("Error managing TG session:", sessionErr);
            }

            // Sophisticated routing for Telegram
            const today = new Date().toISOString().split('T')[0];
            let usagePercent = 0;
            try {
              // Try to find a linked user to check usage
              const linkDoc = await db.collection("telegram_links").doc(chatId.toString()).get();
              if (linkDoc.exists()) {
                const uid = linkDoc.data().uid;
                const usageDoc = await db.collection("dailyUsage").doc(`${uid}_${today}`).get();
                const tokens = usageDoc.data()?.tokens || 0;
                usagePercent = (tokens / 500000) * 100;
              }
            } catch (e) {
              log(`Error checking TG usage for routing: ${e}`);
            }

            let model = '';
            let provider = '';

            try {
              const selectionDoc = await db.collection("tg_model_selection").doc(chatId.toString()).get();
              if (selectionDoc.exists()) {
                const selection = selectionDoc.data();
                model = selection.modelId;
                provider = selection.provider;
                log(`[TG_ROUTING] Using manually selected model: ${model}`);
              } else {
                const route = getSmartRoute(text, usagePercent);
                model = route.model;
                provider = route.provider;
                log(`[TG_ROUTING] Using smart router: ${model}`);
              }
            } catch (e) {
              log(`Error checking TG model selection: ${e}`);
              const route = getSmartRoute(text, usagePercent);
              model = route.model;
              provider = route.provider;
            }

            // Check if sandboxed
            let isSandboxed = false;
            try {
              const sandboxDoc = await db.collection("tg_sandbox").doc(chatId.toString()).get();
              isSandboxed = sandboxDoc.exists() ? sandboxDoc.data()?.enabled : false;
            } catch (e) {}

            let responseText = "";
            let tokensUsed = 0;
            let keySource = "unknown";

            try {
              // Get API Key
              const { apiKey, keySource } = await getAPIKey(linkedUid, provider);
              if (!apiKey) {
                throw new Error(`API Key for ${provider} not found. Please add it in the Settings tab of the web app.`);
              }

              // Get Context
              const context = await getLLMContext(linkedUid);
              
              // Check both Telegram-specific and User-specific system prompts
              const tgSystemDoc = await db.collection("tg_system_prompts").doc(chatId.toString()).get();
              const userSettingsDoc = await db.collection("user_settings").doc(linkedUid).get();
              
              // Priority: Telegram-specific > User-specific > Default
              let customSystemPrompt = tgSystemDoc.exists() ? tgSystemDoc.data()?.prompt : "";
              if (!customSystemPrompt && userSettingsDoc.exists()) {
                customSystemPrompt = userSettingsDoc.data()?.systemPrompt || "";
              }
              
              const baseInstruction = isSandboxed 
                ? "You are in SANDBOXED MODE via Telegram. You MUST ONLY answer based on the provided context (facts and files). If the answer is not in the context, politely state that you don't have that information in your sandbox. DO NOT use your general knowledge about the outside world."
                : "You are a helpful AI assistant with memory via Telegram. Use the provided context to enhance your answers, but you can also use your general knowledge.";

              const systemInstruction = customSystemPrompt 
                ? `${customSystemPrompt}\n\n${baseInstruction}`
                : baseInstruction;

              const fullSystemPrompt = `${systemInstruction}${context}`;
              const localUrl = userSettingsDoc.exists() ? userSettingsDoc.data()?.localUrl : undefined;
              
              // Retry logic with model switching
              let attempts = 0;
              const maxAttempts = 2;
              const triedModels: string[] = [];
              let currentApiKey = apiKey;
              let currentProvider = provider;
              let currentModel = model;
              
              while (attempts < maxAttempts) {
                try {
                  // If it's a retry, we try to get a different model
                  if (attempts > 0) {
                    const route = getSmartRoute(text, 0, false, triedModels);
                    currentModel = route.model;
                    currentProvider = route.provider;
                    
                    // Get the key for the new provider
                    const { apiKey: newKey } = await getAPIKey(linkedUid, currentProvider);
                    if (!newKey && currentProvider !== 'local') {
                      // If no key for the new model, try to find any model we have a key for
                      const providers = ['google', 'openai', 'anthropic', 'groq', 'deepseek', 'mistral', 'xai', 'hypereal', 'local'];
                      for (const p of providers) {
                        if (p === currentProvider) continue;
                        const { apiKey: pKey } = await getAPIKey(linkedUid, p);
                        if (pKey || p === 'local') {
                          currentProvider = p;
                          currentApiKey = pKey;
                          // Pick a model for this provider
                          const registryModel = MODEL_REGISTRY.find(m => m.provider === p && !triedModels.includes(m.id));
                          if (registryModel) {
                            currentModel = registryModel.id;
                            break;
                          }
                        }
                      }
                    } else {
                      currentApiKey = newKey;
                    }
                  }

                  triedModels.push(currentModel);
                  log(`[TG_LLM] Attempt ${attempts + 1}: Using ${currentModel} (${currentProvider})`);

                  const result = await callLLM({
                    prompt: text,
                    provider: currentProvider,
                    model: currentModel,
                    apiKey: currentApiKey,
                    systemPrompt: fullSystemPrompt,
                    localUrl
                  });
                  responseText = result.responseText;
                  tokensUsed = result.tokensUsed;
                  break;
                } catch (llmErr: any) {
                  attempts++;
                  log(`[TG_LLM] Attempt ${attempts} failed: ${llmErr.message}`);
                  if (attempts < maxAttempts) {
                    log(`[TG_LLM] Retrying with different model...`);
                    continue;
                  }
                  responseText = `Error: ${llmErr.message}. All retry attempts failed.`;
                }
              }

              if (!responseText) {
                responseText = "No response generated by the model.";
              }
              
              // Telegram has a 4096 character limit per message
              try {
                if (responseText.length > 4000) {
                  const chunks = responseText.match(/[\s\S]{1,4000}/g) || [];
                  for (const chunk of chunks) {
                    await tgBot.sendMessage(chatId, chunk);
                  }
                } else {
                  await tgBot.sendMessage(chatId, responseText);
                }
              } catch (sendErr: any) {
                console.error("Telegram Send Error:", sendErr);
                await tgBot.sendMessage(chatId, "Error sending response to Telegram: " + (sendErr.message || "Unknown error"));
              }

              // Update Usage
              const today = new Date().toISOString().split('T')[0];
              const sanitizedModel = `${currentProvider}:${currentModel}`.replace(/\./g, '_');
              await db.collection("dailyUsage").doc(`${linkedUid}_${today}`).set({
                tokens: FieldValue.increment(tokensUsed),
                [`modelUsage.${sanitizedModel}`]: FieldValue.increment(tokensUsed),
                timestamp: FieldValue.serverTimestamp()
              }, { merge: true });

              await db.collection("history").add({
                prompt: text,
                response: responseText,
                tokens_used: tokensUsed,
                provider: currentProvider,
                model: `${currentProvider}:${currentModel}`,
                uid: linkedUid,
                conversationId,
                timestamp: FieldValue.serverTimestamp()
              });

            } catch (err: any) {
              console.error("Telegram LLM Error:", err);
              let errorMsg = err.message || "Unknown error";
              
              if (errorMsg.includes("QUOTA_EXCEEDED") || errorMsg.includes("quota") || errorMsg.includes("rate limit") || errorMsg.includes("429")) {
                errorMsg = "⚠️ <b>Quota Exceeded</b>\n\nThe AI model is currently at its limit. Please try again in a few minutes, or use <code>/model</code> to switch to a different provider if you have your own API keys configured.";
                await tgBot.sendMessage(chatId, errorMsg, { parse_mode: 'HTML' });
              } else if (errorMsg.includes("Insufficient Balance") || errorMsg.includes("balance")) {
                errorMsg = "⚠️ <b>Insufficient Balance</b>\n\nYour API provider (e.g., DeepSeek) reports that you have run out of credits. Please top up your account or switch to a different provider.";
                await tgBot.sendMessage(chatId, errorMsg, { parse_mode: 'HTML' });
              } else {
                // Enhanced error reporting for Telegram
                if (errorMsg.includes("API key not valid") || errorMsg.includes("401") || errorMsg.includes("invalid_api_key")) {
                  errorMsg = `Authentication failed. The API Key (from ${keySource}) is invalid. Please update your API key in the web app's Settings tab.`;
                }
                await tgBot.sendMessage(chatId, "❌ Error: " + errorMsg);
              }
            }
          });

          // Handle callback queries (button clicks)
          tgBot.on("callback_query", async (query: any) => {
            const chatId = query.message.chat.id;
            const messageId = query.message.message_id;
            const data = query.data;

            try {
              if (data.startsWith("set_model:")) {
                const selectedId = data.split(":")[1];
                if (selectedId === 'auto') {
                  await db.collection("tg_model_selection").doc(chatId.toString()).delete();
                  await tgBot.answerCallbackQuery(query.id, { text: "Smart Router enabled" });
                  await tgBot.editMessageText("✅ Smart Router enabled (Auto-selection).", {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML'
                  });
                } else {
                  const model = MODEL_REGISTRY.find(m => m.id === selectedId);
                  if (model) {
                    await db.collection("tg_model_selection").doc(chatId.toString()).set({ 
                      modelId: model.id,
                      provider: model.provider,
                      timestamp: Date.now()
                    });
                    await tgBot.answerCallbackQuery(query.id, { text: `Model set to ${model.id}` });
                    await tgBot.editMessageText(`✅ Model set to: <b>${model.id}</b>`, {
                      chat_id: chatId,
                      message_id: messageId,
                      parse_mode: 'HTML'
                    });
                  }
                }
              } else if (data === "toggle_sandbox") {
                const sandboxDoc = await db.collection("tg_sandbox").doc(chatId.toString()).get();
                const isCurrentlySandboxed = sandboxDoc.exists() ? sandboxDoc.data()?.enabled : false;
                const newState = !isCurrentlySandboxed;
                await db.collection("tg_sandbox").doc(chatId.toString()).set({ enabled: newState });
                
                await tgBot.answerCallbackQuery(query.id, { text: newState ? "Sandbox Enabled" : "Sandbox Disabled" });
                await tgBot.editMessageText(newState 
                  ? "🛡️ Sandboxed Mode <b>ENABLED</b>. I will now only answer based on your provided facts and files." 
                  : "🔓 Sandboxed Mode <b>DISABLED</b>. I will use my full knowledge base.", {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML'
                  });
              }
            } catch (e: any) {
              console.error("Callback Query Error:", e);
              await tgBot.answerCallbackQuery(query.id, { text: "Error: " + e.message });
            }
          });

        } catch (err) {
          console.error("Failed to init Telegram Bot instance:", err);
        }
      }
    } catch (err) {
      console.error("Failed to init Telegram Bot (settings fetch):", err);
    } finally {
      isTgInitializing = false;
    }
  };

  try {
    initTelegram();
  } catch (e: any) {
    log(`Failed to start Telegram Bot on startup: ${e.message}`);
  }
  
  app.get("/api/user-settings", async (req, res) => {
    try {
      const { uid } = req.query;
      if (!uid) return res.status(400).json({ error: "UID required" });
      const settingsDoc = await db.collection("user_settings").doc(uid as string).get();
      res.json(settingsDoc.data() || {});
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/user-settings", async (req, res) => {
    try {
      const { uid, systemPrompt } = req.body;
      if (!uid) return res.status(400).json({ error: "UID required" });
      await db.collection("user_settings").doc(uid).set({ systemPrompt }, { merge: true });
      res.json({ status: "ok" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/settings", async (req, res) => {
    try {
      const settingsDoc = await db.collection("settings").doc("global").get();
      res.json({ settings: settingsDoc.data() || {}, bot: tgBotInfo });
    } catch (err: any) {
      log(`Error fetching settings: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const { key, value } = req.body;
      
      if (key === 'telegram_token' && value) {
        const tokenRegex = /^\d+:[A-Za-z0-9_-]+$/;
        if (!tokenRegex.test(value)) {
          return res.status(400).json({ error: "Invalid Telegram Bot Token format." });
        }
        
        // Validate token with Telegram API
        try {
          const response = await fetch(`https://api.telegram.org/bot${value}/getMe`);
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.description || "Invalid token");
          }
          const data = await response.json();
          log(`Validated Telegram token for bot: @${data.result.username}`);
        } catch (tgErr: any) {
          return res.status(400).json({ error: `Telegram Token validation failed: ${tgErr.message}` });
        }
      }

      await db.collection("settings").doc("global").set({ [key]: value }, { merge: true });
      if (key === 'telegram_token') {
        initTelegram();
      }
      res.json({ status: "ok" });
    } catch (err: any) {
      log(`Error saving settings: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/history", async (req, res) => {
    const uid = req.query.uid as string;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    try {
      const snapshot = await db.collection("history")
        .where("uid", "==", uid)
        .orderBy("timestamp", "desc")
        .limit(50)
        .get();
      const rows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(rows);
    } catch (err: any) {
      log(`Error fetching history: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/history", async (req, res) => {
    try {
      const { prompt, response, model, tokens_used, status, uid, conversationId } = req.body;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      const docRef = await db.collection("history").add({
        prompt, response, model, tokens_used, status, uid, conversationId,
        timestamp: FieldValue.serverTimestamp()
      });
      
      const today = new Date().toISOString().split('T')[0];
      const usageRef = db.collection("dailyUsage").doc(`${uid}_${today}`);
      
      // Sanitize model name for Firestore field (no dots)
      const sanitizedModel = model.replace(/\./g, '_');
      
      await usageRef.set({ 
        tokens: FieldValue.increment(tokens_used),
        [`modelUsage.${sanitizedModel}`]: FieldValue.increment(tokens_used),
        date: today, 
        uid,
        timestamp: FieldValue.serverTimestamp()
      }, { merge: true });

      res.json({ id: docRef.id });
    } catch (err: any) {
      log(`Error saving history: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/history/group/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { uid } = req.query;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      log(`Deleting history group: ${id} for user: ${uid}`);

      if (id.startsWith('legacy_')) {
        // For legacy groups, we don't have a conversationId, so we delete by proximity
        // But it's safer to just delete the specific messages that were grouped.
        // For now, let's just return an error or implement a simple version.
        res.status(400).json({ error: "Deleting legacy groups is not supported. Please delete individual messages if available." });
        return;
      }

      const snapshot = await db.collection("history")
        .where("uid", "==", uid)
        .where("conversationId", "==", id)
        .get();
      
      if (snapshot.empty) {
        return res.json({ status: "ok", deleted: 0 });
      }

      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      
      res.json({ status: "ok", deleted: snapshot.size });
    } catch (err: any) {
      log(`Error deleting history group: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/usage", async (req, res) => {
    try {
      const uid = req.query.uid as string;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      const today = new Date().toISOString().split('T')[0];
      const usageDoc = await db.collection("dailyUsage").doc(`${uid}_${today}`).get();
      const data = usageDoc.data();
      res.json({ 
        tokens: data?.tokens || 0,
        modelUsage: data?.modelUsage || {},
        date: today
      });
    } catch (err: any) {
      log(`Error fetching usage: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/smart-route", async (req, res) => {
    try {
      const { prompt, uid, hasMedia, excludeModels } = req.body;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      const today = new Date().toISOString().split('T')[0];
      const usageDoc = await db.collection("dailyUsage").doc(`${uid}_${today}`).get();
      const tokens = usageDoc.data()?.tokens || 0;
      const usagePercent = (tokens / 500000) * 100; // Assuming 500k limit

      const availableProviders = await getAvailableProviders(uid);
      const route = getSmartRoute(prompt, usagePercent, hasMedia, excludeModels, availableProviders);
      res.json(route);
    } catch (err: any) {
      log(`Error in smart route: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/summarize", async (req, res) => {
    try {
      const { messages, uid } = req.body;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      if (!messages || messages.length === 0) return res.status(400).json({ error: "No messages to summarize" });

      // Get Google API Key with robust fallback and placeholder check
      let apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
      let keySource = "environment variable";

      // If env key is missing or is a placeholder, try Firestore
      if (!apiKey || apiKey.startsWith("MY_")) {
        const keyDoc = await db.collection("apiKeys").doc(`${uid}_google`).get();
        if (keyDoc.exists) {
          apiKey = keyDoc.data()?.key?.trim();
          keySource = "firestore";
        } else {
          // Fallback to legacy collection query
          const keySnap = await db.collection("apiKeys").where("uid", "==", uid).where("provider", "==", "google").get();
          if (!keySnap.empty) {
            apiKey = keySnap.docs[0].data().key?.trim();
            keySource = "firestore (legacy)";
          }
        }
      }

      // Final check for valid key
      if (!apiKey || apiKey.startsWith("MY_")) {
        return res.status(400).json({ 
          error: "Valid Google API Key not found. Please add your own Gemini API key in Settings to use the summarization feature." 
        });
      }

      log(`[SUMMARIZE] Using API Key from ${keySource} for user ${uid}`);

      // Format history into a single string to avoid Gemini role issues (alternating roles requirement)
      // This is the most robust way to summarize a conversation history.
      const historyText = messages.map((m: any) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
      const prompt = `Please provide a concise summary of the following conversation history:\n\n${historyText}\n\nFocus on the main topics discussed and any key conclusions or requests. The summary should be suitable for quick review or for providing context to another LLM.`;
      const systemPrompt = "You are a helpful assistant that specializes in summarizing conversations accurately and concisely.";
      
      const { responseText } = await callLLM({
        prompt,
        provider: 'google',
        model: 'gemini-3-flash-preview',
        messages: [], // Pass empty history to avoid role issues in callLLM
        apiKey,
        systemPrompt
      });

      res.json({ summary: responseText });
    } catch (err: any) {
      log(`Error in summarize: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // API Keys Management
  app.get("/api/settings", async (req, res) => {
    try {
      const uid = req.query.uid as string;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      const doc = await db.collection("settings").doc(uid).get();
      res.json(doc.data() || {});
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/settings", async (req, res) => {
    try {
      const { uid, ...settings } = req.body;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      await db.collection("settings").doc(uid).set(settings, { merge: true });
      res.json({ status: "ok" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/available-providers", async (req, res) => {
    try {
      const uid = req.query.uid as string;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      const providers = await getAvailableProviders(uid);
      res.json({ providers });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/keys", async (req, res) => {
    try {
      const uid = req.query.uid as string;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      const snapshot = await db.collection("apiKeys").where("uid", "==", uid).get();
      const rows = snapshot.docs.map(doc => doc.data());
      
      const masked = rows.map((r: any) => ({
        provider: r.provider,
        key: r.key ? `${r.key.substring(0, 4)}...${r.key.substring(r.key.length - 4)}` : ""
      }));
      res.json(masked);
    } catch (err: any) {
      log(`Error fetching keys: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/keys", async (req, res) => {
    const { provider, uid } = req.body;
    const key = req.body.key?.trim();
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    if (!key) return res.status(400).json({ error: "API key is required" });

    try {
      // Validate key before saving
      if (provider === 'google') {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey: key });
        await ai.models.generateContent({ model: "gemini-3-flash-preview", contents: "hi" });
      } else if (['openai', 'xai', 'groq', 'deepseek', 'mistral', 'hypereal', 'github'].includes(provider)) {
        let testUrl = "";
        let method = "GET";
        let body: any = null;
        
        if (provider === 'openai') testUrl = "https://api.openai.com/v1/models";
        else if (provider === 'xai') testUrl = "https://api.x.ai/v1/models";
        else if (provider === 'groq') testUrl = "https://api.groq.com/openai/v1/models";
        else if (provider === 'deepseek') testUrl = "https://api.deepseek.com/models";
        else if (provider === 'mistral') testUrl = "https://api.mistral.ai/v1/models";
        else if (provider === 'github') testUrl = "https://models.inference.ai.azure.com/models";
        else if (provider === 'hypereal') {
          testUrl = "https://api.hypereal.tech/api/v1/images/generate";
          method = "POST";
          body = {
            prompt: "hi",
            n: 1,
            size: "1024x1024"
          };
        }

        const response = await fetch(testUrl, {
          method: method,
          headers: {
            "Authorization": `Bearer ${key}`,
            "Accept": "application/json",
            ...(method === "POST" ? { "Content-Type": "application/json" } : {})
          },
          ...(body ? { body: JSON.stringify(body) } : {})
        });
        
        if (!response.ok) {
          let errorMessage = "";
          try {
            const errorData = await response.json();
            errorMessage = errorData.error?.message || errorData.message || (typeof errorData === 'string' ? errorData : JSON.stringify(errorData));
          } catch (e) {
            // If not JSON, get the raw text
            const rawText = await response.text().catch(() => "");
            errorMessage = rawText || `HTTP ${response.status}: ${response.statusText}`;
          }
          
          if (response.status === 401) {
            throw new Error(`Invalid ${provider.toUpperCase()} API Key. Please verify it in your dashboard.`);
          }

          // If it's a balance issue, we still consider the key "valid" in terms of authentication
          const isBalanceError = errorMessage.toLowerCase().includes("balance") || 
                               errorMessage.toLowerCase().includes("credit") ||
                               response.status === 402;
                               
          if (isBalanceError) {
            console.warn(`API Key for ${provider} has insufficient balance, but the key is valid.`);
          } else {
            throw new Error(`${provider.toUpperCase()} Error: ${errorMessage}`);
          }
        }
      } else if (provider === 'anthropic') {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model: "claude-3-haiku-20240307",
            max_tokens: 5,
            messages: [{ role: "user", content: "hi" }]
          })
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
        }
      }

      await db.collection("apiKeys").doc(`${uid}_${provider}`).set({ provider, key, uid }, { merge: true });
      res.json({ status: "ok" });
    } catch (err: any) {
      res.status(400).json({ error: `Validation failed: ${err.message}` });
    }
  });

  app.delete("/api/keys/:provider", async (req, res) => {
    try {
      const uid = req.query.uid as string;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      await db.collection("apiKeys").doc(`${uid}_${req.params.provider}`).delete();
      res.json({ status: "ok" });
    } catch (err: any) {
      log(`Error deleting key: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Facts Management (Memory)
  app.get("/api/facts", async (req, res) => {
    try {
      const uid = req.query.uid as string;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      const snapshot = await db.collection("facts")
        .where("uid", "==", uid)
        .orderBy("timestamp", "desc")
        .get();
      const rows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(rows);
    } catch (err: any) {
      log(`Error fetching facts: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/facts", async (req, res) => {
    try {
      const { content, uid } = req.body;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      const docRef = await db.collection("facts").add({ 
        content, 
        uid, 
        timestamp: FieldValue.serverTimestamp() 
      });
      res.json({ id: docRef.id });
    } catch (err: any) {
      log(`Error saving fact: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/facts/:id", async (req, res) => {
    try {
      await db.collection("facts").doc(req.params.id).delete();
      res.json({ status: "ok" });
    } catch (err: any) {
      log(`Error deleting fact: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/validate-provider", async (req, res) => {
    const { provider, model, uid } = req.body;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    try {
      const keyDoc = await db.collection("apiKeys").doc(`${uid}_${provider}`).get();
      let apiKey = keyDoc.data()?.key?.trim();
      let keySource = "firestore";

      if (!apiKey) {
        apiKey = process.env[`${provider.toUpperCase()}_API_KEY`]?.trim();
        keySource = "environment variable";
      }

      if (provider === 'google' && (!apiKey || keySource === "environment variable")) {
        const systemKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        if (systemKey && (!apiKey || apiKey === systemKey)) {
          apiKey = systemKey;
          keySource = "system default/env";
        }
      }

      if (!apiKey) {
        return res.status(400).json({ error: `API Key for ${provider} not found.` });
      }

      log(`[VALIDATE] Checking ${provider}/${model} for user ${uid}...`);

      if (provider === 'google') {
        const { GoogleGenAI } = await import("@google/genai");
        const ai = new GoogleGenAI({ apiKey });
        // Minimal request to check health
        await ai.models.generateContent({
          model: model,
          contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
          config: { maxOutputTokens: 1 }
        });
      } else if (['openai', 'xai', 'groq', 'deepseek', 'mistral', 'hypereal'].includes(provider)) {
        let baseUrl = "";
        if (provider === 'openai') baseUrl = "https://api.openai.com/v1/chat/completions";
        else if (provider === 'xai') baseUrl = "https://api.x.ai/v1/chat/completions";
        else if (provider === 'groq') baseUrl = "https://api.groq.com/openai/v1/chat/completions";
        else if (provider === 'deepseek') baseUrl = "https://api.deepseek.com/chat/completions";
        else if (provider === 'mistral') baseUrl = "https://api.mistral.ai/v1/chat/completions";
        else if (provider === 'hypereal') baseUrl = "https://api.hypereal.tech/api/v1/chat/completions";

        const response = await fetch(baseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({ 
            model, 
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const message = errorData.error?.message || response.statusText;
          throw new Error(`${provider.toUpperCase()} Validation Error: ${message}`);
        }
      } else if (provider === 'anthropic') {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01"
          },
          body: JSON.stringify({
            model,
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }]
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const message = errorData.error?.message || response.statusText;
          throw new Error(`Anthropic Validation Error: ${message}`);
        }
      } else if (provider === 'local') {
        const settingsDoc = await db.collection("settings").doc(uid).get();
        const localUrl = settingsDoc.data()?.localUrl || "http://localhost:11434";
        const endpoint = `${localUrl.replace(/\/$/, '')}/v1/chat/completions`;
        
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            model: "ping", 
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1
          })
        });

        if (!response.ok) {
          throw new Error(`Local LLM Validation Error: ${response.statusText}`);
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      let message = err.message || String(err || 'Unknown error');
      
      // Try to parse JSON error from SDKs (common in Gemini/OpenAI)
      try {
        if (message.startsWith('{') || message.includes('{"error":')) {
          const jsonStart = message.indexOf('{');
          const jsonStr = message.substring(jsonStart);
          const parsed = JSON.parse(jsonStr);
          if (parsed.error && parsed.error.message) {
            message = parsed.error.message;
          } else if (parsed.message) {
            message = parsed.message;
          }
        }
      } catch (e) {
        // Not JSON or parse failed, keep original message
      }

      log(`[VALIDATE] Error: ${message}`);
      
      const lowerMsg = message.toLowerCase();
      if (lowerMsg.includes("quota") || lowerMsg.includes("429") || lowerMsg.includes("limit") || lowerMsg.includes("resource_exhausted")) {
        res.status(429).json({ error: "LLM Quota exceeded. Please try again later or use a different provider." });
      } else if (lowerMsg.includes("api key") || lowerMsg.includes("unauthorized") || lowerMsg.includes("401")) {
        res.status(401).json({ error: message });
      } else {
        res.status(500).json({ error: message });
      }
    }
  });

  app.post("/api/proxy-request", async (req, res) => {
    const { prompt, provider, model, messages, uid, media, sandboxed, systemPrompt } = req.body;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });

    try {
      // 1. Fetch User Settings
      const settingsDoc = await db.collection("settings").doc(uid).get();
      const settings = settingsDoc.data() || {};
      const useMemory = settings.useMemory !== false;
      const localUrl = settings.localUrl || "http://localhost:11434";

      // 2. Get API Key
      const { apiKey, keySource } = await getAPIKey(uid, provider);
      if (apiKey) {
        log(`[PROXY] Using ${provider} API Key (Source: ${keySource})`);
      }

      if (!apiKey && provider !== 'local') {
        return res.status(400).json({ error: `API Key for ${provider} not found.` });
      }

      // 3. Prepare Context
      let context = "";
      if (useMemory) {
        context = await getLLMContext(uid);
      }

      const baseInstruction = sandboxed 
        ? "You are running in a sandboxed environment. You can help with code, but cannot access external resources directly unless specified." 
        : "You are a highly capable AI assistant.";
      
      const fullSystemPrompt = `${systemPrompt ? systemPrompt + "\n\n" : ""}${baseInstruction}${context}`;

      // 4. Call LLM
      const result = await callLLM({
        prompt,
        provider,
        model,
        messages,
        apiKey: apiKey || "",
        systemPrompt: fullSystemPrompt,
        media,
        localUrl
      });

      // 5. Return result
      res.json({ text: result.responseText, tokensUsed: result.tokensUsed });
    } catch (err: any) {
      const message = err.message || String(err || 'Unknown error');
      log(`[PROXY] Error: ${message}`);
      
      const lowerMsg = message.toLowerCase();
      if (lowerMsg.includes("api key") || lowerMsg.includes("unauthorized") || lowerMsg.includes("401")) {
        res.status(401).json({ error: message });
      } else if (lowerMsg.includes("insufficient balance") || lowerMsg.includes("balance") || lowerMsg.includes("402")) {
        res.status(402).json({ error: "Insufficient balance for this LLM provider. Please check your account credits." });
      } else if (lowerMsg.includes("quota") || lowerMsg.includes("429") || lowerMsg.includes("limit") || lowerMsg.includes("resource_exhausted")) {
        res.status(429).json({ error: "LLM Quota exceeded. Please try again later or use a different provider." });
      } else if (lowerMsg.includes("not found") || lowerMsg.includes("404")) {
        res.status(404).json({ error: `Model '${model}' not found for provider '${provider}'.` });
      } else {
        res.status(500).json({ error: `LLM Proxy Error: ${message}` });
      }
    }
  });

  app.post("/api/send-email", async (req, res) => {
    try {
      const { accessToken, to, subject, body, uid } = req.body;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });
      if (!accessToken) return res.status(400).json({ error: "Google access token required. Please sign in again." });

      const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
      const messageParts = [
        `To: ${to}`,
        'Content-Type: text/html; charset=utf-8',
        'MIME-Version: 1.0',
        `Subject: ${utf8Subject}`,
        '',
        body,
      ];
      const message = messageParts.join('\n');

      const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          raw: encodedMessage,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || "Failed to send email via Gmail API. Your session might have expired, please try signing out and back in.");
      }

      res.json({ success: true });
    } catch (err: any) {
      log(`Error sending email: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/extract-facts", async (req, res) => {
    const { prompt, response, uid } = req.body;
    if (!uid || !prompt || !response) return res.status(400).json({ error: "Missing data" });

    try {
      const settingsDoc = await db.collection("settings").doc(uid).get();
      const settings = settingsDoc.data() || {};
      if (settings.autoMemory === false) return res.json({ success: true, skipped: true });

      const existingFactsSnap = await db.collection("facts").where("uid", "==", uid).get();
      const existingFacts = existingFactsSnap.docs.map((d: any) => d.data().content);

      const extractionPrompt = `
        You are a personal memory assistant. Your task is to extract short, concise personal facts about the user from the following interaction.
        
        EXISTING FACTS:
        ${existingFacts.length > 0 ? existingFacts.map((f: string) => `- ${f}`).join("\n") : "None yet."}

        Guidelines:
        - Extract ONLY new information that is NOT already in the "EXISTING FACTS" list.
        - If the information is a more detailed version of an existing fact, extract it (e.g., "Lives in Harish" -> "Lives in Harish, Israel").
        - If the information is already covered by an existing fact, IGNORE it.
        - Be extremely concise (max 10 words per fact).
        - Ignore temporary context (e.g., "I'm hungry right now").
        - Return ONLY a valid JSON array of strings.
        - If no new permanent facts are found, return [].
        
        USER: ${prompt}
        AI: ${response}
        
        JSON Output:`;

      log(`[EXTRACT] Request for UID: ${uid}`);
      const keyDoc = await db.collection("apiKeys").doc(`${uid}_google`).get();
      log(`[EXTRACT] Key doc exists: ${keyDoc.exists}`);
      let apiKey = keyDoc.data()?.key?.trim();
      let keySource = "firestore";
      if (apiKey) {
        log(`[EXTRACT] Found key in Firestore: ${apiKey.substring(0, 4)}...`);
      }

      if (!apiKey) {
        apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        keySource = "system default/env";
      }

      if (!apiKey || apiKey.startsWith("MY_")) {
        // If it looks like a placeholder, try to find ANY google key in the environment
        apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY;
        keySource = "env fallback";
      }

      if (!apiKey) throw new Error("Missing Gemini API Key for extraction");
      log(`[EXTRACT] Using API Key: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)} (Source: ${keySource})`);

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });
      
      log(`[EXTRACT] Extracting facts for user ${uid}...`);
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: extractionPrompt
      });
      const text = result.text || "";
      log(`[EXTRACT] Raw response: ${text}`);
      
      let facts: string[] = [];
      try {
        const jsonMatch = text.match(/\[.*\]/s);
        if (jsonMatch) {
          facts = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        log(`[EXTRACT] Failed to parse JSON: ${text}`);
      }

      if (facts.length > 0) {
        const batch = db.batch();
        let addedCount = 0;
        facts.forEach(content => {
          // Final check for duplicates (case-insensitive and trimmed)
          const isDuplicate = existingFacts.some((ef: string) => ef.toLowerCase().trim() === content.toLowerCase().trim());
          if (!isDuplicate) {
            const factRef = db.collection("facts").doc();
            batch.set(factRef, {
              uid,
              content,
              timestamp: Timestamp.now()
            });
            addedCount++;
          }
        });
        if (addedCount > 0) {
          await batch.commit();
          log(`Extracted ${addedCount} new facts for user ${uid}`);
        } else {
          log(`No new unique facts found for user ${uid}`);
        }
        res.json({ success: true, count: addedCount });
      } else {
        res.json({ success: true, count: 0 });
      }
    } catch (err: any) {
      const errMessage = err.message || "";
      if (errMessage.toLowerCase().includes("quota") || errMessage.includes("429") || errMessage.includes("RESOURCE_EXHAUSTED")) {
        log(`[EXTRACT] Quota exceeded for fact extraction. Skipping...`);
        return res.status(429).json({ error: "Quota exceeded", code: "QUOTA_EXHAUSTED" });
      }
      log(`Error extracting facts: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/facts/cleanup", async (req, res) => {
    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: "Missing UID" });

    try {
      const factsSnap = await db.collection("facts").where("uid", "==", uid).get();
      if (factsSnap.empty) return res.json({ success: true, count: 0 });

      const facts = factsSnap.docs.map((d: any) => ({ id: d.id, content: d.data().content }));
      
      const cleanupPrompt = `
        You are a data cleaning assistant. Below is a list of personal facts about a user.
        Some facts might be duplicates or very similar (e.g., "Lives in Harish" and "Lives in Harish, Israel").
        Your task is to merge them into a single, most descriptive version.
        
        FACTS:
        ${facts.map((f, i) => `${i}: ${f.content}`).join("\n")}
        
        Return a JSON object with:
        - "merged": A list of unique, cleaned facts (strings).
        - "toDelete": A list of indices from the original list that should be removed because they are now redundant.
        
        Guidelines:
        - Keep the most detailed version if they overlap.
        - If facts are unrelated, keep both.
        - Return ONLY valid JSON.
      `;

      const keyDoc = await db.collection("apiKeys").doc(`${uid}_google`).get();
      let apiKey = keyDoc.data()?.key?.trim() || process.env.GEMINI_API_KEY || process.env.API_KEY;
      
      if (!apiKey) throw new Error("Missing API Key for cleanup");

      const { GoogleGenAI } = await import("@google/genai");
      const ai = new GoogleGenAI({ apiKey });
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: cleanupPrompt,
        config: { responseMimeType: "application/json" }
      });

      const data = JSON.parse(result.text || "{}");
      const { merged, toDelete } = data;

      if (merged && Array.isArray(merged)) {
        const batch = db.batch();
        
        // Delete all old facts for this user to start fresh with merged ones
        // (Safer than trying to map indices back perfectly)
        factsSnap.docs.forEach((doc: any) => batch.delete(doc.ref));
        
        // Add merged facts
        merged.forEach((content: string) => {
          const factRef = db.collection("facts").doc();
          batch.set(factRef, {
            uid,
            content,
            timestamp: Timestamp.now()
          });
        });
        
        await batch.commit();
        log(`Cleaned up facts for user ${uid}. Reduced ${facts.length} to ${merged.length}.`);
        res.json({ success: true, originalCount: facts.length, newCount: merged.length });
      } else {
        res.json({ success: true, count: 0, message: "No changes needed" });
      }
    } catch (err: any) {
      log(`Error cleaning up facts: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // Global Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Global Error Handler:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal Server Error",
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    log("Initializing Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    log("Vite middleware initialized.");
  } else {
    log("Serving static files from dist...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    log(`Server running on http://localhost:${PORT}`);
    
    // Background Health Check (every 5 minutes)
    setInterval(() => {
      log("Running background health check...");
      initTelegram().catch(err => log(`Health check failed: ${err.message}`));
    }, 5 * 60 * 1000);
  });
}

log("Calling startServer()...");
startServer().catch(err => {
  log(`CRITICAL: Failed to start server: ${err.message}`);
});
