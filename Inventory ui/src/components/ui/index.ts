// Barrel export for all UI primitives
// Usage: import { Button, Modal, Toast, ... } from "@/components/ui";

export { Button, IconButton } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize, IconButtonProps } from "./Button";

export { Modal, ModalTitle, ModalDescription } from "./Modal";
export type { ModalProps } from "./Modal";

export { Toast } from "./Toast";
export type { ToastProps, ToastSeverity, ToastItem } from "./Toast";

export { Badge } from "./Badge";
export type { BadgeProps, BadgeVariant } from "./Badge";

export { Tooltip } from "./Tooltip";
export type { TooltipProps } from "./Tooltip";

export { Spinner, DotLoader, PageLoader } from "./Spinner";
export type { SpinnerProps, SpinnerSize } from "./Spinner";
