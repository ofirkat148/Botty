import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { getTokensFromCode, getUserInfo, getGoogleAuthUrl } from '../utils/google-oauth.js';
import { signToken } from '../utils/jwt.js';
import { getDatabase } from '../db/index.js';
import { users, userTokens } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

// GET /api/auth/google-url - Get the Google OAuth URL
router.get('/google-url', (req: Request, res: Response) => {
  try {
    const authUrl = getGoogleAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    console.error('Error generating Google auth URL:', error);
    res.status(500).json({ error: 'Failed to generate Google auth URL' });
  }
});

// POST /api/auth/google-callback - Handle Google OAuth callback
router.post('/google-callback', async (req: Request, res: Response) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  try {
    const db = getDatabase();

    // Exchange authorization code for tokens
    const tokens = await getTokensFromCode(code);
    const accessToken = tokens.access_token;

    if (!accessToken) {
      throw new Error('No access token received');
    }

    // Get user info from Google
    const googleUser = await getUserInfo(accessToken);
    const { id: googleId, email, name, picture } = googleUser;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if user exists, if not create them
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.uid, googleId))
      .limit(1);

    let user = existingUser[0];

    if (!user) {
      // Create new user
      const userId = randomUUID();
      const newUser = {
        id: userId,
        uid: googleId,
        email,
        displayName: name || email.split('@')[0],
        photoURL: picture || null,
        lastLogin: new Date(),
        createdAt: new Date(),
      };

      await db.insert(users).values(newUser);
      user = newUser;
    } else {
      // Update last login
      await db
        .update(users)
        .set({ lastLogin: new Date() })
        .where(eq(users.uid, googleId));
    }

    // Store or update user tokens
    await db
      .insert(userTokens)
      .values({
        uid: googleId,
        googleAccessToken: accessToken,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userTokens.uid,
        set: {
          googleAccessToken: accessToken,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          updatedAt: new Date(),
        },
      });

    // Generate JWT token
    const jwtToken = signToken(user.id, email);

    res.json({
      token: jwtToken,
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
      },
    });
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

export default router;
