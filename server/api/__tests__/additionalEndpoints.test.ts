import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to ensure mocks are set up before any imports
vi.hoisted(() => {
  (globalThis as any).defineEventHandler = vi.fn((handler) => handler);
});

// Mock H3/Nuxt utilities before any imports
vi.mock('h3', () => ({
  defineEventHandler: vi.fn((handler) => handler),
  createError: vi.fn((error) => {
    const statusCode = error.statusCode || 500;
    const message = error.statusMessage || error.message || 'Unknown error';
    const fullMessage = `HTTP ${statusCode}: ${message}`;
    const err = new Error(fullMessage) as any;
    err.statusCode = statusCode;
    err.statusMessage = message;
    throw err;
  }),
  readBody: vi.fn(),
  setResponseStatus: vi.fn(),
  setCookie: vi.fn(),
}));

// Make H3 functions globally available
(global as any).readBody = vi.fn();
(global as any).setResponseStatus = vi.fn();
(global as any).setCookie = vi.fn();

// Mock server dependencies
vi.mock('~/server/logger', () => ({
  log: vi.fn(),
}));

vi.mock('../env', () => ({
  default: {
    NODE_ENV: 'test',
  },
}));

vi.mock('~/server/clients/prismaClient', () => ({
  prisma: {
    user: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('~/server/clients/postmarkClient', () => ({
  postmarkClient: {
    sendEmail: vi.fn(),
  },
}));

vi.mock('~/server/lib/getUser', () => ({
  getUser: vi.fn(),
}));

vi.mock('~/server/lib/handleApiError', () => ({
  handleApiError: vi.fn(),
}));

vi.mock('~/schema/zod', () => ({
  passwordSchema: {
    parse: vi.fn(),
  },
  publicProfileSchema: {
    parse: vi.fn(),
  },
  privateUserSchema: {
    parse: vi.fn(),
  },
}));

// Create mock service classes
const mockHashService = {
  hash: vi.fn(),
  verify: vi.fn(),
};

const mockJwtService = {
  sign: vi.fn(),
  verify: vi.fn(),
};

vi.mock('~/server/services/HashService', () => ({
  default: vi.fn().mockImplementation(() => mockHashService),
}));

vi.mock('~/server/services/JwtService', () => ({
  default: vi.fn().mockImplementation(() => mockJwtService),
}));

describe('Additional API Endpoints Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/validate-token', () => {
    let validateTokenHandler: any;

    beforeEach(async () => {
      const module = await import('../validate-token');
      validateTokenHandler = module.default;
    });

    it('should validate token and return refreshed token with user data', async () => {
      const mockEvent = {};
      const mockUser = {
        id: 123,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
      };
      const mockParsedUser = {
        id: 123,
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
      };

      const { getUser } = await import('~/server/lib/getUser');
      const { prisma } = await import('~/server/clients/prismaClient');
      const { publicProfileSchema } = await import('~/schema/zod');
      const { setCookie, setResponseStatus } = await import('h3');

      (getUser as any).mockReturnValue({ userId: 123 });
      (prisma.user.findUniqueOrThrow as any).mockResolvedValue(mockUser);
      mockJwtService.sign.mockResolvedValue('new-jwt-token');
      (publicProfileSchema.parse as any).mockReturnValue(mockParsedUser);

      const result = await validateTokenHandler(mockEvent);

      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 123 },
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith({ userId: 123 });
      expect(setCookie).toHaveBeenCalledWith(mockEvent, 'authToken', 'new-jwt-token', {
        secure: false,
        maxAge: 86400,
        path: '/',
        sameSite: 'lax',
        httpOnly: false,
      });
      expect(setResponseStatus).toHaveBeenCalledWith(mockEvent, 200);
      expect(result).toEqual({
        token: 'new-jwt-token',
        message: null,
        user: mockParsedUser,
      });
    });

    it('should handle database errors', async () => {
      const mockEvent = {};
      const { getUser } = await import('~/server/lib/getUser');
      const { handleApiError } = await import('~/server/lib/handleApiError');
      const { prisma } = await import('~/server/clients/prismaClient');

      (getUser as any).mockReturnValue({ userId: 123 });
      const error = new Error('Database error');
      (prisma.user.findUniqueOrThrow as any).mockRejectedValue(error);
      (handleApiError as any).mockImplementation((err: any) => {
        throw err;
      });

      await expect(validateTokenHandler(mockEvent)).rejects.toThrow('Database error');
      expect(handleApiError).toHaveBeenCalledWith(error);
    });
  });

  describe('POST /api/change-password', () => {
    let changePasswordHandler: any;

    beforeEach(async () => {
      (global as any).readBody = vi.fn();
      const module = await import('../change-password.post');
      changePasswordHandler = module.default;
    });

    it('should successfully change password and send notification', async () => {
      const mockEvent = {};
      const mockBody = { newPassword: 'newPassword123' };
      const mockUser = {
        id: 123,
        email: 'test@example.com',
        firstName: 'Test',
      };

      const { getUser } = await import('~/server/lib/getUser');
      const { prisma } = await import('~/server/clients/prismaClient');
      const { postmarkClient } = await import('~/server/clients/postmarkClient');
      const { passwordSchema } = await import('~/schema/zod');

      (global as any).readBody.mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue({ userId: 123 });
      (passwordSchema.parse as any).mockReturnValue({ newPassword: 'newPassword123' });
      mockHashService.hash.mockResolvedValue('hashedNewPassword');
      (prisma.user.update as any).mockResolvedValue(mockUser);
      (postmarkClient.sendEmail as any).mockResolvedValue({});

      const result = await changePasswordHandler(mockEvent);

      expect(passwordSchema.parse).toHaveBeenCalled();
      expect(mockHashService.hash).toHaveBeenCalledWith('newPassword123');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 123 },
        data: { password: 'hashedNewPassword' },
      });
      expect(postmarkClient.sendEmail).toHaveBeenCalledWith({
        From: 'Mr. Pepe Dineros <pepe@dineros.cc>',
        To: 'test@example.com',
        Subject: 'Dineros Password Reset',
        HtmlBody: expect.stringContaining('Test'),
      });
      expect(result).toEqual({ message: 'Password changed successfully.' });
    });

    it('should handle validation errors', async () => {
      const mockEvent = {};
      const mockBody = { newPassword: '123' }; // Too short

      const { readBody } = await import('h3');
      const { getUser } = await import('~/server/lib/getUser');
      const { passwordSchema } = await import('~/schema/zod');
      const { handleApiError } = await import('~/server/lib/handleApiError');

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue({ userId: 123 });
      const validationError = new Error('Password too short');
      (passwordSchema.parse as any).mockImplementation(() => {
        throw validationError;
      });
      (handleApiError as any).mockImplementation((err: any) => {
        throw new Error('An error occurred while changing password.');
      });

      await expect(changePasswordHandler(mockEvent)).rejects.toThrow('An error occurred while changing password.');
      expect(handleApiError).toHaveBeenCalledWith(validationError);
    });
  });

  describe('POST /api/user', () => {
    let userPostHandler: any;

    beforeEach(async () => {
      (global as any).readBody = vi.fn();
      const module = await import('../user.post');
      userPostHandler = module.default;
    });

    it('should successfully update user profile', async () => {
      const mockEvent = {};
      const mockBody = {
        email: 'updated@example.com',
        firstName: 'Updated',
        lastName: 'User',
      };
      const mockUser = {
        id: 123,
        email: 'updated@example.com',
        firstName: 'Updated',
        lastName: 'User',
      };
      const mockParsedUser = {
        id: 123,
        email: 'updated@example.com',
        firstName: 'Updated',
        lastName: 'User',
      };

      const { getUser } = await import('~/server/lib/getUser');
      const { prisma } = await import('~/server/clients/prismaClient');
      const { publicProfileSchema } = await import('~/schema/zod');

      (global as any).readBody.mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue({ userId: 123 });
      (publicProfileSchema.parse as any)
        .mockReturnValueOnce(mockBody) // First call for validation
        .mockReturnValueOnce(mockParsedUser); // Second call for return value
      (prisma.user.findUniqueOrThrow as any).mockResolvedValue({ id: 123 });
      (prisma.user.update as any).mockResolvedValue(mockUser);

      const result = await userPostHandler(mockEvent);

      expect(getUser).toHaveBeenCalledWith(mockEvent);
      expect(publicProfileSchema.parse).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        data: {
          email: 'updated@example.com',
          firstName: 'Updated',
          lastName: 'User',
        },
        where: { id: 123 },
      });
      expect(result).toEqual(mockParsedUser);
    });

    it('should handle user not found error', async () => {
      const mockEvent = {};
      const mockBody = { email: 'test@example.com', firstName: 'Test', lastName: 'User' };

      const { readBody } = await import('h3');
      const { getUser } = await import('~/server/lib/getUser');
      const { prisma } = await import('~/server/clients/prismaClient');
      const { publicProfileSchema } = await import('~/schema/zod');
      const { handleApiError } = await import('~/server/lib/handleApiError');

      (readBody as any).mockResolvedValue(mockBody);
      (getUser as any).mockReturnValue({ userId: 999 });
      (publicProfileSchema.parse as any).mockReturnValue(mockBody);
      const notFoundError = new Error('User not found');
      (prisma.user.findUniqueOrThrow as any).mockRejectedValue(notFoundError);
      (handleApiError as any).mockImplementation((err: any) => {
        throw err;
      });

      await expect(userPostHandler(mockEvent)).rejects.toThrow('User not found');
      expect(handleApiError).toHaveBeenCalledWith(notFoundError);
    });
  });
});
