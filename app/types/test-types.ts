// Stub types for testing - these provide the necessary types without requiring the actual Prisma client
export type AccountRegister = {
  id: number;
  plaidId?: string;
  [key: string]: any;
};

export type AccountType = {
  isCredit: boolean;
  [key: string]: any;
};

export type RegisterEntry = {
  id: string;
  amount: number;
  description: string;
  [key: string]: any;
};

export type Reoccurrence = {
  id: string;
  [key: string]: any;
};

export type PrismaClient = {
  accountRegister: any;
  registerEntry: any;
  reoccurrence: any;
  [key: string]: any;
};

export class Decimal {
  private value: number;

  constructor(value: string | number) {
    this.value = typeof value === 'string' ? parseFloat(value) : value;
  }

  toString(): string {
    return this.value.toString();
  }

  toNumber(): number {
    return this.value;
  }

  // Add any other methods that might be needed
  [key: string]: any;
}

// Export all types that might be needed in tests
