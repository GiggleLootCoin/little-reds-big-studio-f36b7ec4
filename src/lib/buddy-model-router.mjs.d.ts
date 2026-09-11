export type BuddyModelRoute = {
  id: string;
  label: string;
  cloudflareModel: string;
  localPreferred: boolean;
  localModel: string;
  reason: string;
};
export declare function hasVisionInput(input: Record<string, unknown>): boolean;
export declare function selectBuddyModel(input: Record<string, unknown>): BuddyModelRoute;
export declare function buddyModelCatalog(): BuddyModelRoute[];
