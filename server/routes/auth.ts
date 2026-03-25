import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { extractTokenFromHeader, signToken, verifyToken } from '../utils/jwt.js';
import { getDatabase } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

router.post('/local', async (req: Request, res: Response) => {
  if (process.env.LOCAL_AUTH_ENABLED === 'false') {
    return res.status(403).json({ error: 'Local auth is disabled' });
  }

  const email = String(req.body?.email || '').trim().toLowerCase();
  const displayName = String(req.body?.displayName || '').trim();

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email is required' });
  }

  try {
    const db = getDatabase();
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);

    let user = existing[0];

    if (!user) {
      user = {
        id: randomUUID(),
        uid: `local:${email}`,
        email,
        displayName: displayName || email.split('@')[0],
        photoURL: null,
        lastLogin: new Date(),
        createdAt: new Date(),
      };

      await db.insert(users).values(user);
    } else {
      await db
        .update(users)
        .set({
          displayName: displayName || user.displayName,
          lastLogin: new Date(),
        })
        .where(eq(users.id, user.id));

      user = {
        ...user,
        displayName: displayName || user.displayName,
      };
    }

    const token = signToken(user.id, user.email);

    res.json({
      token,
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
      },
    });
  } catch (error) {
    console.error('Local auth error:', error);
    res.status(500).json({ error: 'Failed to sign in locally' });
  }
});

router.get('/me', async (req: Request, res: Response) => {
  const token = extractTokenFromHeader(req.headers.authorization);

  if (!token) {
    return res.status(200).json({ user: null });
  }

  try {
    const payload = verifyToken(token);
    const db = getDatabase();
    const rows = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);

    if (rows.length === 0) {
      return res.status(200).json({ user: null });
    }

    const user = rows[0];
    res.json({
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
      },
    });
  } catch {
    res.status(200).json({ user: null });
  }
});

export default router;
