import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDatabase } from '../db/index.js';
import { facts, history, memoryFiles, memoryUrls, settings, userSettings } from '../db/schema.js';
import { and, desc, eq } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';
import { consolidateFactRows, reconcileFactsForUser, saveFactsWithConsolidation } from '../utils/llm.js';

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
      },
      userSettings: userPromptSettings[0] || {
        uid,
        systemPrompt: null,
      },
      history: userHistory,
    };

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

    await db.transaction(async tx => {
      if (hasMemorySection) {
        await tx.delete(facts).where(eq(facts.uid, uid));
        await tx.delete(memoryFiles).where(eq(memoryFiles.uid, uid));
        await tx.delete(memoryUrls).where(eq(memoryUrls.uid, uid));
      }

      if (hasHistorySection) {
        await tx.delete(history).where(eq(history.uid, uid));
      }

      if (consolidatedFactRows.length > 0) {
        await tx.insert(facts).values(consolidatedFactRows).onConflictDoNothing();
      }

      if (fileRows.length > 0) {
        await tx.insert(memoryFiles).values(fileRows).onConflictDoNothing();
      }

      if (urlRows.length > 0) {
        await tx.insert(memoryUrls).values(urlRows).onConflictDoNothing();
      }

      if (historyRows.length > 0) {
        await tx.insert(history).values(historyRows).onConflictDoNothing();
      }

      if (incomingSettings) {
        await tx.insert(settings).values({
          uid,
          localUrl: incomingSettings.localUrl ? String(incomingSettings.localUrl) : null,
          useMemory: incomingSettings.useMemory !== false,
          autoMemory: incomingSettings.autoMemory !== false,
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: settings.uid,
          set: {
            localUrl: incomingSettings.localUrl ? String(incomingSettings.localUrl) : null,
            useMemory: incomingSettings.useMemory !== false,
            autoMemory: incomingSettings.autoMemory !== false,
            updatedAt: new Date(),
          },
        });
      }

      if (incomingUserSettings) {
        await tx.insert(userSettings).values({
          uid,
          systemPrompt: incomingUserSettings.systemPrompt ? String(incomingUserSettings.systemPrompt) : null,
          updatedAt: new Date(),
        }).onConflictDoUpdate({
          target: userSettings.uid,
          set: {
            systemPrompt: incomingUserSettings.systemPrompt ? String(incomingUserSettings.systemPrompt) : null,
            updatedAt: new Date(),
          },
        });
      }
    });

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

    const userFacts = await reconcileFactsForUser(uid);

    userFacts.sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());

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

    const id = randomUUID();
    const newFile = {
      id,
      uid,
      name,
      content,
      type: type || 'text/plain',
      size: content.length,
      isSkill: isSkill || false,
      timestamp: new Date(),
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
      timestamp: new Date(),
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

export default router;
