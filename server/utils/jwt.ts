import jwt from 'jsonwebtoken';

const TOKEN_EXPIRY = '24h';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length < 16) {
    throw new Error(
      'JWT_SECRET environment variable must be set and at least 16 characters long. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }
  return secret.trim();
}

export interface TokenPayload {
  sub: string; // User ID
  email: string;
  iat: number;
  exp: number;
}

export function signToken(userId: string, email: string): string {
  const payload = {
    sub: userId,
    email,
  };

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: TOKEN_EXPIRY,
  });
}

export function verifyToken(token: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as TokenPayload;
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}
