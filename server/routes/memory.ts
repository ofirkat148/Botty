import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDatabase } from '../db/index.js';
import { facts, history, memoryFiles, memoryUrls, settings, userSettings } from '../db/schema.js';
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { consolidateFactRows, getAvailableProviders, getDefaultModel, getProviderApiKey, getRuntimeSettings, callLLM, reconcileFactsForUser, reconcileFactsForUserScoped, saveFactsWithConsolidation } from '../utils/llm.js';
import { listCustomAgentsForUser, replaceCustomAgentsForUser } from '../utils/agents.js';

const router = Router();
router.use(authMiddleware);

function parseTimestamp(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return new Date();
  }

  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? new Date() : timestamp;
}

router.get('/export', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;

    const [userFacts, userFiles, userUrls, userSettingsRow, userPromptSettings, userHistory] = await Promise.all([
      db.select().from(facts).where(eq(facts.uid, uid)).orderBy(desc(facts.timestamp)),
      db.select().from(memoryFiles).where(eq(memoryFiles.uid, uid)).orderBy(desc(memoryFiles.timestamp)),
      db.select().from(memoryUrls).where(eq(memoryUrls.uid, uid)).orderBy(desc(memoryUrls.timestamp)),
      db.select().from(settings).where(eq(settings.uid, uid)).limit(1),
      db.select().from(userSettings).where(eq(userSettings.uid, uid)).limit(1),
      db.select().from(history).where(eq(history.uid, uid)).orderBy(desc(history.timestamp)).limit(200),
    ]);
    const customAgents = await listCustomAgentsForUser(uid);

    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      memory: {
        facts: userFacts,
        files: userFiles,
        urls: userUrls,
      },
      settings: userSettingsRow[0] || {
        uid,
        localUrl: null,
        useMemory: true,
        autoMemory: true,
        sandboxMode: false,
      },
      userSettings: userPromptSettings[0] || {
        uid,
        systemPrompt: null,
        customSkills: [],
        customBots: customAgents,
      },
      history: userHistory,
    };

    if (payload.userSettings) {
      payload.userSettings.customBots = customAgents;
      // Parse JSON string fields so the exported object is usable as-is
      for (const key of ['conversationLabels', 'conversationModels', 'pinnedConversations'] as const) {
        const val = (payload.userSettings as Record<string, unknown>)[key];
        if (typeof val === 'string') {
          try { (payload.userSettings as Record<string, unknown>)[key] = JSON.parse(val); } catch { /* leave as string */ }
        }
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="botty-memory-backup-${timestamp}.json"`);
    res.json(payload);
  } catch (error) {
    console.error('Error exporting memory backup:', error);
    res.status(500).json({ error: 'Failed to export memory backup' });
  }
});

router.post('/import', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;
    const payload = req.body || {};
    const hasMemorySection = payload?.memory && typeof payload.memory === 'object';
    const hasHistorySection = Array.isArray(payload?.history);

    const incomingFacts = Array.isArray(payload?.memory?.facts) ? payload.memory.facts : [];
    const incomingFiles = Array.isArray(payload?.memory?.files) ? payload.memory.files : [];
    const incomingUrls = Array.isArray(payload?.memory?.urls) ? payload.memory.urls : [];
    const incomingHistory = Array.isArray(payload?.history) ? payload.history : [];
    const incomingSettings = payload?.settings && typeof payload.settings === 'object' ? payload.settings : null;
    const incomingUserSettings = payload?.userSettings && typeof payload.userSettings === 'object' ? payload.userSettings : null;

    const factRows = incomingFacts
      .map((item: any) => ({
        id: randomUUID(),
        uid,
        botId: typeof item?.botId === 'string' && item.botId.trim() ? String(item.botId).trim() : null,
        content: String(item?.content || '').trim(),
        isSkill: Boolean(item?.isSkill),
        timestamp: parseTimestamp(item?.timestamp),
      }))
      .filter(item => item.content);

    const consolidatedFactRows = consolidateFactRows(factRows);

    const fileRows = incomingFiles
      .map((item: any) => ({
        id: randomUUID(),
        uid,
        name: String(item?.name || '').trim(),
        content: String(item?.content || ''),
        type: item?.type ? String(item.type) : 'text/plain',
        size: typeof item?.size === 'number' ? item.size : String(item?.content || '').length,
        isSkill: Boolean(item?.isSkill),
        timestamp: parseTimestamp(item?.timestamp),
      }))
      .filter(item => item.name && item.content);

    const urlRows = incomingUrls
      .map((item: any) => ({
        id: randomUUID(),
        uid,
        url: String(item?.url || '').trim(),
        title: item?.title ? String(item.title) : null,
        timestamp: parseTimestamp(item?.timestamp),
      }))
      .filter(item => item.url);

    const historyRows = incomingHistory
      .map((item: any) => ({
        id: randomUUID(),
        uid,
        prompt: String(item?.prompt || '').trim(),
        response: String(item?.response || '').trim(),
        model: String(item?.model || '').trim() || 'unknown',
        tokensUsed: typeof item?.tokensUsed === 'number' ? item.tokensUsed : null,
        status: item?.status ? String(item.status) : 'completed',
        conversationId: item?.conversationId ? String(item.conversationId) : null,
        timestamp: parseTimestamp(item?.timestamp),
      }))
      .filter(item => item.prompt && item.response);

    // Execute sequentially — better-sqlite3 does not support async transactions
    if (hasMemorySection) {
      await db.delete(facts).where(eq(facts.uid, uid));
      await db.delete(memoryFiles).where(eq(memoryFiles.uid, uid));
      await db.delete(memoryUrls).where(eq(memoryUrls.uid, uid));
    }

    if (hasHistorySection) {
      await db.delete(history).where(eq(history.uid, uid));
    }

    if (consolidatedFactRows.length > 0) {
      await db.insert(facts).values(consolidatedFactRows).onConflictDoNothing();
    }

    if (fileRows.length > 0) {
      await db.insert(memoryFiles).values(fileRows).onConflictDoNothing();
    }

    if (urlRows.length > 0) {
      await db.insert(memoryUrls).values(urlRows).onConflictDoNothing();
    }

    if (historyRows.length > 0) {
      await db.insert(history).values(historyRows).onConflictDoNothing();
    }

    if (incomingSettings) {
      const settingsValues = {
        uid,
        localUrl: incomingSettings.localUrl ? String(incomingSettings.localUrl) : null,
        useMemory: incomingSettings.useMemory !== false,
        autoMemory: incomingSettings.autoMemory !== false,
        sandboxMode: incomingSettings.sandboxMode === true,
        updatedAt: new Date().toISOString(),
      };
      const existing = await db.select().from(settings).where(eq(settings.uid, uid)).limit(1);
      if (existing.length > 0) {
        await db.update(settings).set(settingsValues).where(eq(settings.uid, uid));
      } else {
        await db.insert(settings).values(settingsValues);
      }
    }

    if (incomingUserSettings) {
      const incomingLabels = incomingUserSettings.conversationLabels &&
        typeof incomingUserSettings.conversationLabels === 'object' &&
        !Array.isArray(incomingUserSettings.conversationLabels)
        ? incomingUserSettings.conversationLabels
        : null;
      const incomingModels = incomingUserSettings.conversationModels &&
        typeof incomingUserSettings.conversationModels === 'object' &&
        !Array.isArray(incomingUserSettings.conversationModels)
        ? incomingUserSettings.conversationModels
        : null;

      const userSettingsValues = {
        uid,
        systemPrompt: incomingUserSettings.systemPrompt ? String(incomingUserSettings.systemPrompt) : null,
        customSkills: Array.isArray(incomingUserSettings.customSkills) ? JSON.stringify(incomingUserSettings.customSkills) : null,
        customBots: null,
        conversationLabels: incomingLabels ? JSON.stringify(incomingLabels) : null,
        conversationModels: incomingModels ? JSON.stringify(incomingModels) : null,
        updatedAt: new Date().toISOString(),
      };
      const existingUS = await db.select().from(userSettings).where(eq(userSettings.uid, uid)).limit(1);
      if (existingUS.length > 0) {
        await db.update(userSettings).set(userSettingsValues).where(eq(userSettings.uid, uid));
      } else {
        await db.insert(userSettings).values(userSettingsValues);
      }
    }

    if (incomingUserSettings) {
      await replaceCustomAgentsForUser(uid, incomingUserSettings.customBots);
    }

    res.json({
      success: true,
      mode: 'replace',
      imported: {
      facts: consolidatedFactRows.length,
        files: fileRows.length,
        urls: urlRows.length,
        history: historyRows.length,
      },
    });
  } catch (error) {
    console.error('Error restoring memory backup:', error);
    res.status(500).json({ error: 'Failed to restore memory backup' });
  }
});

// Facts endpoints
router.get('/facts', async (req: Request, res: Response) => {
  try {
    const uid = req.userId!;
    const botId = typeof req.query.botId === 'string' && req.query.botId.trim()
      ? req.query.botId.trim()
      : null;

    const userFacts = botId
      ? await reconcileFactsForUserScoped(uid, botId)
      : await reconcileFactsForUser(uid);

    userFacts.sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());

    res.json(userFacts);
  } catch (error) {
    console.error('Error fetching facts:', error);
    res.status(500).json({ error: 'Failed to fetch facts' });
  }
});

router.post('/facts', async (req: Request, res: Response) => {
  try {
    const { content, isSkill } = req.body;
    const uid = req.userId!;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const savedFacts = await saveFactsWithConsolidation(uid, [{
      content: String(content),
      isSkill: Boolean(isSkill),
      timestamp: new Date(),
    }]);

    res.json({ success: true, facts: savedFacts });
  } catch (error) {
    console.error('Error creating fact:', error);
    res.status(500).json({ error: 'Failed to create fact' });
  }
});

// DELETE /api/memory/facts/agent/:botId — clear all isolated facts for a specific agent (must come before /facts/:id)
router.delete('/facts/agent/:botId', async (req: Request, res: Response) => {
  try {
    const { botId } = req.params;
    const db = getDatabase();
    const uid = req.userId!;

    if (!botId || !botId.trim()) {
      return res.status(400).json({ error: 'botId is required' });
    }

    await db
      .delete(facts)
      .where(and(eq(facts.uid, uid), eq(facts.botId, botId.trim())));

    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing agent facts:', error);
    res.status(500).json({ error: 'Failed to clear agent facts' });
  }
});

// GET /api/memory/facts/agent-counts — total isolated (agent-scoped) fact count for the user (must come before /facts/:id)
router.get('/facts/agent-counts', async (req: Request, res: Response) => {
  try {
    const uid = req.userId!;
    const db = getDatabase();

    const rows = await db
      .select({ botId: facts.botId, total: sql<number>`cast(count(*) as int)` })
      .from(facts)
      .where(and(eq(facts.uid, uid), isNotNull(facts.botId)))
      .groupBy(facts.botId);

    const counts: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      if (row.botId) {
        counts[row.botId] = row.total;
        total += row.total;
      }
    }

    res.json({ total, counts });
  } catch (error) {
    console.error('Error fetching agent fact counts:', error);
    res.status(500).json({ error: 'Failed to fetch agent fact counts' });
  }
});

router.delete('/facts/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    const uid = req.userId!;

    await db
      .delete(facts)
      .where(and(eq(facts.id, id), eq(facts.uid, uid)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting fact:', error);
    res.status(500).json({ error: 'Failed to delete fact' });
  }
});

// Memory Files endpoints
router.get('/files', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;

    const files = await db
      .select()
      .from(memoryFiles)
      .where(eq(memoryFiles.uid, uid))
      .orderBy(desc(memoryFiles.timestamp));

    res.json(files);
  } catch (error) {
    console.error('Error fetching memory files:', error);
    res.status(500).json({ error: 'Failed to fetch memory files' });
  }
});

router.post('/files', async (req: Request, res: Response) => {
  try {
    const { name, content, type, isSkill } = req.body;
    const db = getDatabase();
    const uid = req.userId!;

    if (!name || !content) {
      return res.status(400).json({ error: 'Name and content are required' });
    }

    const MAX_MEMORY_FILE_BYTES = 10_000_000; // 10 MB
    if (typeof content === 'string' && content.length > MAX_MEMORY_FILE_BYTES) {
      return res.status(413).json({ error: 'File content exceeds the 10 MB limit' });
    }

    const id = randomUUID();
    const newFile = {
      id,
      uid,
      name,
      content,
      type: type || 'text/plain',
      size: content.length,
      isSkill: isSkill || false,
      timestamp: new Date().toISOString(),
    };

    await db.insert(memoryFiles).values(newFile);
    res.json(newFile);
  } catch (error) {
    console.error('Error creating memory file:', error);
    res.status(500).json({ error: 'Failed to create memory file' });
  }
});

router.delete('/files/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    const uid = req.userId!;

    await db
      .delete(memoryFiles)
      .where(and(eq(memoryFiles.id, id), eq(memoryFiles.uid, uid)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting memory file:', error);
    res.status(500).json({ error: 'Failed to delete memory file' });
  }
});

// Memory URLs endpoints
router.get('/urls', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;

    const urls = await db
      .select()
      .from(memoryUrls)
      .where(eq(memoryUrls.uid, uid))
      .orderBy(desc(memoryUrls.timestamp));

    res.json(urls);
  } catch (error) {
    console.error('Error fetching memory URLs:', error);
    res.status(500).json({ error: 'Failed to fetch memory URLs' });
  }
});

router.post('/urls', async (req: Request, res: Response) => {
  try {
    const { url, title } = req.body;
    const db = getDatabase();
    const uid = req.userId!;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const id = randomUUID();
    const newUrl = {
      id,
      uid,
      url,
      title: title || null,
      timestamp: new Date().toISOString(),
    };

    await db.insert(memoryUrls).values(newUrl);
    res.json(newUrl);
  } catch (error) {
    console.error('Error creating memory URL:', error);
    res.status(500).json({ error: 'Failed to create memory URL' });
  }
});

router.delete('/urls/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = getDatabase();
    const uid = req.userId!;

    await db
      .delete(memoryUrls)
      .where(and(eq(memoryUrls.id, id), eq(memoryUrls.uid, uid)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting memory URL:', error);
    res.status(500).json({ error: 'Failed to delete memory URL' });
  }
});

// POST /api/memory/suggest — extract a memorable fact from an assistant message using LLM
router.post('/suggest', async (req: Request, res: Response) => {
  try {
    const { assistantContent, userPrompt } = req.body as { assistantContent?: string; userPrompt?: string };
    const uid = req.userId!;

    if (!assistantContent || typeof assistantContent !== 'string') {
      return res.status(400).json({ error: 'assistantContent is required' });
    }

    const runtimeSettings = await getRuntimeSettings(uid);
    const providers = await getAvailableProviders(uid);
    const providerName = providers[0];
    if (!providerName) {
      return res.json({ suggestions: [] });
    }
    const model = getDefaultModel(providerName);

    const apiKey = await getProviderApiKey(uid, providerName);
    if (!apiKey && providerName !== 'local') {
      return res.json({ suggestions: [] });
    }

    const existingFacts = (await reconcileFactsForUser(uid)).slice(0, 30);
    const extractionPrompt = [
      'Extract 0-2 durable user facts from this exchange worth saving to long-term memory.',
      'Return a JSON array of short strings (or [] if nothing worth saving).',
      'Only include stable preferences, habits, decisions, identity facts, or project context.',
      'Do NOT include temporary tasks, secrets, passwords, API keys, or anything sensitive.',
      'Do NOT repeat facts already known.',
      '',
      '[ALREADY KNOWN]',
      existingFacts.map(f => `- ${f.content}`).join('\n') || '(none)',
      '',
      userPrompt ? `[USER MESSAGE]\n${userPrompt.slice(0, 500)}\n` : '',
      '[ASSISTANT REPLY]',
      assistantContent.slice(0, 1200),
    ].filter(Boolean).join('\n');

    const { responseText } = await callLLM({
      prompt: extractionPrompt,
      provider: providerName,
      model,
      apiKey: apiKey || '',
      systemPrompt: 'You extract durable user facts. Output only a JSON array of strings.',
      localUrl: runtimeSettings.localUrl,
      messages: [],
    });

    let suggestions: string[] = [];
    try {
      const parsed = JSON.parse(responseText.trim());
      if (Array.isArray(parsed)) {
        suggestions = parsed.filter((s): s is string => typeof s === 'string' && s.length >= 8 && s.length <= 180);
      }
    } catch {
      // non-JSON response — extract lines
      suggestions = responseText.trim().split('\n')
        .map(l => l.replace(/^[-*\d.)\s]+/, '').trim())
        .filter(s => s.length >= 8 && s.length <= 180)
        .slice(0, 2);
    }

    res.json({ suggestions: suggestions.slice(0, 2) });
  } catch (error) {
    console.error('Error suggesting facts:', error);
    res.status(500).json({ error: 'Failed to suggest facts' });
  }
});

export default router;
