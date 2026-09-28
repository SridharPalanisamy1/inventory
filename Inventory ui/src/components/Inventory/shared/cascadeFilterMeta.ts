export type FilterOrigin = "user" | "cascade" | "system";

export type CascadeFilterMeta = {
  key: string;
  origin: FilterOrigin;
  sourceKey?: string;
  loading?: boolean;
  disabled?: boolean;
};

export const getCascadeStatusLabel = (meta?: CascadeFilterMeta) => {
  if (!meta) return undefined;
  if (meta.loading && meta.origin === "cascade") return "Updating...";
  if (meta.origin === "cascade" && meta.sourceKey) return `From ${meta.sourceKey}`;
  if (meta.origin === "user") return "Selected";
  return undefined;
};
