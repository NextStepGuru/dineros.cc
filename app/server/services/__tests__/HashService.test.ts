import { describe, it, expect, beforeEach } from 'vitest';
import HashService from '../HashService';

describe('HashService', () => {
  let hashService: HashService;

  beforeEach(() => {
    hashService = new HashService();
  });

  describe('hash', () => {
    it('should hash a string successfully', async () => {
      const password = 'testPassword123';
      const hashedPassword = await hashService.hash(password);

      expect(hashedPassword).toBeDefined();
      expect(typeof hashedPassword).toBe('string');
      expect(hashedPassword.length).toBeGreaterThan(0);
      expect(hashedPassword).not.toBe(password);
    });

    it.runIf(process.env.RUN_SLOW_TESTS === 'true')('should produce different hashes for the same input (salt randomization)', async () => {
      const password = 'testPassword123';
      const hash1 = await hashService.hash(password);
      const hash2 = await hashService.hash(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', async () => {
      const emptyPassword = '';
      const hashedPassword = await hashService.hash(emptyPassword);

      expect(hashedPassword).toBeDefined();
      expect(typeof hashedPassword).toBe('string');
    });

    it('should handle special characters', async () => {
      const specialPassword = '!@#$%^&*()_+{}:"<>?[];,./-=`~';
      const hashedPassword = await hashService.hash(specialPassword);

      expect(hashedPassword).toBeDefined();
      expect(typeof hashedPassword).toBe('string');
    });

    it('should handle unicode characters', async () => {
      const unicodePassword = '密码测试🔒🌟';
      const hashedPassword = await hashService.hash(unicodePassword);

      expect(hashedPassword).toBeDefined();
      expect(typeof hashedPassword).toBe('string');
    });

    it('should handle very long strings', async () => {
      const longPassword = 'a'.repeat(1000);
      const hashedPassword = await hashService.hash(longPassword);

      expect(hashedPassword).toBeDefined();
      expect(typeof hashedPassword).toBe('string');
    });
  });

  describe('verify', () => {
    it('should verify correct password', async () => {
      const password = 'testPassword123';
      const hashedPassword = await hashService.hash(password);
      const isValid = await hashService.verify(hashedPassword, password);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'testPassword123';
      const wrongPassword = 'wrongPassword456';
      const hashedPassword = await hashService.hash(password);
      const isValid = await hashService.verify(hashedPassword, wrongPassword);

      expect(isValid).toBe(false);
    });

    it('should reject empty password against hash', async () => {
      const password = 'testPassword123';
      const hashedPassword = await hashService.hash(password);
      const isValid = await hashService.verify(hashedPassword, '');

      expect(isValid).toBe(false);
    });

    it('should verify empty password hash with empty input', async () => {
      const password = '';
      const hashedPassword = await hashService.hash(password);
      const isValid = await hashService.verify(hashedPassword, '');

      expect(isValid).toBe(true);
    });

    it('should handle case sensitivity', async () => {
      const password = 'TestPassword123';
      const wrongCasePassword = 'testpassword123';
      const hashedPassword = await hashService.hash(password);
      const isValid = await hashService.verify(hashedPassword, wrongCasePassword);

      expect(isValid).toBe(false);
    });

    it('should verify special characters correctly', async () => {
      const password = '!@#$%^&*()_+{}:"<>?[];,./-=`~';
      const hashedPassword = await hashService.hash(password);
      const isValid = await hashService.verify(hashedPassword, password);

      expect(isValid).toBe(true);
    });

    it('should verify unicode characters correctly', async () => {
      const password = '密码测试🔒🌟';
      const hashedPassword = await hashService.hash(password);
      const isValid = await hashService.verify(hashedPassword, password);

      expect(isValid).toBe(true);
    });

    it('should handle invalid base64 hash gracefully', async () => {
      const invalidHash = 'invalid-base64-hash!@#$';
      const password = 'testPassword123';

      await expect(hashService.verify(invalidHash, password)).resolves.toBe(false);
    });

    it('should handle malformed hash gracefully', async () => {
      const malformedHash = btoa('not-an-argon2-hash');
      const password = 'testPassword123';

      await expect(hashService.verify(malformedHash, password)).resolves.toBe(false);
    });

    it('should handle very long input strings', async () => {
      const longPassword = 'a'.repeat(1000);
      const hashedPassword = await hashService.hash(longPassword);
      const isValid = await hashService.verify(hashedPassword, longPassword);

      expect(isValid).toBe(true);
    });
  });

  describe('integration', () => {
    it.runIf(process.env.RUN_SLOW_TESTS === 'true')('should work with multiple hash/verify cycles', async () => {
      const passwords = ['password1', 'password2', 'password3'];
      const hashes = [];

      // Hash all passwords
      for (const password of passwords) {
        const hash = await hashService.hash(password);
        hashes.push(hash);
      }

      // Verify all passwords
      for (let i = 0; i < passwords.length; i++) {
        const isValid = await hashService.verify(hashes[i], passwords[i]);
        expect(isValid).toBe(true);
      }

      // Cross-verify (should all fail)
      for (let i = 0; i < passwords.length; i++) {
        for (let j = 0; j < passwords.length; j++) {
          if (i !== j) {
            const isValid = await hashService.verify(hashes[i], passwords[j]);
            expect(isValid).toBe(false);
          }
        }
      }
    }, 15000); // 15 second timeout for CI environments with multiple Argon2 operations

    it('should maintain consistent behavior across instances', async () => {
      const password = 'testPassword123';
      const hashService1 = new HashService();
      const hashService2 = new HashService();

      const hash = await hashService1.hash(password);
      const isValid = await hashService2.verify(hash, password);

      expect(isValid).toBe(true);
    });
  });

  describe('security properties', () => {
    it('should use sufficient Argon2 parameters for security', async () => {
      const password = 'testPassword123';
      const start = Date.now();
      await hashService.hash(password);
      const end = Date.now();

      // Hashing should take at least some time (indicating proper parameters)
      expect(end - start).toBeGreaterThan(10); // At least 10ms
    });

    it('should produce base64-encoded output', async () => {
      const password = 'testPassword123';
      const hash = await hashService.hash(password);

      // Should be valid base64
      expect(() => atob(hash)).not.toThrow();

      // Decoded should be different from original hash
      const decoded = atob(hash);
      expect(decoded).not.toBe(hash);
      expect(decoded.length).toBeGreaterThan(0);
    });
  });
});
