import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/index.js';
import { facts, memoryFiles, memoryUrls } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

// Facts endpoints
router.get('/facts', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;

    const userFacts = await db
      .select()
      .from(facts)
      .where(eq(facts.uid, uid));

    res.json(userFacts);
  } catch (error) {
    console.error('Error fetching facts:', error);
    res.status(500).json({ error: 'Failed to fetch facts' });
  }
});

router.post('/facts', async (req: Request, res: Response) => {
  try {
    const { content, isSkill } = req.body;
    const db = getDatabase();
    const uid = req.userId!;

    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const id = crypto.randomUUID();
    const newFact = {
      id,
      uid,
      content,
      isSkill: isSkill || false,
      timestamp: new Date(),
    };

    await db.insert(facts).values(newFact);
    res.json(newFact);
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
      .where(eq(facts.id, id))
      .where(eq(facts.uid, uid));

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
      .where(eq(memoryFiles.uid, uid));

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

    const id = crypto.randomUUID();
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
      .where(eq(memoryFiles.id, id))
      .where(eq(memoryFiles.uid, uid));

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
      .where(eq(memoryUrls.uid, uid));

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

    const id = crypto.randomUUID();
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
      .where(eq(memoryUrls.id, id))
      .where(eq(memoryUrls.uid, uid));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting memory URL:', error);
    res.status(500).json({ error: 'Failed to delete memory URL' });
  }
});

export default router;
