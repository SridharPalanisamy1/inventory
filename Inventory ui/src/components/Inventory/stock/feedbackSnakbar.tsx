/**
 * stock/feedbackSnakbar.tsx — now delegates to shared FeedbackToast.
 * Old 221-line MUI Snackbar+Alert version replaced.
 */
export { default } from "@/components/Inventory/shared/FeedbackToast";
export type { FeedbackToastProps as FeedbackSnackbarProps } from "@/components/Inventory/shared/FeedbackToast";