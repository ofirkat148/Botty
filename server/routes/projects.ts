import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getDatabase } from '../db/index.js';
import { projects, history } from '../db/schema.js';
import { and, eq, desc } from 'drizzle-orm';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware);

// GET /api/projects
router.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;
    const rows = await db
      .select()
      .from(projects)
      .where(eq(projects.uid, uid))
      .orderBy(desc(projects.createdAt));
    res.json(rows);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// POST /api/projects
router.post('/', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;
    const { name, description, systemPrompt, color } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Project name is required' });
    }
    const id = randomUUID();
    await db.insert(projects).values({
      id,
      uid,
      name: name.trim().slice(0, 100),
      description: typeof description === 'string' ? description.trim().slice(0, 500) : null,
      systemPrompt: typeof systemPrompt === 'string' ? systemPrompt.trim().slice(0, 8000) : null,
      color: typeof color === 'string' ? color.slice(0, 30) : 'stone',
    });
    const [row] = await db.select().from(projects).where(and(eq(projects.uid, uid), eq(projects.id, id)));
    res.status(201).json(row);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// PUT /api/projects/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;
    const { id } = req.params;
    const { name, description, systemPrompt, color } = req.body;

    const [existing] = await db.select().from(projects).where(and(eq(projects.uid, uid), eq(projects.id, id)));
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    const patch: Partial<typeof existing> = {
      updatedAt: new Date().toISOString(),
    };
    if (typeof name === 'string' && name.trim()) patch.name = name.trim().slice(0, 100);
    if (typeof description === 'string') patch.description = description.trim().slice(0, 500) || null;
    if (typeof systemPrompt === 'string') patch.systemPrompt = systemPrompt.trim().slice(0, 8000) || null;
    if (typeof color === 'string') patch.color = color.slice(0, 30);

    await db.update(projects).set(patch).where(and(eq(projects.uid, uid), eq(projects.id, id)));
    const [updated] = await db.select().from(projects).where(and(eq(projects.uid, uid), eq(projects.id, id)));
    res.json(updated);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE /api/projects/:id — deletes project and unassigns its conversations
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;
    const { id } = req.params;

    const [existing] = await db.select().from(projects).where(and(eq(projects.uid, uid), eq(projects.id, id)));
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    // Unassign conversations
    await db
      .update(history)
      .set({ projectId: null })
      .where(and(eq(history.uid, uid), eq(history.projectId, id)));

    await db.delete(projects).where(and(eq(projects.uid, uid), eq(projects.id, id)));
    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// PUT /api/projects/assign/:conversationId — assign or unassign a conversation
router.put('/assign/:conversationId', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const uid = req.userId!;
    const { conversationId } = req.params;
    const { projectId } = req.body; // null to unassign

    if (projectId) {
      const [proj] = await db.select().from(projects).where(and(eq(projects.uid, uid), eq(projects.id, projectId)));
      if (!proj) return res.status(404).json({ error: 'Project not found' });
    }

    await db
      .update(history)
      .set({ projectId: projectId ?? null })
      .where(and(eq(history.uid, uid), eq(history.conversationId, conversationId)));

    res.json({ ok: true });
  } catch (error) {
    console.error('Error assigning conversation to project:', error);
    res.status(500).json({ error: 'Failed to assign conversation' });
  }
});

export default router;
