"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button that gives immediate visual feedback while its form's server
 * action runs: swaps to the pending label and styling and disables itself so
 * a slow action can't be fired twice. Must live inside the <form> it reports
 * on (useFormStatus reads the nearest parent form's state).
 */
export function PendingButton({
  label,
  pendingLabel,
  className,
  pendingClassName,
  title,
}: {
  label: string;
  pendingLabel: string;
  className: string;
  pendingClassName: string;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      className={pending ? pendingClassName : className}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
