import { defineEventHandler, readBody, setResponseStatus } from "h3";
import { z } from "zod";
import { google } from "googleapis";
import { getUser } from "../../lib/getUser";
import { handleApiError } from "~/server/lib/handleApiError";
import { recalculateRunningBalanceAndSort } from "~/lib/sort";
import { prisma as PrismaDb } from "~/server/clients/prismaClient";

// Google Sheets API configuration
const GOOGLE_SHEETS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Schema for the request body
const syncGoogleSheetSchema = z.object({
  accountRegisterId: z.coerce.number().min(1),
  spreadsheetId: z.string().min(1),
  sheetName: z.string().optional().default("Register Data"),
  googleCredentials: z.object({
    client_id: z.string(),
    client_secret: z.string(),
    redirect_uris: z.array(z.string()),
  }),
  googleToken: z.object({
    access_token: z.string(),
    refresh_token: z.string().optional(),
    scope: z.string(),
    token_type: z.string(),
    expiry_date: z.number().optional(),
  }),
});

export default defineEventHandler(async (event) => {
  try {
    const user = getUser(event);
    const body = await readBody(event);

    // Validate request body
    const {
      accountRegisterId,
      spreadsheetId,
      sheetName,
      googleCredentials,
      googleToken,
    } = syncGoogleSheetSchema.parse(body);

    // Verify user has access to this account register
    const accountRegister = await PrismaDb.accountRegister.findFirstOrThrow({
      where: {
        id: accountRegisterId,
        account: {
          userAccounts: {
            some: {
              userId: user.userId,
            },
          },
        },
      },
      select: {
        id: true,
        balance: true,
        latestBalance: true,
        type: true,
      },
    });

    // Fetch register entries (same logic as the register endpoint)
    const registerEntries = await PrismaDb.registerEntry.findMany({
      where: {
        OR: [
          { isCleared: false, isProjected: true },
          { isProjected: false, isCleared: false, isPending: true },
          { isBalanceEntry: true, isCleared: false },
          { isProjected: false, isManualEntry: true, isCleared: false },
        ],
        accountRegisterId,
        register: {
          account: {
            is: {
              userAccounts: {
                some: {
                  userId: user.userId,
                },
              },
            },
          },
        },
      },
      orderBy: {
        seq: "asc",
      },
    });

    // Calculate pocket balances
    const pocketBalances = await PrismaDb.accountRegister.aggregate({
      where: {
        subAccountRegisterId: accountRegisterId,
      },
      _sum: {
        balance: true,
      },
    });

    const balance = accountRegister.latestBalance - (pocketBalances._sum.balance || 0);

    // Process entries (same as register endpoint)
    const balanceUpdated = recalculateRunningBalanceAndSort({
      registerEntries,
      balance,
      type: accountRegister.type.isCredit ? "credit" : "debit",
    });

    const entryWithLowestBalance = balanceUpdated.reduce((minEntry, entry) => {
      return entry.balance < minEntry.balance ? entry : minEntry;
    }, balanceUpdated[0]);

    const entryWithHighestBalance = balanceUpdated.reduce((minEntry, entry) => {
      return entry.balance > minEntry.balance ? entry : minEntry;
    }, balanceUpdated[0]);

    // Format data for Google Sheets
    const formattedData = formatDataForSheets({
      entries: balanceUpdated,
      lowest: entryWithLowestBalance,
      highest: entryWithHighestBalance,
    });

    // Initialize Google Sheets API
    const auth = new google.auth.OAuth2(
      googleCredentials.client_id,
      googleCredentials.client_secret,
      googleCredentials.redirect_uris[0]
    );

    auth.setCredentials(googleToken);

    // Update Google Sheets
    const sheets = google.sheets({ version: 'v4', auth });

    try {
      // Clear existing data
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: sheetName,
      });

      // Update with new data
      const response = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: formattedData
        }
      });

      return {
        success: true,
        message: `Successfully synced ${balanceUpdated.length} entries to Google Sheets`,
        updatedCells: response.data?.updatedCells || 0,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
        data: {
          totalEntries: balanceUpdated.length,
          lowestBalance: entryWithLowestBalance?.balance,
          highestBalance: entryWithHighestBalance?.balance,
          lastUpdated: new Date().toISOString(),
        }
      };

    } catch (sheetsError: any) {
      console.error('Google Sheets API error:', sheetsError);
      setResponseStatus(event, 500);
      return {
        success: false,
        message: 'Failed to update Google Sheets',
        error: sheetsError?.message || 'Unknown error',
      };
    }

  } catch (error) {
    handleApiError(error);
    throw error;
  }
});

/**
 * Format register data for Google Sheets
 */
function formatDataForSheets(registerData: {
  entries: any[];
  lowest: any;
  highest: any;
}) {
  const { entries, lowest, highest } = registerData;

  // Header row
  const headers = [
    'Date',
    'Description',
    'Amount',
    'Balance',
    'Status',
    'Type'
  ];

  // Data rows
  const rows = entries.map(entry => [
    new Date(entry.createdAt).toLocaleDateString(),
    entry.description,
    entry.amount,
    entry.balance,
    getStatus(entry),
    getEntryType(entry)
  ]);

  // Add summary rows
  const summaryRows = [
    [],
    ['SUMMARY'],
    ['Lowest Balance:', lowest?.balance || 'N/A', '', lowest?.createdAt ? new Date(lowest.createdAt).toLocaleDateString() : 'N/A'],
    ['Highest Balance:', highest?.balance || 'N/A', '', highest?.createdAt ? new Date(highest.createdAt).toLocaleDateString() : 'N/A'],
    ['Total Entries:', entries.length],
    ['Last Updated:', new Date().toLocaleString()]
  ];

  return [headers, ...rows, ...summaryRows];
}

/**
 * Get status string for an entry
 */
function getStatus(entry: any) {
  if (entry.isBalanceEntry) return 'Balance Entry';
  if (entry.isCleared) return 'Cleared';
  if (entry.isReconciled) return 'Reconciled';
  if (entry.isProjected) return 'Projected';
  if (entry.isPending) return 'Pending';
  return 'Unknown';
}

/**
 * Get entry type string
 */
function getEntryType(entry: any) {
  if (entry.isBalanceEntry) return 'Balance';
  if (entry.sourceAccountRegisterId) return 'Transfer';
  if (entry.reoccurrenceId) return 'Recurring';
  return 'Manual';
}
