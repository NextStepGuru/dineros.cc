// Authentication utility functions that can be easily unit tested

export interface LoginCredentials {
  email: string;
  password: string;
  tokenChallenge?: string;
}

export interface LoginResponse {
  token?: string;
  user?: any;
  twoFactorChallengeRequired?: boolean;
}

export interface LoginResult {
  success: boolean;
  requiresTwoFactor: boolean;
  token?: string;
  user?: any;
  errorMessage?: string;
}

/**
 * Process login response and determine next action
 */
export function processLoginResponse(response: LoginResponse): LoginResult {
  // Handle successful login with token
  if (response.token) {
    return {
      success: true,
      requiresTwoFactor: false,
      token: response.token,
      user: response.user,
    };
  }

  // Handle 2FA challenge required
  if (response.twoFactorChallengeRequired) {
    return {
      success: false,
      requiresTwoFactor: true,
    };
  }

  // Handle invalid response
  return {
    success: false,
    requiresTwoFactor: false,
    errorMessage: 'Invalid login credentials.',
  };
}

/**
 * Validate login credentials
 */
export function validateLoginCredentials(credentials: LoginCredentials): string | null {
  if (!credentials.email) {
    return 'Email is required';
  }

  if (!credentials.password && !credentials.tokenChallenge) {
    return 'Password is required';
  }

  if (credentials.email && !credentials.email.includes('@')) {
    return 'Please enter a valid email address';
  }

  return null;
}

/**
 * Determine navigation target after successful login.
 * Uses the first account register when sorted by sortOrder (ascending).
 */
export function getPostLoginRedirect(accountRegisters: any[]): string {
  if (accountRegisters.length > 0) {
    const bySortOrder = [...accountRegisters].sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.id ?? 0) - (b.id ?? 0)
    );
    return `/register/${bySortOrder[0].id}`;
  }
  return '/account-registers?onboarding=1';
}

/**
 * Format error message for display
 */
export function formatLoginError(error: any): string {
  if (error?.data?.errors) {
    return Array.isArray(error.data.errors)
      ? error.data.errors.join(', ')
      : error.data.errors;
  }

  if (error?.message) {
    return error.message;
  }

  return 'An error occurred during login.';
}
