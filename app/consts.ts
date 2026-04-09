export const MAX_YEARS = 5;

export const IS_CREDIT_TYPE_IDS = [3, 4, 5, 6, 7, 12, 13, 17];

export const DEPRECIATING_ASSET_TYPE_IDS = [20, 24, 25, 26]; // Vehicle, Boat, RV, Motorcycle
export const APPRECIATING_ASSET_TYPE_IDS = [21, 23]; // Collectable Vehicle, House
export const ASSET_TYPE_IDS = [18, 20, 21, 23, 24, 25, 26];

/** Account type ids that support AI value estimation */
export const ESTIMATABLE_ASSET_TYPE_IDS = [20, 23, 24, 25, 26];

/** Maps account_type.id to estimation category for POST /api/asset-value-estimate */
export const ASSET_TYPE_CATEGORY_MAP: Record<number, AssetEstimateCategory> = {
  20: "vehicle",
  23: "house",
  24: "boat",
  25: "rv",
  26: "motorcycle",
};

export type AssetEstimateCategory =
  | "vehicle"
  | "house"
  | "boat"
  | "rv"
  | "motorcycle";
