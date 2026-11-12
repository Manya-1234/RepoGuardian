import React from "react";

export const Badge = ({
  children,
  variant = "default",
  size = "sm",
  className = "",
}) => {
  const variantClasses = {
    default: "bg-slate-800 text-slate-300 border-slate-700",
    indigo: "bg-indigo-950/80 text-indigo-300 border-indigo-700/60",
    emerald: "bg-emerald-950/80 text-emerald-300 border-emerald-700/60",
    amber: "bg-amber-950/80 text-amber-300 border-amber-700/60",
    rose: "bg-rose-950/80 text-rose-300 border-rose-700/60",
    sky: "bg-sky-950/80 text-sky-300 border-sky-700/60",
    purple: "bg-purple-950/80 text-purple-300 border-purple-700/60",

    // Priority variants
    low: "bg-slate-800/80 text-slate-400 border-slate-700",
    medium: "bg-sky-950/80 text-sky-400 border-sky-800",
    high: "bg-amber-950/80 text-amber-400 border-amber-800",
    urgent: "bg-rose-950/80 text-rose-400 border-rose-800 font-semibold",

    // Status variants
    todo: "bg-slate-800 text-slate-300 border-slate-700",
    in_progress: "bg-blue-950 text-blue-300 border-blue-700",
    in_review: "bg-amber-950 text-amber-300 border-amber-700",
    done: "bg-emerald-950 text-emerald-300 border-emerald-700",
  };

  const sizeClasses = {
    xs: "px-2 py-0.5 text-[11px]",
    sm: "px-2.5 py-1 text-xs",
    md: "px-3 py-1.5 text-sm",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border ${variantClasses[variant] || variantClasses.default} ${sizeClasses[size] || sizeClasses.sm} ${className}`}
    >
      {children}
    </span>
  );
};
