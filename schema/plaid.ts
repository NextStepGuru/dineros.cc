import { z } from "zod";

export const plaidAccountSchema = z.object({
  id: z.string(),
  mask: z.string(),
  name: z.string(),
  type: z.string(),
  subtype: z.string(),
  class_type: z.string().nullable(),
  verification_status: z.string().nullable(),
});

// Define the institution schema
const institutionSchema = z.object({
  name: z.string(),
  institution_id: z.string(),
});

// Define the metadata schema
const metadataSchema = z.object({
  status: z.string().nullable().optional(),
  wallet: z.string().nullable().optional(),
  account: plaidAccountSchema.optional(),
  accounts: z.array(plaidAccountSchema).optional(),
  account_id: z.string().optional(),
  institution: institutionSchema.optional(),
  public_token: z.string().optional(),
  link_session_id: z.string().optional(),
  transfer_status: z.string().nullable().optional(),
});

// Define the root schema
export const plaidRootSchema = z
  .object({
    item_id: z.string().optional(),
    metadata: metadataSchema.passthrough().optional(),
    isEnabled: z.boolean().default(false),
    request_id: z.string().optional(),
    access_token: z.string().optional(),
    public_token: z.string().optional(),
  })
  .default({ isEnabled: false });
