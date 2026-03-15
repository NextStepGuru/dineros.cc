// Shared progress report types/callbacks so model files don't import from index (avoids circular deps).

export interface ProgressReport {
  model: string;
  processed: number;
  totalCount: number;
  performance: number;
}

export type ProgressReportCallback = (
  _progress: ProgressReport
) => void | Promise<void>;

export const defaultProgressReport: ProgressReportCallback = ({
  model,
  totalCount,
  processed,
  performance,
}) => {
  const length = totalCount.toString().length;
  const pct = Math.round((100 * processed) / totalCount)
    .toString()
    .padStart(3);
  console.info(
    `${model.padEnd(15)} ${pct}% processed ${processed
      .toString()
      .padStart(length)} / ${totalCount} (took ${performance.toFixed(2)}ms)`
  );
};
